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

-- How much a user wants to hear about a given target. Shared by the notification
-- feed (06-notifications) and per-conversation settings (05-chat), both of which
-- are applied after this file. Muting is not a level: see chat_notification_settings.
create type public.notification_level as enum ('mention', 'all');

-- Classification is universal: image/png is an image in a chat bubble and in a
-- post alike, so it is recorded once, here. Which types a given surface accepts,
-- and how large it lets them be, is a separate and per-surface decision that
-- lives with that surface (public.message_attachment_mime_types).
--
-- This has to precede 03-content and 05-chat, hence its home in foundation.
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
