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

create function private.require_service_role()
returns void language plpgsql stable security definer set search_path='' as $$
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role'
    and coalesce((nullif(current_setting('request.jwt.claims',true),'')::jsonb)->>'role','')<>'service_role'
    and session_user not in ('service_role','postgres')
  then raise exception 'service role required'; end if;
end $$;

revoke execute on function private.require_service_role() from public,anon,authenticated,service_role;

create type public.app_role as enum ('user', 'admin');
create type public.profile_gender as enum ('male', 'female');
create type public.profile_type as enum ('student', 'teacher', 'alumni');
create type public.profile_status as enum ('none', 'pending', 'accepted', 'rejected', 'withdrawn');

create table public.profiles (
  id bigserial primary key,
  auth_user_id uuid null references auth.users (id) on delete set null,
  pub_id uuid not null default gen_random_uuid(),
  name text not null,
  anonymous_username text null,
  role public.app_role not null default 'user',
  type public.profile_type not null default 'student',
  student_number char(6) null,
  class_no int2 null,
  cohort int2 null,
  gender public.profile_gender null,
  phone_number text null,
  avatar_url text null,
  birthday date null,
  description text null,
  status public.profile_status not null default 'none',
  dorm_room int2 null,
  onboarding_completed_at timestamptz null,
  status_updated_at timestamptz null,
  status_updated_by bigint null references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz null,
  deleted_at timestamptz null
);

create table public.permissions (
  key text primary key,
  name text not null,
  description text null,
  created_at timestamptz not null default now()
);

create table public.user_permissions (
  user_id bigint not null references public.profiles (id) on delete restrict,
  permission_key text not null references public.permissions (key) on delete restrict,
  granted_at timestamptz not null default now(),
  granted_by bigint null references public.profiles (id) on delete set null,
  primary key (user_id, permission_key)
);

create index idx_profiles_status_deleted_at on public.profiles (status, deleted_at);

alter table public.profiles
  add constraint profiles_auth_user_id_key unique (auth_user_id),
  add constraint profiles_pub_id_key unique (pub_id),
  add constraint profiles_student_number_key unique (student_number),
  add constraint profiles_cohort_check check (cohort is null or cohort between 1 and 100),
  add constraint profiles_class_no_check check (class_no is null or class_no > 0),
  add constraint profiles_student_number_check check (student_number is null or student_number ~ '^\d{6}$'),
  add constraint profiles_phone_number_check check (phone_number is null or phone_number ~ '^\+?[0-9]{8,15}$'),
  add constraint profiles_dorm_room_check check (dorm_room is null or dorm_room > 0),
  add constraint profiles_student_identity_check check (
    deleted_at is not null
    or status = 'none'
    or type <> 'student'
    or (student_number is not null and cohort is not null)
  ),
  add constraint profiles_name_check check (char_length(btrim(name)) between 1 and 50),
  add constraint profiles_anonymous_username_check check (
    anonymous_username is null
    or char_length(btrim(anonymous_username)) between 1 and 50
  ),
  add constraint profiles_description_check check (
    description is null or char_length(description) <= 2000
  );

create unique index profiles_anonymous_username_normalized_key
on public.profiles (lower(btrim(anonymous_username)))
where anonymous_username is not null;

create function private.handle_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  display_name text;
begin
  display_name := left(
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
      '사용자'
    ),
    50
  );

  insert into public.profiles (auth_user_id, name)
  values (new.id, display_name);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_auth_user_created();

create function private.current_profile_id()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from public.profiles as p
  where p.auth_user_id = (select auth.uid())
  order by p.id
  limit 1
$$;

create function private.is_accepted_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles as p
    where p.auth_user_id = (select auth.uid())
      and p.status = 'accepted'
      and p.deleted_at is null
  )
$$;

revoke execute on function private.handle_auth_user_created() from public, anon, authenticated, service_role;
revoke execute on function private.current_profile_id() from public, anon, authenticated, service_role;
revoke execute on function private.is_accepted_user() from public, anon, authenticated, service_role;

create function private.is_app_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where auth_user_id=(select auth.uid()) and status='accepted' and deleted_at is null and role='admin')
$$;
create function private.has_permission(p_permission_key text)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_accepted_user() and exists(select 1 from public.user_permissions where user_id=private.current_profile_id() and permission_key=p_permission_key)
$$;
revoke execute on function private.is_app_admin() from public, anon, service_role;
revoke execute on function private.has_permission(text) from public, anon, service_role;
grant execute on function private.is_app_admin(), private.has_permission(text) to authenticated;

create function private.handle_auth_user_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_id bigint;
begin
  select id into profile_id from public.profiles where auth_user_id = old.id for update;
  if profile_id is null then
    return old;
  end if;

  if exists (
    select 1 from public.profiles where id = profile_id and role = 'admin'
  ) or exists (
    select 1
    from public.space_members as sm
    join public.spaces as s on s.id = sm.space_id
    where sm.user_id = profile_id
      and sm.role = 'owner'
      and s.deleted_at is null
  ) then
    raise exception 'transfer owner/admin responsibilities before deleting auth user';
  end if;

  update public.profiles
  set auth_user_id = null,
      name = '탈퇴한 사용자',
      anonymous_username = null,
      role = 'user',
      student_number = null,
      class_no = null,
      cohort = null,
      gender = null,
      phone_number = null,
      avatar_url = null,
      birthday = null,
      description = null,
      status = 'withdrawn',
      dorm_room = null,
      status_updated_at = now(),
      status_updated_by = null,
      deleted_at = now()
  where id = profile_id;

  return old;
end;
$$;

create trigger on_auth_user_deleted
before delete on auth.users
for each row execute function private.handle_auth_user_deleted();

revoke execute on function private.handle_auth_user_deleted() from public, anon, authenticated, service_role;

create function private.require_current_profile(p_accepted boolean default true)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  profile_id bigint;
begin
  select p.id into profile_id
  from public.profiles as p
  where p.auth_user_id = (select auth.uid())
    and p.deleted_at is null
    and (not p_accepted or p.status = 'accepted');
  if profile_id is null then raise exception 'active profile required'; end if;
  return profile_id;
end;
$$;

create function private.require_app_admin()
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare profile_id bigint := private.require_current_profile(true);
begin
  if not exists (select 1 from public.profiles where id = profile_id and role = 'admin') then
    raise exception 'app admin required';
  end if;
  return profile_id;
end;
$$;

revoke execute on function private.require_current_profile(boolean) from public, anon, authenticated, service_role;
revoke execute on function private.require_app_admin() from public, anon, authenticated, service_role;

alter table public.profiles enable row level security;
alter table public.permissions enable row level security;
alter table public.user_permissions enable row level security;

create policy profiles_select
on public.profiles
for select
to authenticated
using (
  id = (select private.current_profile_id())
  or (
    (select private.is_accepted_user())
    and status = 'accepted'
    and deleted_at is null
  )
);

create policy profiles_update
on public.profiles
for update
to authenticated
using (
  id = (select private.current_profile_id())
  and (select private.is_accepted_user())
)
with check (
  id = (select private.current_profile_id())
  and (select private.is_accepted_user())
);

create policy permissions_select
on public.permissions
for select
to authenticated
using ((select private.is_accepted_user()));

create policy user_permissions_select
on public.user_permissions
for select
to authenticated
using (user_id = (select private.current_profile_id()));

grant usage on schema public, private to authenticated;
grant execute on function private.current_profile_id() to authenticated;
grant execute on function private.is_accepted_user() to authenticated;

grant select on table public.profiles, public.permissions, public.user_permissions to authenticated;
grant update (name, gender, phone_number, birthday, description) on table public.profiles
to authenticated;

grant usage on schema public, private to service_role;
grant select, insert, update, delete
on table public.profiles, public.permissions, public.user_permissions
to service_role;
grant usage, select on sequence public.profiles_id_seq to service_role;

create function public.submit_onboarding(p_name text,p_type public.profile_type,p_student_number char(6),p_class_no int2,p_cohort int2,p_gender public.profile_gender,p_phone_number text,p_birthday date,p_description text,p_dorm_room int2)
returns void language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(false);
begin
  update public.profiles set name=btrim(p_name),type=p_type,student_number=p_student_number,class_no=p_class_no,cohort=p_cohort,gender=p_gender,phone_number=p_phone_number,birthday=p_birthday,description=p_description,dorm_room=p_dorm_room,onboarding_completed_at=now(),status='pending',status_updated_at=now(),status_updated_by=null
  where id=caller_id and status in ('none','rejected');
  if not found then raise exception 'onboarding not allowed'; end if;
end;
$$;

create function public.review_profile(p_profile_id bigint,p_status public.profile_status)
returns void language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_app_admin();
begin
  if p_status not in ('accepted','rejected') then raise exception 'invalid review status'; end if;
  update public.profiles set status=p_status,status_updated_at=now(),status_updated_by=caller_id where id=p_profile_id and status='pending';
  if not found then raise exception 'pending profile not found'; end if;
end;
$$;

create function public.set_anonymous_username(p_value text)
returns void language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(false);
begin
  update public.profiles set anonymous_username=case when p_value is null then null else btrim(p_value) end
  where id=caller_id and status<>'withdrawn';
  if not found then raise exception 'withdrawn profile cannot change anonymous username'; end if;
end;
$$;

create function public.withdraw_profile()
returns void language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true);
begin
  perform 1 from public.profiles where id=caller_id for update;
  if exists(select 1 from public.profiles where id=caller_id and role='admin') or exists(select 1 from public.space_members sm join public.spaces s on s.id=sm.space_id where sm.user_id=caller_id and sm.role='owner' and s.deleted_at is null)
    then raise exception 'transfer owner/admin responsibilities first'; end if;
  update public.profiles set name='탈퇴한 사용자',anonymous_username=null,role='user',student_number=null,class_no=null,cohort=null,gender=null,phone_number=null,avatar_url=null,birthday=null,description=null,status='withdrawn',dorm_room=null,status_updated_at=now(),status_updated_by=null,deleted_at=now() where id=caller_id;
end;
$$;

create function public.finalize_avatar(p_storage_path text)
returns void language plpgsql security definer set search_path='' as $$
declare caller_id bigint:=private.require_current_profile(false); expected_prefix text:=(select auth.uid())::text||'/';
begin
  if p_storage_path not like expected_prefix||'%' or p_storage_path !~ '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or not exists(select 1 from storage.objects where bucket_id='avatars' and name=p_storage_path and created_at>=now()-interval '24 hours' and coalesce(metadata->>'mimetype','') in ('image/jpeg','image/png','image/webp'))
    then raise exception 'invalid avatar object'; end if;
  update public.profiles set avatar_url=p_storage_path where id=caller_id;
end $$;

revoke execute on function public.submit_onboarding(text,public.profile_type,char,int2,int2,public.profile_gender,text,date,text,int2), public.review_profile(bigint,public.profile_status), public.set_anonymous_username(text), public.withdraw_profile() from public, anon, authenticated, service_role;
grant execute on function public.submit_onboarding(text,public.profile_type,char,int2,int2,public.profile_gender,text,date,text,int2), public.review_profile(bigint,public.profile_status), public.set_anonymous_username(text) to authenticated;
grant execute on function public.withdraw_profile(), public.finalize_avatar(text) to authenticated;
revoke execute on function public.finalize_avatar(text) from public, anon, service_role;

create function public.bootstrap_first_app_admin(p_profile_id bigint)
returns void language plpgsql security definer set search_path='' as $$
begin perform private.require_service_role(); perform pg_advisory_xact_lock(hashtextextended('public.app_admin_set',0)); if exists(select 1 from public.profiles where role='admin') then raise exception 'app admin already exists'; end if; update public.profiles set role='admin' where id=p_profile_id and status='accepted' and deleted_at is null; if not found then raise exception 'accepted profile required'; end if; end $$;
grant execute on function public.bootstrap_first_app_admin(bigint) to service_role;
revoke execute on function public.bootstrap_first_app_admin(bigint) from public, anon, authenticated;

create type public.member_role as enum ('owner', 'admin', 'manager', 'member');
create type public.notification_setting as enum ('off', 'mentions', 'all');
create type public.space_join_policy as enum ('auto_join', 'invite_only');
create type public.space_type as enum ('group', 'community');

create table public.spaces (
  id bigserial primary key,
  pub_id uuid not null default gen_random_uuid(),
  type public.space_type not null,
  name text not null,
  description text null,
  image_url text null,
  join_policy public.space_join_policy not null default 'auto_join',
  member_count int4 not null default 0,
  created_by bigint null references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz null,
  deleted_at timestamptz null,
  deleted_by bigint null references public.profiles (id) on delete set null
);

create table public.space_members (
  space_id bigint not null references public.spaces (id) on delete restrict,
  user_id bigint not null references public.profiles (id) on delete restrict,
  role public.member_role not null default 'member',
  notification_setting public.notification_setting not null default 'mentions',
  banned_at timestamptz null,
  banned_by bigint null references public.profiles (id) on delete set null,
  ban_reason text null,
  joined_at timestamptz not null default now(),
  primary key (space_id, user_id)
);

create index idx_spaces_active_directory on public.spaces (join_policy, member_count)
where deleted_at is null;
create index idx_space_members_user_joined_at on public.space_members (user_id, joined_at);
create index idx_space_members_space_role on public.space_members (space_id, role);
create index idx_space_members_active_user_space on public.space_members (user_id, space_id)
where banned_at is null;

alter table public.spaces
  add constraint spaces_pub_id_key unique (pub_id),
  add constraint spaces_member_count_check check (member_count >= 0),
  add constraint spaces_name_check check (char_length(btrim(name)) between 1 and 100),
  add constraint spaces_description_check check (
    description is null or char_length(description) <= 5000
  ),
  add constraint spaces_deleted_state_check check (deleted_at is not null or deleted_by is null);

create unique index spaces_active_group_name_key
on public.spaces (lower(btrim(name)))
where type = 'group' and deleted_at is null;

alter table public.space_members
  add constraint space_members_ban_state_check check (
    (banned_at is null and banned_by is null)
    or banned_at is not null
  ),
  add constraint space_members_ban_reason_check check (
    ban_reason is null or char_length(ban_reason) <= 1000
  );

create unique index space_members_one_owner_key
on public.space_members (space_id)
where role = 'owner';

create function private.is_space_member(p_space_id bigint,p_allowed_roles public.member_role[] default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.space_members sm join public.spaces s on s.id=sm.space_id join public.profiles p on p.id=sm.user_id
    where sm.space_id=p_space_id and p.auth_user_id=(select auth.uid()) and p.status='accepted' and p.deleted_at is null and s.deleted_at is null and sm.banned_at is null
      and (p_allowed_roles is null or sm.role=any(p_allowed_roles)))
$$;
create function private.can_manage_space(p_space_id bigint,p_allowed_roles public.member_role[] default array['owner','admin']::public.member_role[])
returns boolean language sql stable security definer set search_path = '' as $$ select private.is_space_member(p_space_id,p_allowed_roles) $$;
revoke execute on function private.is_space_member(bigint,public.member_role[]), private.can_manage_space(bigint,public.member_role[]) from public, anon, service_role;
grant execute on function private.is_space_member(bigint,public.member_role[]),private.can_manage_space(bigint,public.member_role[]) to authenticated;

create function private.validate_space_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_space_id bigint := case when tg_op='DELETE' then old.space_id else new.space_id end;
begin
  if not exists (select 1 from public.spaces where id = affected_space_id) then
    return null;
  end if;
  if (select count(*) from public.space_members where space_id = affected_space_id and role = 'owner') <> 1 then
    raise exception 'active space must have exactly one owner';
  end if;
  return null;
end;
$$;

create constraint trigger trg_validate_space_owner
after insert or update or delete on public.space_members
deferrable initially deferred
for each row execute function private.validate_space_owner();

revoke execute on function private.validate_space_owner() from public, anon, authenticated, service_role;

alter table public.spaces enable row level security;
alter table public.space_members enable row level security;
create policy spaces_select on public.spaces for select to authenticated using (private.is_accepted_user() and deleted_at is null);
create policy space_members_select on public.space_members for select to authenticated using (private.is_space_member(space_id));
create policy space_members_update on public.space_members for update to authenticated using (user_id=private.current_profile_id() and private.is_space_member(space_id)) with check (user_id=private.current_profile_id() and private.is_space_member(space_id));

grant select (id,pub_id,type,name,description,image_url,join_policy,member_count,created_at,deleted_at) on public.spaces to authenticated;
grant select on public.space_members to authenticated;
grant update (notification_setting) on public.space_members to authenticated;
grant select, insert, update, delete on public.spaces, public.space_members to service_role;
grant usage, select on sequence public.spaces_id_seq to service_role;

create table public.posts (
  id bigserial primary key,
  pub_id uuid not null default gen_random_uuid(),
  space_id bigint not null references public.spaces (id) on delete restrict,
  author_id bigint not null references public.profiles (id) on delete restrict,
  title text not null,
  content text not null,
  is_anonymous boolean not null default false,
  is_pinned boolean not null default false,
  pinned_at timestamptz null,
  pinned_by bigint null references public.profiles (id) on delete set null,
  comment_count int4 not null default 0,
  reaction_count int4 not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz null,
  deleted_at timestamptz null,
  deleted_by bigint null references public.profiles (id) on delete set null
);

create table public.post_attachments (
  id bigserial primary key,
  post_id bigint not null references public.posts (id) on delete restrict,
  storage_bucket text not null,
  storage_path text not null,
  file_name text not null,
  content_type text not null,
  size_bytes int8 null,
  sort_order int4 not null default 0,
  alt text null,
  width int4 null,
  height int4 null,
  created_at timestamptz not null default now()
);

create table public.comments (
  id bigserial primary key,
  post_id bigint not null references public.posts (id) on delete restrict,
  author_id bigint not null references public.profiles (id) on delete restrict,
  parent_id bigint null references public.comments (id) on delete restrict,
  content text not null,
  is_anonymous boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz null,
  deleted_at timestamptz null,
  deleted_by bigint null references public.profiles (id) on delete set null
);

create index idx_posts_author_created_at on public.posts (author_id, created_at);
create index idx_posts_active_space_created_at on public.posts (space_id, created_at desc, id desc)
where deleted_at is null;
create index idx_posts_pinned on public.posts (space_id, pinned_at desc)
where is_pinned = true and deleted_at is null;

create index idx_comments_tree on public.comments (post_id, parent_id, created_at);
create index idx_posts_title_search_gin on public.posts
  using gin (regexp_replace(lower(title), '\s+', '', 'g') extensions.gin_trgm_ops)
  where deleted_at is null;
create index idx_posts_content_search_gin on public.posts
  using gin (regexp_replace(lower(content), '\s+', '', 'g') extensions.gin_trgm_ops)
  where deleted_at is null;
create index idx_comments_content_search_gin on public.comments
  using gin (regexp_replace(lower(content), '\s+', '', 'g') extensions.gin_trgm_ops)
  where deleted_at is null;

alter table public.posts
  add constraint posts_pub_id_key unique (pub_id),
  add constraint posts_comment_count_check check (comment_count >= 0),
  add constraint posts_reaction_count_check check (reaction_count >= 0),
  add constraint posts_title_check check (char_length(btrim(title)) between 1 and 200),
  add constraint posts_content_check check (char_length(btrim(content)) between 1 and 50000),
  add constraint posts_deleted_state_check check (deleted_at is not null or deleted_by is null),
  add constraint posts_pin_state_check check (
    (is_pinned = false and pinned_at is null and pinned_by is null)
    or (is_pinned = true and pinned_at is not null)
  );

alter table public.post_attachments
  add constraint post_attachments_post_sort_key unique (post_id, sort_order),
  add constraint post_attachments_storage_key unique (storage_bucket, storage_path),
  add constraint post_attachments_bucket_check check (storage_bucket = 'post-files'),
  add constraint post_attachments_storage_path_check check (
    char_length(storage_path) between 1 and 1024
    and storage_path !~ '(^|/)\.\.?(/|$)'
  ),
  add constraint post_attachments_file_name_check check (char_length(btrim(file_name)) between 1 and 255),
  add constraint post_attachments_content_type_check check (char_length(btrim(content_type)) between 1 and 255),
  add constraint post_attachments_size_check check (size_bytes is null or size_bytes >= 0),
  add constraint post_attachments_sort_order_check check (sort_order >= 0),
  add constraint post_attachments_alt_check check (alt is null or char_length(alt) <= 1000);

alter table public.comments
  add constraint comments_parent_check check (parent_id is null or parent_id <> id),
  add constraint comments_content_check check (char_length(btrim(content)) between 1 and 10000),
  add constraint comments_deleted_state_check check (deleted_at is not null or deleted_by is null);

create function private.can_access_post(p_post_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.posts p where p.id=p_post_id and p.deleted_at is null and private.is_space_member(p.space_id))
$$;
create function private.can_access_comment(p_comment_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.comments c where c.id=p_comment_id and c.deleted_at is null and private.can_access_post(c.post_id))
$$;
create function private.has_active_direct_reply(p_comment_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.comments where parent_id=p_comment_id and deleted_at is null)
$$;
revoke execute on function private.can_access_post(bigint), private.can_access_comment(bigint), private.has_active_direct_reply(bigint) from public, anon, service_role;
grant execute on function private.can_access_post(bigint), private.can_access_comment(bigint), private.has_active_direct_reply(bigint) to authenticated;

create function private.validate_comment_parent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.parent_id is not null and not exists (
    select 1
    from public.comments as parent
    where parent.id = new.parent_id
      and parent.post_id = new.post_id
      and parent.parent_id is null
      and parent.deleted_at is null
  ) then
    raise exception 'comment parent must be an active top-level comment on the same post';
  end if;
  return new;
end;
$$;

create trigger trg_validate_comment_parent
before insert or update of post_id, parent_id on public.comments
for each row execute function private.validate_comment_parent();

revoke execute on function private.validate_comment_parent() from public, anon, authenticated, service_role;

alter table public.posts enable row level security;
alter table public.post_attachments enable row level security;
alter table public.comments enable row level security;
create policy posts_select on public.posts for select to authenticated using (deleted_at is null and private.is_space_member(space_id));
create policy posts_insert on public.posts for insert to authenticated with check (author_id=private.current_profile_id() and private.is_space_member(space_id));
create policy posts_update on public.posts for update to authenticated using (deleted_at is null and author_id=private.current_profile_id() and private.is_space_member(space_id)) with check (deleted_at is null and author_id=private.current_profile_id() and private.is_space_member(space_id));
create policy post_attachments_select on public.post_attachments for select to authenticated using (private.can_access_post(post_id));

create policy comments_select on public.comments for select to authenticated using (private.can_access_post(post_id) and (deleted_at is null or private.has_active_direct_reply(id)));
create policy comments_insert on public.comments for insert to authenticated with check (author_id=private.current_profile_id() and private.can_access_post(post_id));
create policy comments_update on public.comments for update to authenticated using (deleted_at is null and author_id=private.current_profile_id() and private.can_access_post(post_id)) with check (deleted_at is null and author_id=private.current_profile_id() and private.can_access_post(post_id));

grant select on public.posts, public.post_attachments, public.comments to authenticated;
grant insert (space_id,author_id,title,content,is_anonymous) on public.posts to authenticated;
grant update (title,content,is_anonymous) on public.posts to authenticated;
grant insert (post_id,author_id,parent_id,content,is_anonymous) on public.comments to authenticated;
grant update (content) on public.comments to authenticated;
grant usage, select on sequence public.posts_id_seq, public.comments_id_seq to authenticated;
grant select, insert, update, delete on public.posts, public.post_attachments, public.comments to service_role;
grant usage, select on sequence public.posts_id_seq, public.post_attachments_id_seq, public.comments_id_seq to service_role;

create table public.reaction_types (
  id bigserial primary key,
  key text not null,
  name text not null,
  icon text null,
  sort_order int2 not null default 0,
  created_at timestamptz not null default now()
);

create table public.post_reactions (
  id bigserial primary key,
  post_id bigint not null references public.posts (id) on delete restrict,
  user_id bigint not null references public.profiles (id) on delete restrict,
  reaction_type_id bigint not null references public.reaction_types (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz null
);

create table public.comment_reactions (
  id bigserial primary key,
  comment_id bigint not null references public.comments (id) on delete restrict,
  user_id bigint not null references public.profiles (id) on delete restrict,
  reaction_type_id bigint not null references public.reaction_types (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz null
);

create index idx_post_reactions_type_count on public.post_reactions (post_id, reaction_type_id);
create index idx_post_reactions_user_created_at on public.post_reactions (user_id, created_at);
create index idx_comment_reactions_type_count on public.comment_reactions (comment_id, reaction_type_id);
create index idx_comment_reactions_user_created_at on public.comment_reactions (user_id, created_at);

alter table public.reaction_types
  add constraint reaction_types_key_key unique (key),
  add constraint reaction_types_key_check check (char_length(btrim(key)) between 1 and 100),
  add constraint reaction_types_name_check check (char_length(btrim(name)) between 1 and 100);

alter table public.post_reactions
  add constraint post_reactions_post_user_key unique (post_id, user_id);
alter table public.comment_reactions
  add constraint comment_reactions_comment_user_key unique (comment_id, user_id);

alter table public.reaction_types enable row level security;
alter table public.post_reactions enable row level security;
alter table public.comment_reactions enable row level security;
create policy reaction_types_select on public.reaction_types for select to authenticated using (private.is_accepted_user());
create policy post_reactions_select on public.post_reactions for select to authenticated using (private.can_access_post(post_id));
create policy post_reactions_insert on public.post_reactions for insert to authenticated with check (user_id=private.current_profile_id() and private.can_access_post(post_id));
create policy post_reactions_update on public.post_reactions for update to authenticated using (user_id=private.current_profile_id() and private.can_access_post(post_id)) with check (user_id=private.current_profile_id() and private.can_access_post(post_id));
create policy post_reactions_delete on public.post_reactions for delete to authenticated using (user_id=private.current_profile_id() and private.can_access_post(post_id));
create policy comment_reactions_select on public.comment_reactions for select to authenticated using (private.can_access_comment(comment_id));
create policy comment_reactions_insert on public.comment_reactions for insert to authenticated with check (user_id=private.current_profile_id() and private.can_access_comment(comment_id));
create policy comment_reactions_update on public.comment_reactions for update to authenticated using (user_id=private.current_profile_id() and private.can_access_comment(comment_id)) with check (user_id=private.current_profile_id() and private.can_access_comment(comment_id));
create policy comment_reactions_delete on public.comment_reactions for delete to authenticated using (user_id=private.current_profile_id() and private.can_access_comment(comment_id));

grant select on public.reaction_types, public.post_reactions, public.comment_reactions to authenticated;
grant insert (post_id,user_id,reaction_type_id) on public.post_reactions to authenticated;
grant insert (comment_id,user_id,reaction_type_id) on public.comment_reactions to authenticated;
grant update (reaction_type_id) on public.post_reactions,public.comment_reactions to authenticated;
grant delete on public.post_reactions,public.comment_reactions to authenticated;
grant usage, select on sequence public.post_reactions_id_seq, public.comment_reactions_id_seq to authenticated;
grant select, insert, update, delete on public.reaction_types, public.post_reactions, public.comment_reactions to service_role;
grant usage, select on sequence public.reaction_types_id_seq, public.post_reactions_id_seq, public.comment_reactions_id_seq to service_role;

create table public.chat_rooms (
  id bigserial primary key,
  name text null,
  is_group boolean not null default false,
  created_by bigint null references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.direct_chat_pairs (
  room_id bigint primary key references public.chat_rooms (id) on delete cascade,
  user1_id bigint not null references public.profiles (id) on delete restrict,
  user2_id bigint not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.chat_room_members (
  room_id bigint not null references public.chat_rooms (id) on delete restrict,
  user_id bigint not null references public.profiles (id) on delete restrict,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table public.messages (
  id bigserial primary key,
  room_id bigint not null references public.chat_rooms (id) on delete restrict,
  sender_id bigint not null references public.profiles (id) on delete restrict,
  parent_id bigint null references public.messages (id) on delete restrict,
  content text null,
  is_edited boolean not null default false,
  edited_at timestamptz null,
  deleted_at timestamptz null,
  deleted_by bigint null references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.message_attachments (
  id bigserial primary key,
  message_id bigint not null references public.messages (id) on delete restrict,
  storage_bucket text not null,
  storage_path text not null,
  file_name text not null,
  content_type text not null,
  size_bytes int8 null,
  sort_order int4 not null default 0,
  width int4 null,
  height int4 null,
  created_at timestamptz not null default now()
);

create table public.message_reactions (
  id bigserial primary key,
  message_id bigint not null references public.messages (id) on delete restrict,
  user_id bigint not null references public.profiles (id) on delete restrict,
  reaction_type_id bigint not null references public.reaction_types (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz null
);

create table public.chat_room_read_states (
  room_id bigint not null references public.chat_rooms (id) on delete restrict,
  user_id bigint not null references public.profiles (id) on delete restrict,
  last_read_message_id bigint null references public.messages (id) on delete restrict,
  last_read_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create index idx_direct_chat_pairs_user1_created_at on public.direct_chat_pairs (user1_id, created_at);
create index idx_direct_chat_pairs_user2_created_at on public.direct_chat_pairs (user2_id, created_at);
create index idx_chat_room_members_user_joined_at on public.chat_room_members (user_id, joined_at);
create index idx_chat_room_members_user_room on public.chat_room_members (user_id, room_id);
create index idx_messages_sender_created_at on public.messages (sender_id, created_at);
create index idx_messages_parent_created_at on public.messages (parent_id, created_at);
create index idx_messages_active_room_id on public.messages (room_id, id desc)
where deleted_at is null;
create index idx_message_reactions_type_count on public.message_reactions (message_id, reaction_type_id);
create index idx_message_reactions_user_created_at on public.message_reactions (user_id, created_at);
create index idx_chat_room_read_states_user_last_read_at on public.chat_room_read_states (user_id, last_read_at);
create index idx_messages_content_search_gin on public.messages
  using gin (regexp_replace(lower(content), '\s+', '', 'g') extensions.gin_trgm_ops)
  where deleted_at is null;

alter table public.chat_rooms
  add constraint chat_rooms_name_check check (
    (is_group = false and name is null)
    or (is_group = true and char_length(btrim(name)) between 1 and 100)
  );

alter table public.direct_chat_pairs
  add constraint direct_chat_pairs_users_check check (user1_id < user2_id),
  add constraint direct_chat_pairs_users_key unique (user1_id, user2_id);

alter table public.messages
  add constraint messages_parent_check check (parent_id is null or parent_id <> id),
  add constraint messages_content_check check (content is null or char_length(btrim(content)) between 1 and 10000),
  add constraint messages_deleted_state_check check (deleted_at is not null or deleted_by is null),
  add constraint messages_edit_state_check check (
    (is_edited = false and edited_at is null)
    or (is_edited = true and edited_at is not null)
  );

alter table public.message_attachments
  add constraint message_attachments_message_sort_key unique (message_id, sort_order),
  add constraint message_attachments_storage_key unique (storage_bucket, storage_path),
  add constraint message_attachments_bucket_check check (storage_bucket = 'message-files'),
  add constraint message_attachments_storage_path_check check (
    char_length(storage_path) between 1 and 1024
    and storage_path !~ '(^|/)\.\.?(/|$)'
  ),
  add constraint message_attachments_file_name_check check (char_length(btrim(file_name)) between 1 and 255),
  add constraint message_attachments_content_type_check check (char_length(btrim(content_type)) between 1 and 255),
  add constraint message_attachments_size_check check (size_bytes is null or size_bytes >= 0),
  add constraint message_attachments_sort_order_check check (sort_order >= 0);

alter table public.message_reactions
  add constraint message_reactions_message_user_key unique (message_id, user_id);

create function private.is_room_member(p_room_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_accepted_user() and exists(select 1 from public.chat_room_members where room_id=p_room_id and user_id=private.current_profile_id())
$$;
create function private.can_access_message(p_message_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.messages m where m.id=p_message_id and m.deleted_at is null and private.is_room_member(m.room_id))
$$;
create function private.is_valid_message_parent(p_parent_id bigint,p_room_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_parent_id is null or exists(select 1 from public.messages m where m.id=p_parent_id and m.room_id=p_room_id and m.deleted_at is null)
$$;
create function private.has_active_message_reply(p_message_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.messages where parent_id=p_message_id and deleted_at is null)
$$;
revoke execute on function private.is_room_member(bigint), private.can_access_message(bigint), private.is_valid_message_parent(bigint,bigint), private.has_active_message_reply(bigint) from public, anon, service_role;
grant execute on function private.is_room_member(bigint), private.can_access_message(bigint), private.is_valid_message_parent(bigint,bigint), private.has_active_message_reply(bigint) to authenticated;

create function private.validate_message_parent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.parent_id is not null and not exists (
    select 1
    from public.messages as parent
    where parent.id = new.parent_id
      and parent.room_id = new.room_id
      and parent.parent_id is null
      and parent.deleted_at is null
  ) then
    raise exception 'message parent must be an active top-level message in the same room';
  end if;
  return new;
end;
$$;

create trigger trg_validate_message_parent
before insert or update of room_id, parent_id on public.messages
for each row execute function private.validate_message_parent();

create function private.mark_message_edited()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.deleted_at is null and new.deleted_at is null and new.content is distinct from old.content then
    new.is_edited := true;
    new.edited_at := now();
  end if;
  return new;
end;
$$;

create trigger trg_mark_message_edited
before update of content on public.messages
for each row execute function private.mark_message_edited();

create function private.validate_direct_chat()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_room_id bigint := case when tg_op='DELETE' then old.room_id else new.room_id end;
  pair public.direct_chat_pairs%rowtype;
begin
  if tg_op = 'DELETE' and exists (select 1 from public.chat_rooms where id = old.room_id) then
    raise exception 'direct chat pair cannot be deleted while its room exists';
  end if;
  select * into pair from public.direct_chat_pairs where room_id = affected_room_id;
  if not found then
    return null;
  end if;

  if not exists (
    select 1 from public.chat_rooms
    where id = affected_room_id and is_group = false and name is null
  ) then
    raise exception 'direct chat pair must reference a direct room';
  end if;

  if (select count(*) from public.chat_room_members where room_id = affected_room_id) <> 2
    or not exists (
      select 1 from public.chat_room_members
      where room_id = affected_room_id and user_id = pair.user1_id
    )
    or not exists (
      select 1 from public.chat_room_members
      where room_id = affected_room_id and user_id = pair.user2_id
    )
  then
    raise exception 'direct chat memberships must exactly match the pair';
  end if;
  return null;
end;
$$;

create constraint trigger trg_validate_direct_chat_pair
after insert or update or delete on public.direct_chat_pairs
deferrable initially deferred
for each row execute function private.validate_direct_chat();

create constraint trigger trg_validate_direct_chat_member
after insert or update or delete on public.chat_room_members
deferrable initially deferred
for each row execute function private.validate_direct_chat();

create function private.validate_direct_chat_room()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.direct_chat_pairs where room_id=new.id)
    and (new.is_group or new.name is not null)
  then
    raise exception 'direct chat room must remain non-group with no name';
  end if;
  return new;
end;
$$;

create trigger trg_validate_direct_chat_room
before update of is_group,name on public.chat_rooms
for each row execute function private.validate_direct_chat_room();

create function private.validate_chat_read_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.last_read_message_id is not null and not exists (
    select 1 from public.messages
    where id = new.last_read_message_id
      and room_id = new.room_id
      and deleted_at is null
  ) then
    raise exception 'last read message must be active and in the same room';
  end if;

  if tg_op = 'UPDATE'
    and old.last_read_message_id is not null
    and (new.last_read_message_id is null or new.last_read_message_id < old.last_read_message_id)
  then
    raise exception 'last read message may only move forward';
  end if;

  new.last_read_at := now();
  return new;
end;
$$;

create trigger trg_validate_chat_read_state
before insert or update of room_id, last_read_message_id on public.chat_room_read_states
for each row execute function private.validate_chat_read_state();

revoke execute on function private.validate_message_parent() from public, anon, authenticated, service_role;
revoke execute on function private.mark_message_edited() from public, anon, authenticated, service_role;
revoke execute on function private.validate_direct_chat() from public, anon, authenticated, service_role;
revoke execute on function private.validate_direct_chat_room() from public, anon, authenticated, service_role;
revoke execute on function private.validate_chat_read_state() from public, anon, authenticated, service_role;

alter table public.chat_rooms enable row level security;
alter table public.direct_chat_pairs enable row level security;
alter table public.chat_room_members enable row level security;
alter table public.messages enable row level security;
alter table public.message_attachments enable row level security;
alter table public.message_reactions enable row level security;
alter table public.chat_room_read_states enable row level security;
create policy chat_rooms_select on public.chat_rooms for select to authenticated using (private.is_room_member(id));
create policy direct_chat_pairs_select on public.direct_chat_pairs for select to authenticated using (private.is_room_member(room_id));
create policy chat_room_members_select on public.chat_room_members for select to authenticated using (private.is_room_member(room_id));
create policy messages_select on public.messages for select to authenticated using ((deleted_at is null or private.has_active_message_reply(id)) and private.is_room_member(room_id));
create policy message_attachments_select on public.message_attachments for select to authenticated using (private.can_access_message(message_id));
create policy message_reactions_select on public.message_reactions for select to authenticated using (private.can_access_message(message_id));
create policy chat_room_read_states_select on public.chat_room_read_states for select to authenticated using (user_id=private.current_profile_id() and private.is_room_member(room_id));

grant select on public.chat_rooms, public.direct_chat_pairs, public.chat_room_members, public.messages, public.message_attachments, public.message_reactions, public.chat_room_read_states to authenticated;
grant select, insert, update, delete on public.chat_rooms, public.direct_chat_pairs, public.chat_room_members, public.messages, public.message_attachments, public.message_reactions, public.chat_room_read_states to service_role;
grant usage, select on sequence public.chat_rooms_id_seq, public.messages_id_seq, public.message_attachments_id_seq, public.message_reactions_id_seq to service_role;

create function public.create_direct_chat(p_other_user_id bigint)
returns bigint language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true); first_id bigint; second_id bigint; room_id bigint;
begin
  if caller_id=p_other_user_id or not exists (select 1 from public.profiles where id=p_other_user_id and status='accepted' and deleted_at is null)
    then raise exception 'accepted different target required'; end if;
  first_id:=least(caller_id,p_other_user_id); second_id:=greatest(caller_id,p_other_user_id);
  perform pg_advisory_xact_lock(hashtextextended(first_id::text||':'||second_id::text,0));
  select dcp.room_id into room_id from public.direct_chat_pairs dcp where dcp.user1_id=first_id and dcp.user2_id=second_id;
  if room_id is not null then return room_id; end if;
  insert into public.chat_rooms (is_group,created_by) values (false,caller_id) returning id into room_id;
  insert into public.direct_chat_pairs (room_id,user1_id,user2_id) values (room_id,first_id,second_id);
  insert into public.chat_room_members (room_id,user_id) values (room_id,first_id),(room_id,second_id);
  return room_id;
end;
$$;

create function public.create_group_chat(p_name text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true); room_id bigint;
begin
  insert into public.chat_rooms(name,is_group,created_by) values(btrim(p_name),true,caller_id) returning id into room_id;
  insert into public.chat_room_members(room_id,user_id) values(room_id,caller_id);
  return room_id;
end;
$$;

create function public.add_group_member(p_room_id bigint,p_user_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true);
begin
  if not exists(select 1 from public.chat_rooms r join public.chat_room_members m on m.room_id=r.id where r.id=p_room_id and r.is_group and m.user_id=caller_id)
    or not exists(select 1 from public.profiles where id=p_user_id and status='accepted' and deleted_at is null)
    then raise exception 'eligible group member required'; end if;
  insert into public.chat_room_members(room_id,user_id) values(p_room_id,p_user_id);
end;
$$;

create function public.remove_group_member(p_room_id bigint,p_user_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true);
begin
  if not exists(select 1 from public.chat_rooms where id=p_room_id and is_group) then raise exception 'group room required'; end if;
  if caller_id<>p_user_id
    and not exists(select 1 from public.chat_rooms where id=p_room_id and created_by=caller_id)
    and not exists(select 1 from public.profiles where id=caller_id and role='admin')
    then raise exception 'not allowed to remove member'; end if;
  delete from public.chat_room_read_states where room_id=p_room_id and user_id=p_user_id;
  delete from public.message_reactions mr using public.messages m where mr.message_id=m.id and m.room_id=p_room_id and mr.user_id=p_user_id;
  delete from public.chat_room_members where room_id=p_room_id and user_id=p_user_id;
end;
$$;

create function public.create_group_chat_with_members(p_name text,p_member_ids bigint[] default array[]::bigint[])
returns bigint language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true); room_id bigint; normalized_member_ids bigint[];
begin
  select array_agg(distinct member_id) into normalized_member_ids
  from unnest(coalesce(p_member_ids,array[]::bigint[])) as member_ids(member_id)
  where member_id is not null and member_id <> caller_id;

  if exists (
    select 1
    from unnest(coalesce(normalized_member_ids,array[]::bigint[])) as member_ids(member_id)
    where not exists (
      select 1 from public.profiles p
      where p.id=member_id and p.status='accepted' and p.deleted_at is null
    )
  ) then raise exception 'all group members must be accepted active profiles'; end if;

  insert into public.chat_rooms(name,is_group,created_by) values(btrim(p_name),true,caller_id) returning id into room_id;
  insert into public.chat_room_members(room_id,user_id)
  select room_id, member_id
  from unnest(array_prepend(caller_id,coalesce(normalized_member_ids,array[]::bigint[]))) as member_ids(member_id);
  return room_id;
end;
$$;

create function public.send_message(p_room_id bigint,p_content text default null,p_parent_id bigint default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true); message_id bigint; normalized_content text;
begin
  if not exists(select 1 from public.chat_room_members where room_id=p_room_id and user_id=caller_id) then
    raise exception 'room membership required';
  end if;
  if p_parent_id is not null and not exists(select 1 from public.messages where id=p_parent_id and room_id=p_room_id and deleted_at is null) then
    raise exception 'active parent message in room required';
  end if;

  normalized_content := nullif(btrim(p_content), '');
  if normalized_content is null then
    raise exception 'message content required';
  end if;
  if char_length(normalized_content) > 10000 then
    raise exception 'message content must be 1 to 10000 characters';
  end if;

  insert into public.messages(room_id,sender_id,parent_id,content)
  values(p_room_id,caller_id,p_parent_id,normalized_content)
  returning id into message_id;

  insert into public.chat_room_read_states(room_id,user_id,last_read_message_id)
  values(p_room_id,caller_id,message_id)
  on conflict(room_id,user_id) do update
  set last_read_message_id=excluded.last_read_message_id
  where public.chat_room_read_states.last_read_message_id is null
     or public.chat_room_read_states.last_read_message_id < excluded.last_read_message_id;

  return message_id;
end;
$$;

create function public.update_message(p_message_id bigint,p_content text)
returns void language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true); normalized_content text;
begin
  normalized_content := nullif(btrim(p_content), '');
  if normalized_content is null then
    raise exception 'message content required';
  end if;
  if char_length(normalized_content) > 10000 then
    raise exception 'message content must be 1 to 10000 characters';
  end if;

  update public.messages m
  set content = normalized_content
  where m.id = p_message_id
    and m.deleted_at is null
    and m.sender_id = caller_id
    and m.created_at >= now() - interval '15 minutes'
    and exists (
      select 1
      from public.chat_room_members crm
      where crm.room_id = m.room_id
        and crm.user_id = caller_id
    );

  if not found then
    raise exception 'editable active message not found';
  end if;
end;
$$;

create function public.mark_chat_read(p_room_id bigint,p_last_read_message_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true);
begin
  if not exists(select 1 from public.chat_room_members where room_id=p_room_id and user_id=caller_id) then
    raise exception 'room membership required';
  end if;
  if not exists(select 1 from public.messages where id=p_last_read_message_id and room_id=p_room_id and deleted_at is null) then
    raise exception 'active message in room required';
  end if;

  insert into public.chat_room_read_states(room_id,user_id,last_read_message_id)
  values(p_room_id,caller_id,p_last_read_message_id)
  on conflict(room_id,user_id) do update
  set last_read_message_id=excluded.last_read_message_id
  where public.chat_room_read_states.last_read_message_id is null
     or public.chat_room_read_states.last_read_message_id < excluded.last_read_message_id;
end;
$$;

create function public.set_message_reaction(p_message_id bigint,p_reaction_type_id bigint default null)
returns void language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true);
begin
  if not exists(
    select 1
    from public.messages m
    join public.chat_room_members crm on crm.room_id=m.room_id and crm.user_id=caller_id
    where m.id=p_message_id
      and m.deleted_at is null
      and (
        m.content is not null
        or exists(select 1 from public.message_attachments a where a.message_id=m.id)
      )
  ) then raise exception 'active message access required'; end if;

  if p_reaction_type_id is null then
    delete from public.message_reactions where message_id=p_message_id and user_id=caller_id;
    return;
  end if;

  if not exists(select 1 from public.reaction_types where id=p_reaction_type_id) then raise exception 'reaction type not found'; end if;
  insert into public.message_reactions(message_id,user_id,reaction_type_id)
  values(p_message_id,caller_id,p_reaction_type_id)
  on conflict(message_id,user_id) do update
  set reaction_type_id=excluded.reaction_type_id, updated_at=now();
end;
$$;

create function public.list_chat_rooms()
returns table(
  room_id bigint,
  is_group boolean,
  name text,
  display_name text,
  display_initials text,
  avatar_url text,
  last_message_id bigint,
  last_message_content text,
  last_message_has_attachment boolean,
  last_message_sender_id bigint,
  last_message_sender_name text,
  last_message_created_at timestamptz,
  unread_count bigint,
  member_count bigint,
  created_at timestamptz
) language plpgsql stable security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true);
begin
  return query
  select
    r.id as room_id,
    r.is_group,
    r.name,
    coalesce(case when r.is_group then r.name else peer.name end,'채팅방') as display_name,
    upper(left(regexp_replace(coalesce(case when r.is_group then r.name else peer.name end,'?'),'\s+','','g'),2)) as display_initials,
    case when r.is_group then null else peer.avatar_url end as avatar_url,
    last_message.id as last_message_id,
    last_message.content as last_message_content,
    coalesce(last_message.has_attachment,false) as last_message_has_attachment,
    last_message.sender_id as last_message_sender_id,
    last_sender.name as last_message_sender_name,
    last_message.created_at as last_message_created_at,
    coalesce(unread.unread_count,0) as unread_count,
    member_counts.member_count,
    r.created_at
  from public.chat_room_members own_membership
  join public.chat_rooms r on r.id=own_membership.room_id
  left join public.direct_chat_pairs dcp on dcp.room_id=r.id
  left join public.profiles peer on peer.id=case when dcp.user1_id=caller_id then dcp.user2_id when dcp.user2_id=caller_id then dcp.user1_id else null end
  left join lateral (
    select m.id,m.sender_id,m.content,m.created_at,
      exists(select 1 from public.message_attachments a where a.message_id=m.id) as has_attachment
    from public.messages m
    where m.room_id=r.id and m.deleted_at is null
    order by m.id desc
    limit 1
  ) last_message on true
  left join public.profiles last_sender on last_sender.id=last_message.sender_id
  left join public.chat_room_read_states read_state on read_state.room_id=r.id and read_state.user_id=caller_id
  left join lateral (
    select count(*)::bigint as unread_count
    from public.messages m
    where m.room_id=r.id and m.deleted_at is null and m.sender_id<>caller_id
      and (read_state.last_read_message_id is null or m.id>read_state.last_read_message_id)
  ) unread on true
  join lateral (
    select count(*)::bigint as member_count from public.chat_room_members m where m.room_id=r.id
  ) member_counts on true
  where own_membership.user_id=caller_id
  order by last_message.id desc nulls last,r.created_at desc,r.id desc;
end;
$$;

create function public.get_chat_messages(p_room_id bigint,p_before_id bigint default null,p_limit int4 default 50)
returns table(
  message_id bigint,
  room_id bigint,
  sender_id bigint,
  sender jsonb,
  parent_message jsonb,
  content text,
  is_edited boolean,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz,
  attachments jsonb,
  reactions jsonb,
  reads jsonb
) language plpgsql stable security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true);
begin
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'limit must be between 1 and 100'; end if;
  if not exists(select 1 from public.chat_room_members crm where crm.room_id=p_room_id and crm.user_id=caller_id) then raise exception 'room membership required'; end if;

  return query
  with page as (
    select m.*
    from public.messages m
    where m.room_id=p_room_id
      and (m.deleted_at is null or exists(select 1 from public.messages child where child.parent_id=m.id and child.deleted_at is null))
      and (p_before_id is null or m.id<p_before_id)
    order by m.id desc
    limit p_limit
  )
  select
    page.id as message_id,
    page.room_id,
    page.sender_id,
    jsonb_build_object('id',sender.id,'name',sender.name,'avatar_url',sender.avatar_url) as sender,
    case when parent.id is null then null else jsonb_build_object('id',parent.id,'sender_id',parent.sender_id,'sender_name',parent_sender.name,'content',parent.content,'created_at',parent.created_at) end as parent_message,
    page.content,
    page.is_edited,
    page.edited_at,
    page.deleted_at,
    page.created_at,
    coalesce(attachments.items,'[]'::jsonb) as attachments,
    coalesce(reactions.items,'[]'::jsonb) as reactions,
    coalesce(reads.items,'[]'::jsonb) as reads
  from page
  join public.profiles sender on sender.id=page.sender_id
  left join public.messages parent on parent.id=page.parent_id
  left join public.profiles parent_sender on parent_sender.id=parent.sender_id
  left join lateral (
    select jsonb_agg(jsonb_build_object('id',a.id,'storage_bucket',a.storage_bucket,'storage_path',a.storage_path,'file_name',a.file_name,'content_type',a.content_type,'size_bytes',a.size_bytes,'sort_order',a.sort_order,'width',a.width,'height',a.height,'created_at',a.created_at) order by a.sort_order,a.id) as items
    from public.message_attachments a where a.message_id=page.id
  ) attachments on true
  left join lateral (
    select jsonb_agg(jsonb_build_object('id',mr.id,'user_id',mr.user_id,'user_name',rp.name,'reaction_type_id',rt.id,'reaction_key',rt.key,'reaction_name',rt.name,'reaction_icon',rt.icon,'created_at',mr.created_at,'updated_at',mr.updated_at) order by mr.created_at,mr.id) as items
    from public.message_reactions mr join public.reaction_types rt on rt.id=mr.reaction_type_id join public.profiles rp on rp.id=mr.user_id
    where mr.message_id=page.id
  ) reactions on true
  left join lateral (
    select jsonb_agg(jsonb_build_object('user_id',rs.user_id,'user_name',reader.name,'read_at',rs.last_read_at) order by rs.last_read_at,rs.user_id) as items
    from public.chat_room_read_states rs join public.profiles reader on reader.id=rs.user_id
    where rs.room_id=page.room_id
      and rs.last_read_message_id is not null
      and rs.last_read_message_id>=page.id
  ) reads on true
  order by page.id asc;
end;
$$;

create function public.soft_delete_message(p_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true); target_sender_id bigint;
begin
  select sender_id into target_sender_id from public.messages where id=p_id and deleted_at is null for update;
  if target_sender_id is null then return; end if;
  if target_sender_id<>caller_id then raise exception 'message sender required'; end if;

  insert into private.attachment_cleanup_queue(storage_bucket,storage_path,requested_by)
  select a.storage_bucket,a.storage_path,caller_id
  from public.message_attachments a
  where a.message_id=p_id
  on conflict(storage_bucket,storage_path) do update
  set available_at=least(private.attachment_cleanup_queue.available_at,excluded.available_at),
      processed_at=null,
      last_error=null;

  delete from public.message_attachments where message_id=p_id;
  delete from public.message_reactions where message_id=p_id;

  update public.messages
  set content=null,deleted_at=now(),deleted_by=caller_id
  where id=p_id;
end;
$$;

create function public.search_messages(p_query text,p_room_id bigint)
returns table(message_id bigint,content_snippet text,sender_name text,created_at timestamptz)
language plpgsql security invoker set search_path = '' as $$
declare normalized_query text := regexp_replace(lower(btrim(p_query)), '\s+', '', 'g');
begin
  if p_query is null or char_length(btrim(p_query)) not between 1 and 200 or normalized_query='' then raise exception 'query must contain 1 to 200 characters'; end if;
  return query select m.id,left(m.content,300),p.name,m.created_at
  from public.messages m join public.profiles p on p.id=m.sender_id
  where m.room_id=p_room_id and m.deleted_at is null
    and m.content is not null
    and regexp_replace(lower(m.content),'\s+','','g') ilike '%'||normalized_query||'%'
  order by m.created_at desc,m.id desc limit 50;
end;
$$;

create function public.finalize_message_attachment(p_message_id bigint,p_storage_path text,p_file_name text,p_content_type text,p_size_bytes int8,p_sort_order int4,p_width int4,p_height int4)
returns bigint language plpgsql security definer set search_path='' as $$
declare caller_id bigint:=private.require_current_profile(true); attachment_id bigint; expected_prefix text;
begin
  select m.room_id::text||'/'||m.id::text||'/'||(select auth.uid())::text||'/' into expected_prefix from public.messages m where m.id=p_message_id and m.sender_id=caller_id and m.deleted_at is null and private.is_room_member(m.room_id);
  if expected_prefix is null or p_storage_path not like expected_prefix||'%' or p_storage_path !~ '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or p_content_type not in ('image/jpeg','image/png','image/webp','application/pdf','text/plain','text/markdown','text/csv','application/rtf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation','application/x-hwp','application/x-hwpx','application/haansofthwp','application/haansofthwpx','application/vnd.hancom.hwp','application/vnd.hancom.hwpx','application/vnd.oasis.opendocument.text','application/vnd.oasis.opendocument.spreadsheet','application/vnd.oasis.opendocument.presentation') or p_size_bytes>25000000
    or not exists(select 1 from storage.objects where bucket_id='message-files' and name=p_storage_path and created_at>=now()-interval '24 hours' and metadata->>'mimetype'=p_content_type and (metadata->>'size')::int8=p_size_bytes)
  then raise exception 'invalid message attachment'; end if;
  insert into public.message_attachments(message_id,storage_bucket,storage_path,file_name,content_type,size_bytes,sort_order,width,height)
  values(p_message_id,'message-files',p_storage_path,p_file_name,p_content_type,p_size_bytes,p_sort_order,p_width,p_height) returning id into attachment_id;
  return attachment_id;
end $$;

create function public.send_message_with_attachment(p_room_id bigint,p_storage_path text,p_file_name text,p_content_type text,p_size_bytes int8,p_parent_id bigint default null,p_content text default null,p_width int4 default null,p_height int4 default null)
returns bigint language plpgsql security definer set search_path='' as $$
declare caller_id bigint:=private.require_current_profile(true); message_id bigint; expected_prefix text:=p_room_id::text||'/'||(select auth.uid())::text||'/'; normalized_content text;
begin
  if not exists(select 1 from public.chat_room_members where room_id=p_room_id and user_id=caller_id) then raise exception 'room membership required'; end if;
  if not private.is_valid_message_parent(p_parent_id,p_room_id) then raise exception 'active parent message in room required'; end if;
  normalized_content:=nullif(btrim(p_content),'');
  if normalized_content is not null and char_length(normalized_content)>10000 then raise exception 'message content must be 1 to 10000 characters'; end if;
  if p_storage_path is null or p_storage_path not like expected_prefix||'%' or p_storage_path !~ '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or p_content_type not in ('image/jpeg','image/png','image/webp','application/pdf','text/plain','text/markdown','text/csv','application/rtf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation','application/x-hwp','application/x-hwpx','application/haansofthwp','application/haansofthwpx','application/vnd.hancom.hwp','application/vnd.hancom.hwpx','application/vnd.oasis.opendocument.text','application/vnd.oasis.opendocument.spreadsheet','application/vnd.oasis.opendocument.presentation') or p_size_bytes>25000000
    or not exists(select 1 from storage.objects where bucket_id='message-files' and name=p_storage_path and created_at>=now()-interval '24 hours' and metadata->>'mimetype'=p_content_type and (metadata->>'size')::int8=p_size_bytes)
  then raise exception 'invalid message attachment'; end if;

  insert into public.messages(room_id,sender_id,parent_id,content)
  values(p_room_id,caller_id,p_parent_id,normalized_content)
  returning id into message_id;

  insert into public.message_attachments(message_id,storage_bucket,storage_path,file_name,content_type,size_bytes,sort_order,width,height)
  values(message_id,'message-files',p_storage_path,p_file_name,p_content_type,p_size_bytes,0,p_width,p_height);

  insert into public.chat_room_read_states(room_id,user_id,last_read_message_id)
  values(p_room_id,caller_id,message_id)
  on conflict(room_id,user_id) do update
  set last_read_message_id=excluded.last_read_message_id
  where public.chat_room_read_states.last_read_message_id is null
     or public.chat_room_read_states.last_read_message_id<excluded.last_read_message_id;

  return message_id;
end $$;

revoke execute on function public.create_direct_chat(bigint), public.create_group_chat(text), public.add_group_member(bigint,bigint), public.remove_group_member(bigint,bigint), public.create_group_chat_with_members(text,bigint[]), public.send_message(bigint,text,bigint), public.update_message(bigint,text), public.mark_chat_read(bigint,bigint), public.set_message_reaction(bigint,bigint), public.list_chat_rooms(), public.get_chat_messages(bigint,bigint,int4), public.soft_delete_message(bigint), public.search_messages(text,bigint) from public, anon, authenticated, service_role;
grant execute on function public.create_direct_chat(bigint), public.create_group_chat(text), public.add_group_member(bigint,bigint), public.remove_group_member(bigint,bigint), public.create_group_chat_with_members(text,bigint[]), public.send_message(bigint,text,bigint), public.update_message(bigint,text), public.mark_chat_read(bigint,bigint), public.set_message_reaction(bigint,bigint), public.list_chat_rooms(), public.get_chat_messages(bigint,bigint,int4) to authenticated;
grant execute on function public.soft_delete_message(bigint) to authenticated;
grant execute on function public.search_messages(text,bigint) to authenticated;
grant execute on function public.send_message_with_attachment(bigint,text,text,text,int8,bigint,text,int4,int4) to authenticated;
revoke execute on function public.finalize_message_attachment(bigint,text,text,text,int8,int4,int4,int4), public.send_message_with_attachment(bigint,text,text,text,int8,bigint,text,int4,int4) from public, anon, service_role;

create function public.cleanup_direct_chat_room(p_room_id bigint)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform private.require_service_role();
  if exists(select 1 from public.chat_rooms where id=p_room_id and is_group) then
    raise exception 'only direct chat rooms can be cleaned up';
  end if;
  if exists(select 1 from public.message_attachments a join public.messages m on m.id=a.message_id where m.room_id=p_room_id) then
    raise exception 'message attachments must be removed before purging room';
  end if;
  delete from public.message_reactions mr using public.messages m where mr.message_id=m.id and m.room_id=p_room_id;
  delete from public.chat_room_read_states where room_id=p_room_id;
  delete from public.messages where room_id=p_room_id and parent_id is not null;
  delete from public.messages where room_id=p_room_id;
  delete from public.chat_room_members where room_id=p_room_id;
  delete from public.chat_rooms where id=p_room_id;
end $$;

grant execute on function public.cleanup_direct_chat_room(bigint) to service_role;
revoke execute on function public.cleanup_direct_chat_room(bigint) from public, anon, authenticated;

create type public.notification_level as enum ('mention', 'all');

create table public.notifications (
  id bigserial primary key,
  recipient_id bigint not null references public.profiles (id) on delete restrict,
  actor_id bigint null references public.profiles (id) on delete set null,
  title text null,
  body text null,
  space_id bigint null references public.spaces (id) on delete set null,
  post_id bigint null references public.posts (id) on delete set null,
  comment_id bigint null references public.comments (id) on delete set null,
  message_id bigint null references public.messages (id) on delete set null,
  read_at timestamptz null,
  created_at timestamptz not null default now()
);

create index idx_notifications_recipient_created_at on public.notifications (recipient_id, created_at);
create index idx_notifications_unread_recipient_created_at on public.notifications (recipient_id, created_at desc)
where read_at is null;

alter table public.notifications
  add constraint notifications_title_check check (title is null or char_length(title) <= 200),
  add constraint notifications_body_check check (body is null or char_length(body) <= 2000),
  add constraint notifications_content_check check (
    nullif(btrim(title), '') is not null or nullif(btrim(body), '') is not null
  ),
  add constraint notifications_message_target_check check (
    message_id is null or (space_id is null and post_id is null and comment_id is null)
  );

alter table public.notifications enable row level security;
create policy notifications_select on public.notifications for select to authenticated using (private.is_accepted_user() and recipient_id=private.current_profile_id());
create policy notifications_update on public.notifications for update to authenticated using (private.is_accepted_user() and recipient_id=private.current_profile_id()) with check (private.is_accepted_user() and recipient_id=private.current_profile_id());

grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant select, insert, update, delete on public.notifications to service_role;
grant usage, select on sequence public.notifications_id_seq to service_role;

create type public.gongang_location as enum ('floor_b1', 'floor_2', 'floor_4', 'floor_10');

create table public.gongangs (
  id bigserial primary key,
  location public.gongang_location not null,
  owner_id bigint not null references public.profiles (id) on delete restrict,
  day_of_week int2 not null,
  start_minute int2 not null,
  end_minute int2 not null,
  valid_from date not null,
  valid_until date not null,
  time_range int4range generated always as (
    int4range(start_minute::int4, end_minute::int4, '[)')
  ) stored not null,
  validity_range daterange generated always as (
    daterange(valid_from, valid_until, '[]')
  ) stored not null,
  created_at timestamptz not null default now()
);

create table public.song_requests (
  id bigserial primary key,
  requester_id bigint not null references public.profiles (id) on delete restrict,
  url text not null,
  requested_at timestamptz not null default now()
);

create index idx_gongangs_owner on public.gongangs (owner_id);
create index idx_gongangs_location_time on public.gongangs (location, day_of_week, start_minute);
create index idx_song_requests_requester_requested_at on public.song_requests (requester_id, requested_at);
create index idx_song_requests_requested_at on public.song_requests (requested_at);

alter table public.gongangs
  add constraint gongangs_day_of_week_check check (day_of_week between 0 and 6),
  add constraint gongangs_start_minute_check check (start_minute between 0 and 1439),
  add constraint gongangs_end_minute_check check (end_minute between 1 and 1440),
  add constraint gongangs_time_order_check check (start_minute < end_minute),
  add constraint gongangs_validity_check check (valid_from <= valid_until),
  add constraint gongangs_no_overlap exclude using gist (
    location with =,
    day_of_week with =,
    time_range with &&,
    validity_range with &&
  );

alter table public.song_requests
  add constraint song_requests_url_check check (
    char_length(url) between 1 and 2048
    and url ~ '^https://'
  );

alter table public.gongangs enable row level security;
alter table public.song_requests enable row level security;
create policy gongangs_select on public.gongangs for select to authenticated using (private.has_permission('gongang'));
create policy gongangs_insert on public.gongangs for insert to authenticated with check (owner_id=private.current_profile_id() and private.has_permission('gongang'));
create policy gongangs_update on public.gongangs for update to authenticated using (owner_id=private.current_profile_id() and private.has_permission('gongang')) with check (owner_id=private.current_profile_id() and private.has_permission('gongang'));
create policy gongangs_delete on public.gongangs for delete to authenticated using (owner_id=private.current_profile_id() and private.has_permission('gongang'));
create policy song_requests_select on public.song_requests for select to authenticated using (private.has_permission('karaoke'));
create policy song_requests_insert on public.song_requests for insert to authenticated with check (requester_id=private.current_profile_id() and private.has_permission('karaoke'));

grant select on public.gongangs, public.song_requests to authenticated;
grant insert (location,owner_id,day_of_week,start_minute,end_minute,valid_from,valid_until) on public.gongangs to authenticated;
grant update (location,day_of_week,start_minute,end_minute,valid_from,valid_until) on public.gongangs to authenticated;
grant delete on public.gongangs to authenticated;
grant insert (requester_id,url) on public.song_requests to authenticated;
grant usage, select on sequence public.gongangs_id_seq, public.song_requests_id_seq to authenticated;
grant select, insert, update, delete on public.gongangs, public.song_requests to service_role;
grant usage, select on sequence public.gongangs_id_seq, public.song_requests_id_seq to service_role;

create type public.club_type as enum ('major', 'general');

create table public.clubs (
  id bigserial primary key,
  name text not null,
  description text null,
  type public.club_type not null default 'major',
  created_at timestamptz not null default now()
);

create table public.club_apply_rounds (
  id bigserial primary key,
  name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  apply_range tstzrange generated always as (
    tstzrange(starts_at, ends_at, '[)')
  ) stored not null,
  created_by bigint null references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.clubs_apply (
  id bigserial primary key,
  round_id bigint not null references public.club_apply_rounds (id) on delete restrict,
  user_id bigint not null references public.profiles (id) on delete restrict,
  club_id bigint not null references public.clubs (id) on delete restrict,
  created_at timestamptz not null default now()
);

create index idx_club_apply_rounds_period on public.club_apply_rounds (starts_at, ends_at);
create index idx_clubs_apply_round_club_created_at on public.clubs_apply (round_id, club_id, created_at);
create index idx_clubs_apply_round_user_created_at on public.clubs_apply (round_id, user_id, created_at);
create index idx_clubs_apply_user_id on public.clubs_apply (user_id);
create index idx_clubs_apply_club_id on public.clubs_apply (club_id);

alter table public.clubs
  add constraint clubs_name_key unique (name),
  add constraint clubs_name_check check (char_length(btrim(name)) between 1 and 100),
  add constraint clubs_description_check check (
    description is null or char_length(description) <= 5000
  );

alter table public.club_apply_rounds
  add constraint club_apply_rounds_name_check check (char_length(btrim(name)) between 1 and 100),
  add constraint club_apply_rounds_period_check check (starts_at < ends_at),
  add constraint club_apply_rounds_no_overlap exclude using gist (apply_range with &&);

alter table public.clubs_apply
  add constraint clubs_apply_round_user_club_key unique (round_id, user_id, club_id);

create function private.is_club_round_open(p_round_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.club_apply_rounds where id=p_round_id and now()>=starts_at and now()<ends_at)
$$;
revoke execute on function private.is_club_round_open(bigint) from public, anon, service_role;
grant execute on function private.is_club_round_open(bigint) to authenticated;

alter table public.clubs enable row level security;
alter table public.club_apply_rounds enable row level security;
alter table public.clubs_apply enable row level security;
create policy clubs_select on public.clubs for select to authenticated using (private.is_accepted_user());
create policy club_apply_rounds_select on public.club_apply_rounds for select to authenticated using (private.is_accepted_user());
create policy clubs_apply_select on public.clubs_apply for select to authenticated using (private.is_accepted_user());
create policy clubs_apply_insert on public.clubs_apply for insert to authenticated with check (user_id=private.current_profile_id() and private.is_club_round_open(round_id));
create policy clubs_apply_delete on public.clubs_apply for delete to authenticated using (user_id=private.current_profile_id() and private.is_club_round_open(round_id));

grant select on public.clubs, public.club_apply_rounds, public.clubs_apply to authenticated;
grant insert (round_id,user_id,club_id) on public.clubs_apply to authenticated;
grant delete on public.clubs_apply to authenticated;
grant usage, select on sequence public.clubs_apply_id_seq to authenticated;
grant select, insert, update, delete on public.clubs, public.club_apply_rounds, public.clubs_apply to service_role;
grant usage, select on sequence public.clubs_id_seq, public.club_apply_rounds_id_seq, public.clubs_apply_id_seq to service_role;

create table private.attachment_cleanup_queue (
  id bigserial primary key,
  storage_bucket text not null,
  storage_path text not null,
  requested_by bigint null references public.profiles(id) on delete set null,
  requested_at timestamptz not null default now(),
  available_at timestamptz not null default now(),
  attempts int4 not null default 0 check (attempts >= 0),
  last_error text null,
  processed_at timestamptz null,
  unique (storage_bucket,storage_path)
);
create index idx_attachment_cleanup_queue_pending on private.attachment_cleanup_queue(processed_at,available_at);

create policy avatars_select on storage.objects for select to authenticated using (
  bucket_id='avatars' and exists(select 1 from public.profiles p where p.avatar_url=storage.objects.name and p.deleted_at is null)
);
create policy space_images_select on storage.objects for select to authenticated using (
  bucket_id='space-images' and exists(select 1 from public.spaces s where s.image_url=storage.objects.name and s.deleted_at is null)
);
create policy post_files_select on storage.objects for select to authenticated using (
  bucket_id='post-files' and exists(select 1 from public.post_attachments a where a.storage_path=storage.objects.name and private.can_access_post(a.post_id))
);
create policy message_files_select on storage.objects for select to authenticated using (
  bucket_id='message-files' and (
    exists(select 1 from public.message_attachments a where a.storage_path=storage.objects.name and private.can_access_message(a.message_id))
    or (
      split_part(storage.objects.name,'/',2)=(select auth.uid())::text and exists(
        select 1 from public.chat_room_members crm
        where crm.room_id::text=split_part(storage.objects.name,'/',1)
          and private.is_room_member(crm.room_id)
          and storage.objects.name ~ ('^'||crm.room_id::text||'/'||(select auth.uid())::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
      )
    )
  )
);
create policy avatars_insert on storage.objects for insert to authenticated with check (
  bucket_id='avatars' and exists(select 1 from public.profiles p where p.auth_user_id=(select auth.uid()) and p.deleted_at is null)
  and storage.objects.name ~ ('^'||(select auth.uid())::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
);
create policy space_images_insert on storage.objects for insert to authenticated with check (
  bucket_id='space-images' and exists(
    select 1 from public.spaces s
    where s.pub_id::text=split_part(storage.objects.name,'/',1)
      and s.deleted_at is null
      and private.can_manage_space(s.id)
      and storage.objects.name ~ ('^'||s.pub_id::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
  )
);
create policy post_files_insert on storage.objects for insert to authenticated with check (
  bucket_id='post-files' and split_part(storage.objects.name,'/',2)=(select auth.uid())::text and exists(
    select 1 from public.posts p
    where p.pub_id::text=split_part(storage.objects.name,'/',1)
      and p.author_id=private.current_profile_id()
      and p.deleted_at is null
      and private.can_access_post(p.id)
      and storage.objects.name ~ ('^'||p.pub_id::text||'/'||(select auth.uid())::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
  )
);
create policy message_files_insert on storage.objects for insert to authenticated with check (
  bucket_id='message-files' and split_part(storage.objects.name,'/',2)=(select auth.uid())::text and exists(
    select 1 from public.chat_room_members crm
    where crm.room_id::text=split_part(storage.objects.name,'/',1)
      and private.is_room_member(crm.room_id)
      and storage.objects.name ~ ('^'||crm.room_id::text||'/'||(select auth.uid())::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
  )
);

create function public.request_attachment_removal(p_attachment_kind text,p_attachment_id bigint)
returns void language plpgsql security definer set search_path='' as $$
declare caller_id bigint:=private.require_current_profile(true); bucket text; path text; target_message_id bigint;
begin
  if p_attachment_kind='post' then
    select a.storage_bucket,a.storage_path into bucket,path from public.post_attachments a join public.posts p on p.id=a.post_id where a.id=p_attachment_id and p.author_id=caller_id and p.deleted_at is null;
  elsif p_attachment_kind='message' then
    select a.storage_bucket,a.storage_path,a.message_id into bucket,path,target_message_id from public.message_attachments a join public.messages m on m.id=a.message_id where a.id=p_attachment_id and m.sender_id=caller_id and m.deleted_at is null and private.is_room_member(m.room_id);
  else raise exception 'invalid attachment kind'; end if;
  if path is null then raise exception 'attachment not found or not owned'; end if;

  insert into private.attachment_cleanup_queue(storage_bucket,storage_path,requested_by) values(bucket,path,caller_id)
  on conflict(storage_bucket,storage_path) do update
  set available_at=least(private.attachment_cleanup_queue.available_at,excluded.available_at),
      processed_at=null,
      last_error=null;

  if p_attachment_kind='post' then
    delete from public.post_attachments where id=p_attachment_id and storage_path=path;
  else
    delete from public.message_attachments where id=p_attachment_id and storage_path=path;
    delete from public.message_reactions where message_id=target_message_id;

    update public.messages m
    set content=null,deleted_at=now(),deleted_by=caller_id
    where m.id=target_message_id
      and m.deleted_at is null
      and m.content is null
      and not exists(select 1 from public.message_attachments a where a.message_id=m.id);
  end if;
end $$;

create function public.enqueue_due_storage_cleanup()
returns bigint language plpgsql security definer set search_path='' as $$
declare result bigint;
begin
  perform private.require_service_role();
  delete from private.attachment_cleanup_queue where processed_at<now()-interval '30 days';

  insert into private.attachment_cleanup_queue(storage_bucket,storage_path)
  select a.storage_bucket,a.storage_path from public.post_attachments a join public.posts p on p.id=a.post_id
  where p.deleted_at<now()-interval '7 days'
  union
  select a.storage_bucket,a.storage_path from public.message_attachments a join public.messages m on m.id=a.message_id
  where m.deleted_at<now()-interval '7 days'
  union
  select a.storage_bucket,a.storage_path from public.post_attachments a join public.posts p on p.id=a.post_id join public.spaces s on s.id=p.space_id
  where s.deleted_at<now()-interval '7 days'
  union
  select 'space-images',s.image_url from public.spaces s
  where s.deleted_at<now()-interval '7 days' and s.image_url is not null
  union
  select o.bucket_id,o.name from storage.objects o
  where o.created_at<now()-interval '48 hours'
    and o.bucket_id in ('avatars','space-images','post-files','message-files')
    and not exists(select 1 from public.profiles p where o.bucket_id='avatars' and p.avatar_url=o.name)
    and not exists(select 1 from public.spaces s where o.bucket_id='space-images' and s.image_url=o.name)
    and not exists(select 1 from public.post_attachments a where o.bucket_id='post-files' and a.storage_path=o.name)
    and not exists(select 1 from public.message_attachments a where o.bucket_id='message-files' and a.storage_path=o.name)
  on conflict(storage_bucket,storage_path) do update
  set available_at=least(private.attachment_cleanup_queue.available_at,excluded.available_at),processed_at=null;

  get diagnostics result=row_count;
  return result;
end $$;

create function public.claim_storage_cleanup(p_limit int4 default 100)
returns table(id bigint,storage_bucket text,storage_path text)
language plpgsql security definer set search_path='' as $$
begin
  perform private.require_service_role();
  if p_limit not between 1 and 500 then raise exception 'limit must be between 1 and 500'; end if;
  return query
  with claimed as (
    select q.id from private.attachment_cleanup_queue q
    where q.processed_at is null and q.available_at<=now()
    order by q.available_at,q.id
    for update skip locked
    limit p_limit
  )
  update private.attachment_cleanup_queue q
  set attempts=q.attempts+1,available_at=now()+interval '10 minutes',last_error=null
  from claimed
  where q.id=claimed.id
  returning q.id,q.storage_bucket,q.storage_path;
end $$;

create function public.complete_storage_cleanup(p_id bigint)
returns void language plpgsql security definer set search_path='' as $$
declare bucket text; path text;
begin
  perform private.require_service_role();
  select storage_bucket,storage_path into bucket,path from private.attachment_cleanup_queue where id=p_id and processed_at is null for update;
  if path is null then return; end if;
  if bucket='post-files' then delete from public.post_attachments where storage_path=path;
  elsif bucket='message-files' then delete from public.message_attachments where storage_path=path;
  elsif bucket='avatars' then update public.profiles set avatar_url=null where avatar_url=path;
  elsif bucket='space-images' then update public.spaces set image_url=null where image_url=path and deleted_at is not null;
  else raise exception 'invalid cleanup bucket'; end if;
  update private.attachment_cleanup_queue set processed_at=now(),last_error=null where id=p_id;
end $$;

create function public.fail_storage_cleanup(p_id bigint,p_error text)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform private.require_service_role();
  update private.attachment_cleanup_queue
  set last_error=left(coalesce(p_error,'unknown error'),2000),
      available_at=now()+least(interval '24 hours',interval '5 minutes'*power(2,greatest(attempts-1,0)))
  where id=p_id and processed_at is null;
end $$;


revoke all on table private.attachment_cleanup_queue from public,anon,authenticated;
revoke all on sequence private.attachment_cleanup_queue_id_seq from public,anon,authenticated;
grant select,insert,update,delete on private.attachment_cleanup_queue to service_role;
grant usage,select on sequence private.attachment_cleanup_queue_id_seq to service_role;
grant execute on function public.request_attachment_removal(text,bigint) to authenticated;
revoke execute on function public.request_attachment_removal(text,bigint) from public, anon, service_role;
grant execute on function public.enqueue_due_storage_cleanup(),public.claim_storage_cleanup(int4),public.complete_storage_cleanup(bigint),public.fail_storage_cleanup(bigint,text) to service_role;
revoke execute on function public.enqueue_due_storage_cleanup(),public.claim_storage_cleanup(int4),public.complete_storage_cleanup(bigint),public.fail_storage_cleanup(bigint,text) from public,anon,authenticated;

-- seed data required in every environment (not part of declarative schema)
insert into public.permissions (key, name)
values
  ('gongang', '공강'),
  ('karaoke', '노래방');

insert into public.reaction_types (key, name, sort_order)
values
  ('like', '좋아요', 0),
  ('love', '하트', 1);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values
  ('avatars','avatars',false,5000000,array['image/jpeg','image/png','image/webp']),
  ('space-images','space-images',false,10000000,array['image/jpeg','image/png','image/webp']),
  ('post-files','post-files',false,25000000,array['image/jpeg','image/png','image/webp','application/pdf','text/plain','text/markdown','text/csv','application/rtf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation','application/x-hwp','application/x-hwpx','application/haansofthwp','application/haansofthwpx','application/vnd.hancom.hwp','application/vnd.hancom.hwpx','application/vnd.oasis.opendocument.text','application/vnd.oasis.opendocument.spreadsheet','application/vnd.oasis.opendocument.presentation']),
  ('message-files','message-files',false,25000000,array['image/jpeg','image/png','image/webp','application/pdf','text/plain','text/markdown','text/csv','application/rtf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation','application/x-hwp','application/x-hwpx','application/haansofthwp','application/haansofthwpx','application/vnd.hancom.hwp','application/vnd.hancom.hwpx','application/vnd.oasis.opendocument.text','application/vnd.oasis.opendocument.spreadsheet','application/vnd.oasis.opendocument.presentation'])
on conflict (id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
