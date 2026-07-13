COMMENT ON SCHEMA "public" IS 'standard public schema';

CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";

ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke all on functions from public, anon, authenticated, service_role;

create schema private;

revoke all on schema private from public, anon, authenticated, service_role;

create extension if not exists pg_trgm with schema extensions;
create extension if not exists btree_gist with schema extensions;

grant usage on schema public, private to authenticated, service_role;

-- What an attachment is, as opposed to what its MIME string happens to say.
create type public.attachment_kind as enum ('image', 'audio', 'video', 'file');

-- How much a user wants to hear about a given conversation. Used by the
-- per-conversation settings in 05-chat, which is applied after this file.
-- Muting is not a level: see chat_notification_settings.
create type public.notification_level as enum ('mention', 'all');

-- Classification is universal: image/png is an image in a chat bubble and in a
-- post alike, so it is recorded once, here. Which types a given surface accepts,
-- and how large it lets them be, is a separate and per-surface decision that
-- lives with that surface (public.message_attachment_mime_types).
--
-- This has to precede 05-chat, which references it, hence its home in foundation.
create table public.mime_types (
  content_type text primary key,
  kind public.attachment_kind not null,
  created_at timestamptz not null default now()
);

alter table public.mime_types
  add constraint mime_types_content_type_check check (char_length(btrim(content_type)) between 1 and 255);

alter table public.mime_types enable row level security;

-- Every authenticated caller, not just accepted ones: private.is_accepted_user()
-- is defined in 01-identity and does not exist yet, and a table of MIME strings
-- carries nothing worth gating.
create policy mime_types_select on public.mime_types for select to authenticated using (true);

grant select on public.mime_types to authenticated;
grant select, insert, update, delete on public.mime_types to service_role;

create function private.require_service_role()
returns void language plpgsql stable security definer set search_path='' as $$
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role'
    and coalesce((nullif(current_setting('request.jwt.claims',true),'')::jsonb)->>'role','')<>'service_role'
    and session_user not in ('service_role','postgres')
  then raise exception 'service role required'; end if;
end $$;

revoke execute on function private.require_service_role() from public,anon,authenticated,service_role;

-- Shared storage-path validator: object name must be exactly p_prefix followed by a v4-style uuid.
-- Centralizes the uuid-suffix regex reused across identity, storage, and chat objects.
create function private.has_uuid_object_suffix(p_name text, p_prefix text)
returns boolean language sql immutable set search_path='' as $$
  select p_name ~ ('^' || p_prefix || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
$$;

revoke execute on function private.has_uuid_object_suffix(text,text) from public,anon,service_role;
grant execute on function private.has_uuid_object_suffix(text,text) to authenticated;

-- like/ilike 패턴에 들어갈 사용자 입력의 LIKE 메타문자(% _ \)를 무력화한다. 이스케이프하지 않으면
-- 검색어 '30%'의 %가 와일드카드가 되어, 같은 검색어가 서버 검색(search_posts/search_messages)과
-- 클라이언트 검색(message-search.ts, 단순 substring)에서 다른 결과를 낸다. 검색이 도메인마다
-- 같은 규칙이라는 약속을 지키려면 두 서버 검색이 이 함수를 통과해야 한다.
create function private.escape_like(p text)
returns text language sql immutable set search_path='' as $$
  select replace(replace(replace(p, '\', '\\'), '%', '\%'), '_', '\_')
$$;

revoke execute on function private.escape_like(text) from public,anon,service_role;
grant execute on function private.escape_like(text) to authenticated;

-- 검색 정규화의 유일한 정의. 게시글/메시지의 정규화 생성 컬럼도, 그 위의 trgm 인덱스도,
-- search_posts/search_messages RPC의 검색어도 전부 이 함수를 통과한다 -- 정규화 규칙이 여러 곳에
-- 복붙돼 조금씩 어긋나던 것을 하나로 모은다. 규칙: NFC로 정규화(macOS의 NFD 자모 분해 입력이
-- 완성형과 같게 매칭된다) -> 소문자 -> 모든 공백 제거. immutable이라야 생성 컬럼에서 쓸 수 있다.
-- null은 null로 흘려 암호화 메시지(content=null)가 인덱스에 빈 항목을 남기지 않게 한다.
-- app/lib/crypto/message-search.ts와 app/lib/group/format.ts의 JS 정규화가 이와 같아야 한다.
create function private.normalize_search(p text)
returns text language sql immutable set search_path='' as $$
  select case when p is null then null
    else regexp_replace(lower(normalize(p, nfc)), '\s+', '', 'g') end
$$;

revoke execute on function private.normalize_search(text) from public,anon,service_role;
grant execute on function private.normalize_search(text) to authenticated;
