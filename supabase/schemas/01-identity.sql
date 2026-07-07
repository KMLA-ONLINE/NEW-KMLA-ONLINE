create type public.app_role as enum ('user', 'admin');
create type public.profile_gender as enum ('male', 'female');
create type public.profile_track as enum ('domestic', 'international');
create type public.profile_type as enum ('student', 'teacher', 'alumni');
create type public.profile_status as enum ('none', 'pending', 'accepted', 'rejected', 'withdrawn');

create table public.profile_departments (
  name text primary key
);

create table public.profiles (
  id bigserial primary key,
  auth_user_id uuid null references auth.users (id) on delete set null,
  name text not null,
  role public.app_role not null default 'user',
  type public.profile_type not null default 'student',
  student_number char(6) null,
  class_no int2 null,
  cohort int2 null,
  gender public.profile_gender null,
  track public.profile_track null,
  department text null references public.profile_departments (name) on update cascade on delete set null,
  phone_number text null,
  avatar_url text null,
  cover_image_url text null,
  birthday date null,
  description text null,
  status public.profile_status not null default 'none',
  dorm_room int2 null,
  is_reenrolled boolean not null default false,
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

alter table public.profile_departments
  add constraint profile_departments_name_check check (char_length(btrim(name)) between 1 and 50);

alter table public.profiles
  add constraint profiles_auth_user_id_key unique (auth_user_id),
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
  add constraint profiles_track_required_check check (
    deleted_at is not null
    or status = 'none'
    or track is not null
  ),
  add constraint profiles_name_check check (char_length(btrim(name)) between 1 and 50),
  add constraint profiles_description_check check (
    description is null or char_length(description) <= 2000
  );

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
      role = 'user',
      student_number = null,
      class_no = null,
      cohort = null,
      gender = null,
      track = null,
      department = null,
      phone_number = null,
      avatar_url = null,
      cover_image_url = null,
      birthday = null,
      description = null,
      status = 'withdrawn',
      dorm_room = null,
      is_reenrolled = false,
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

alter table public.profile_departments enable row level security;
alter table public.profiles enable row level security;
alter table public.permissions enable row level security;
alter table public.user_permissions enable row level security;

create policy profile_departments_select
on public.profile_departments
for select
to authenticated
using (true);

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

grant select on table public.profile_departments, public.profiles, public.permissions, public.user_permissions to authenticated;
grant update (name, gender, phone_number, birthday, description) on table public.profiles
to authenticated;

grant usage on schema public, private to service_role;
grant select, insert, update, delete
on table public.profile_departments, public.profiles, public.permissions, public.user_permissions
to service_role;
grant usage, select on sequence public.profiles_id_seq to service_role;

create function public.submit_onboarding(p_name text,p_type public.profile_type,p_student_number char(6),p_class_no int2,p_cohort int2,p_gender public.profile_gender,p_track public.profile_track,p_department text,p_is_reenrolled boolean,p_phone_number text,p_birthday date,p_description text,p_dorm_room int2)
returns void language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(false);
begin
  update public.profiles set name=btrim(p_name),type=p_type,student_number=p_student_number,class_no=p_class_no,cohort=p_cohort,gender=p_gender,track=p_track,department=nullif(btrim(p_department),''),is_reenrolled=coalesce(p_is_reenrolled,false),phone_number=p_phone_number,birthday=p_birthday,description=p_description,dorm_room=p_dorm_room,onboarding_completed_at=now(),status='pending',status_updated_at=now(),status_updated_by=null
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

create function public.withdraw_profile()
returns void language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true);
begin
  perform 1 from public.profiles where id=caller_id for update;
  if exists(select 1 from public.profiles where id=caller_id and role='admin') or exists(select 1 from public.space_members sm join public.spaces s on s.id=sm.space_id where sm.user_id=caller_id and sm.role='owner' and s.deleted_at is null)
    then raise exception 'transfer owner/admin responsibilities first'; end if;
  update public.profiles set name='탈퇴한 사용자',role='user',student_number=null,class_no=null,cohort=null,gender=null,track=null,department=null,phone_number=null,avatar_url=null,cover_image_url=null,birthday=null,description=null,status='withdrawn',dorm_room=null,is_reenrolled=false,status_updated_at=now(),status_updated_by=null,deleted_at=now() where id=caller_id;
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

create function public.finalize_cover_image(p_storage_path text)
returns void language plpgsql security definer set search_path='' as $$
declare caller_id bigint:=private.require_current_profile(false); expected_prefix text:=(select auth.uid())::text||'/';
begin
  if p_storage_path not like expected_prefix||'%' or p_storage_path !~ '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or not exists(select 1 from storage.objects where bucket_id='profile-covers' and name=p_storage_path and created_at>=now()-interval '24 hours' and coalesce(metadata->>'mimetype','') in ('image/jpeg','image/png','image/webp'))
    then raise exception 'invalid cover image object'; end if;
  update public.profiles set cover_image_url=p_storage_path where id=caller_id;
end $$;

revoke execute on function public.submit_onboarding(text,public.profile_type,char,int2,int2,public.profile_gender,public.profile_track,text,boolean,text,date,text,int2), public.review_profile(bigint,public.profile_status), public.withdraw_profile() from public, anon, authenticated, service_role;
grant execute on function public.submit_onboarding(text,public.profile_type,char,int2,int2,public.profile_gender,public.profile_track,text,boolean,text,date,text,int2), public.review_profile(bigint,public.profile_status) to authenticated;
grant execute on function public.withdraw_profile(), public.finalize_avatar(text), public.finalize_cover_image(text) to authenticated;
revoke execute on function public.finalize_avatar(text), public.finalize_cover_image(text) from public, anon, service_role;

create function public.bootstrap_first_app_admin(p_profile_id bigint)
returns void language plpgsql security definer set search_path='' as $$
begin perform private.require_service_role(); perform pg_advisory_xact_lock(hashtextextended('public.app_admin_set',0)); if exists(select 1 from public.profiles where role='admin') then raise exception 'app admin already exists'; end if; update public.profiles set role='admin' where id=p_profile_id and status='accepted' and deleted_at is null; if not found then raise exception 'accepted profile required'; end if; end $$;
grant execute on function public.bootstrap_first_app_admin(bigint) to service_role;
revoke execute on function public.bootstrap_first_app_admin(bigint) from public, anon, authenticated;
