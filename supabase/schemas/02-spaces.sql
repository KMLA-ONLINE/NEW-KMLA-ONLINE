create type public.member_role as enum ('owner', 'admin', 'manager', 'member');
create type public.notification_setting as enum ('off', 'mentions', 'all');
-- open: 검색 가능 + 비멤버도 글 읽기/쓰기 (완전 공개)
-- public: 검색 가능하지만 가입해야 글 읽기/쓰기 (스스로 가입)
-- invite_only: 비공개(검색 노출 X), 초대장으로만 가입
create type public.space_join_policy as enum ('open', 'public', 'invite_only');
create type public.space_type as enum ('group', 'community');

create table public.spaces (
  id bigserial primary key,
  pub_id text not null default left(replace(gen_random_uuid()::text, '-', ''), 12),
  type public.space_type not null,
  name text not null,
  description text null,
  image_url text null,
  join_policy public.space_join_policy not null default 'public',
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
  pinned_at timestamptz null,
  banned_at timestamptz null,
  banned_by bigint null references public.profiles (id) on delete set null,
  ban_reason text null,
  joined_at timestamptz not null default now(),
  primary key (space_id, user_id)
);

-- 초대장(공유 토큰). invite_only/public 공간에서 멤버 초대에 사용
create table public.space_invites (
  id bigserial primary key,
  space_id bigint not null references public.spaces (id) on delete restrict,
  token text not null,
  created_by bigint null references public.profiles (id) on delete set null,
  max_uses int4 null,
  use_count int4 not null default 0,
  expires_at timestamptz null,
  revoked_at timestamptz null,
  created_at timestamptz not null default now()
);

create index idx_spaces_active_directory on public.spaces (join_policy, member_count)
where deleted_at is null;
create index idx_space_members_user_joined_at on public.space_members (user_id, joined_at);
create index idx_space_members_space_role on public.space_members (space_id, role);
create index idx_space_members_active_user_space on public.space_members (user_id, space_id)
where banned_at is null;
create index idx_space_members_user_pinned on public.space_members (user_id, pinned_at desc)
where pinned_at is not null;
create index idx_space_invites_space on public.space_invites (space_id, created_at desc);

alter table public.spaces
  add constraint spaces_pub_id_key unique (pub_id),
  add constraint spaces_pub_id_check check (
    char_length(pub_id) >= 3
    and char_length(pub_id) <= 50
    and pub_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
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

alter table public.space_invites
  add constraint space_invites_token_key unique (token),
  add constraint space_invites_token_check check (char_length(token) between 16 and 128),
  add constraint space_invites_max_uses_check check (max_uses is null or max_uses > 0),
  add constraint space_invites_use_count_check check (
    use_count >= 0 and (max_uses is null or use_count <= max_uses)
  );

create function private.is_space_member(p_space_id bigint,p_allowed_roles public.member_role[] default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.space_members sm join public.spaces s on s.id=sm.space_id join public.profiles p on p.id=sm.user_id
    where sm.space_id=p_space_id and p.auth_user_id=(select auth.uid()) and p.status='accepted' and p.deleted_at is null and s.deleted_at is null and sm.banned_at is null
      and (p_allowed_roles is null or sm.role=any(p_allowed_roles)))
$$;
create function private.can_manage_space(p_space_id bigint,p_allowed_roles public.member_role[] default array['owner','admin']::public.member_role[])
returns boolean language sql stable security definer set search_path = '' as $$ select private.is_space_member(p_space_id,p_allowed_roles) $$;
-- 공간 콘텐츠(글) 참여 가능 여부: 멤버이거나, open 공간의 accepted 비-밴 사용자
create function private.can_participate_space(p_space_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.spaces s
    where s.id=p_space_id and s.deleted_at is null and (
      private.is_space_member(s.id)
      or (
        s.join_policy='open'
        and private.is_accepted_user()
        and not exists(select 1 from public.space_members b where b.space_id=s.id and b.user_id=private.current_profile_id() and b.banned_at is not null)
      )
    )
  )
$$;
revoke execute on function private.is_space_member(bigint,public.member_role[]), private.can_manage_space(bigint,public.member_role[]), private.can_participate_space(bigint) from public, anon, service_role;
grant execute on function private.is_space_member(bigint,public.member_role[]),private.can_manage_space(bigint,public.member_role[]),private.can_participate_space(bigint) to authenticated;

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
alter table public.space_invites enable row level security;
create policy spaces_select on public.spaces for select to authenticated using (
  deleted_at is null and (
    (join_policy in ('open','public') and (select private.is_accepted_user()))
    or private.is_space_member(id)
  )
);
create policy space_members_select on public.space_members for select to authenticated using (private.is_space_member(space_id));
create policy space_members_update on public.space_members for update to authenticated using (user_id=private.current_profile_id() and private.is_space_member(space_id)) with check (user_id=private.current_profile_id() and private.is_space_member(space_id));
create policy space_invites_select on public.space_invites for select to authenticated using (private.can_manage_space(space_id));

grant select (id,pub_id,type,name,description,image_url,join_policy,member_count,created_at,deleted_at) on public.spaces to authenticated;
grant select on public.space_members to authenticated;
grant update (notification_setting,pinned_at) on public.space_members to authenticated;
grant select on public.space_invites to authenticated;
grant select, insert, update, delete on public.spaces, public.space_members, public.space_invites to service_role;
grant usage, select on sequence public.spaces_id_seq, public.space_invites_id_seq to service_role;

create function public.join_space(p_space_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true);
begin
  if not exists(select 1 from public.spaces where id=p_space_id and deleted_at is null) then raise exception 'space not found'; end if;
  if exists(select 1 from public.spaces where id=p_space_id and join_policy='invite_only') then raise exception 'invite required to join this space'; end if;
  if exists(select 1 from public.space_members where space_id=p_space_id and user_id=caller_id and banned_at is not null) then raise exception 'banned from this space'; end if;
  insert into public.space_members(space_id,user_id,role) values(p_space_id,caller_id,'member') on conflict do nothing;
  if found then update public.spaces set member_count=member_count+1 where id=p_space_id; end if;
end;
$$;

create function public.leave_space(p_space_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true);
begin
  if exists(select 1 from public.space_members where space_id=p_space_id and user_id=caller_id and role='owner') then
    raise exception 'transfer ownership before leaving';
  end if;
  delete from public.space_members where space_id=p_space_id and user_id=caller_id;
  if found then update public.spaces set member_count=greatest(member_count-1,0) where id=p_space_id; end if;
end;
$$;

create function public.create_space_invite(p_space_id bigint,p_max_uses int4 default null,p_expires_at timestamptz default null)
returns text language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true); new_token text;
begin
  if not private.can_manage_space(p_space_id) then raise exception 'space manager required'; end if;
  if exists(select 1 from public.spaces where id=p_space_id and join_policy='open') then raise exception 'open spaces do not use invites'; end if;
  if p_max_uses is not null and p_max_uses <= 0 then raise exception 'max_uses must be positive'; end if;
  new_token := encode(extensions.gen_random_bytes(24),'hex');
  insert into public.space_invites(space_id,token,created_by,max_uses,expires_at)
  values(p_space_id,new_token,caller_id,p_max_uses,p_expires_at);
  return new_token;
end;
$$;

create function public.accept_space_invite(p_token text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true); inv record;
begin
  select * into inv from public.space_invites where token=p_token for update;
  if not found then raise exception 'invalid or expired invite'; end if;
  if inv.revoked_at is not null
    or (inv.expires_at is not null and inv.expires_at<=now())
    or (inv.max_uses is not null and inv.use_count>=inv.max_uses)
  then raise exception 'invalid or expired invite'; end if;
  if not exists(select 1 from public.spaces where id=inv.space_id and deleted_at is null) then raise exception 'space not found'; end if;
  if exists(select 1 from public.space_members where space_id=inv.space_id and user_id=caller_id and banned_at is not null) then raise exception 'banned from this space'; end if;
  if exists(select 1 from public.space_members where space_id=inv.space_id and user_id=caller_id) then return inv.space_id; end if;
  insert into public.space_members(space_id,user_id,role) values(inv.space_id,caller_id,'member');
  update public.spaces set member_count=member_count+1 where id=inv.space_id;
  update public.space_invites set use_count=use_count+1 where id=inv.id;
  return inv.space_id;
end;
$$;

create function public.revoke_space_invite(p_invite_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true); target_space bigint;
begin
  select space_id into target_space from public.space_invites where id=p_invite_id for update;
  if target_space is null then raise exception 'invite not found'; end if;
  if not private.can_manage_space(target_space) then raise exception 'space manager required'; end if;
  update public.space_invites set revoked_at=now() where id=p_invite_id and revoked_at is null;
end;
$$;

revoke execute on function public.join_space(bigint), public.leave_space(bigint), public.create_space_invite(bigint,int4,timestamptz), public.accept_space_invite(text), public.revoke_space_invite(bigint) from public, anon, authenticated, service_role;
grant execute on function public.join_space(bigint), public.leave_space(bigint), public.create_space_invite(bigint,int4,timestamptz), public.accept_space_invite(text), public.revoke_space_invite(bigint) to authenticated;
