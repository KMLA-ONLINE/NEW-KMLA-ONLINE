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
