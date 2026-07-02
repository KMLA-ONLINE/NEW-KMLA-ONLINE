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

insert into public.permissions (key, name)
values
  ('gongang', '공강'),
  ('karaoke', '노래방');

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
