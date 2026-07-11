create type public.member_role as enum ('owner', 'admin', 'manager', 'member');
create type public.notification_setting as enum ('off', 'mentions', 'all');
-- 참여(읽기/쓰기)는 언제나 멤버십이 있어야 한다. 정책은 '어떻게 멤버가 되는가'만 가른다.
-- public: 검색 노출 O, 즉시 가입(승인 불필요)
-- request: 검색 노출 O, 가입 요청 후 매니저 승인 필요(승인 전까지는 멤버 아님)
-- invite_only: 검색 노출 X, 초대장으로만 가입
create type public.space_join_policy as enum ('public', 'request', 'invite_only');
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
  -- null이면 공유 링크(토큰 아는 사람 누구나), 값이 있으면 그 사람만 수락 가능.
  -- set null이 아니라 cascade인 이유: 대상이 삭제되면 초대는 무의미하고, null로
  -- 바뀌면 대상 지정 초대가 조용히 공유 링크로 열려버린다(보안 격하).
  target_user_id bigint null references public.profiles (id) on delete cascade,
  created_by bigint null references public.profiles (id) on delete set null,
  expires_at timestamptz null,
  revoked_at timestamptz null,
  created_at timestamptz not null default now()
);

-- request 정책 공간의 대기 중인 가입 요청. 승인 전까지는 멤버가 아니므로 space_members가
-- 아니라 여기에 산다(초대가 space_invites에 따로 사는 것과 같은 이유). 덕분에
-- is_space_member/member_count/owner 유일성 같은 멤버십 불변식은 전혀 건드리지 않는다.
create table public.space_join_requests (
  space_id bigint not null references public.spaces (id) on delete restrict,
  user_id bigint not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (space_id, user_id)
);

create index idx_spaces_active_directory on public.spaces (join_policy, member_count)
where deleted_at is null;
create index idx_space_join_requests_space on public.space_join_requests (space_id, created_at);
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
  add constraint space_invites_token_check check (char_length(token) between 16 and 128);

create function private.is_space_member(p_space_id bigint,p_allowed_roles public.member_role[] default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.space_members sm join public.spaces s on s.id=sm.space_id join public.profiles p on p.id=sm.user_id
    where sm.space_id=p_space_id and p.auth_user_id=(select auth.uid()) and p.status='accepted' and p.deleted_at is null and s.deleted_at is null and sm.banned_at is null
      and (p_allowed_roles is null or sm.role=any(p_allowed_roles)))
$$;
create function private.can_manage_space(p_space_id bigint,p_allowed_roles public.member_role[] default array['owner','admin']::public.member_role[])
returns boolean language sql stable security definer set search_path = '' as $$ select private.is_space_member(p_space_id,p_allowed_roles) $$;
-- 공간 콘텐츠(글) 참여 가능 여부. 모든 공간이 멤버십을 요구하므로 곧 is_space_member다.
-- is_space_member가 이미 accepted·미삭제 프로필·미삭제 공간·비-밴을 검사한다.
create function private.can_participate_space(p_space_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_space_member(p_space_id)
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
alter table public.space_join_requests enable row level security;
create policy spaces_select on public.spaces for select to authenticated using (
  deleted_at is null and (
    (join_policy in ('public','request') and (select private.is_accepted_user()))
    or private.is_space_member(id)
  )
);
create policy space_members_select on public.space_members for select to authenticated using (private.is_space_member(space_id));
create policy space_members_update on public.space_members for update to authenticated using (user_id=private.current_profile_id() and private.is_space_member(space_id)) with check (user_id=private.current_profile_id() and private.is_space_member(space_id));
create policy space_invites_select on public.space_invites for select to authenticated using (private.can_manage_space(space_id));
-- 본인 요청 또는 관리하는 공간의 요청만 조회. delete는 요청 취소(본인) 및 거절(매니저)을
-- 겸한다 -- 승인만 멤버십·member_count를 건드리므로 RPC(approve_join_request)로 간다.
create policy space_join_requests_select on public.space_join_requests for select to authenticated using (user_id=private.current_profile_id() or private.can_manage_space(space_id));
create policy space_join_requests_delete on public.space_join_requests for delete to authenticated using (user_id=private.current_profile_id() or private.can_manage_space(space_id));

grant select (id,pub_id,type,name,description,image_url,join_policy,member_count,created_at,deleted_at) on public.spaces to authenticated;
grant select on public.space_members to authenticated;
grant update (notification_setting,pinned_at) on public.space_members to authenticated;
grant select on public.space_invites to authenticated;
grant select, delete on public.space_join_requests to authenticated;
grant select, insert, update, delete on public.spaces, public.space_members, public.space_invites, public.space_join_requests to service_role;
grant usage, select on sequence public.spaces_id_seq, public.space_invites_id_seq to service_role;

-- 'joined'(즉시 가입 또는 이미 멤버) 또는 'requested'(승인 대기)를 돌려준다. request
-- 정책 공간은 멤버가 되는 게 아니라 요청만 쌓이므로, 호출자가 어느 쪽인지 알아야 한다.
create function public.join_space(p_space_id bigint)
returns text language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true); space_policy public.space_join_policy;
begin
  select join_policy into space_policy from public.spaces where id=p_space_id and deleted_at is null;
  if space_policy is null then raise exception 'space not found'; end if;
  if space_policy='invite_only' then raise exception 'invite required to join this space'; end if;
  if exists(select 1 from public.space_members where space_id=p_space_id and user_id=caller_id and banned_at is not null) then raise exception 'banned from this space'; end if;
  if exists(select 1 from public.space_members where space_id=p_space_id and user_id=caller_id) then return 'joined'; end if;
  if space_policy='request' then
    insert into public.space_join_requests(space_id,user_id) values(p_space_id,caller_id) on conflict do nothing;
    return 'requested';
  end if;
  insert into public.space_members(space_id,user_id,role) values(p_space_id,caller_id,'member') on conflict do nothing;
  if found then update public.spaces set member_count=member_count+1 where id=p_space_id; end if;
  return 'joined';
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

-- p_target_user_id가 null이면 공유 링크, 값이 있으면 그 사람만 수락 가능한 대상 지정 초대.
create function public.create_space_invite(p_space_id bigint,p_target_user_id bigint default null,p_expires_at timestamptz default null)
returns text language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true); new_token text; expires timestamptz;
begin
  if not private.can_manage_space(p_space_id) then raise exception 'space manager required'; end if;
  if p_target_user_id is not null and not exists(
    select 1 from public.profiles where id=p_target_user_id and status='accepted' and deleted_at is null
  ) then raise exception 'invite target must be an accepted user'; end if;
  -- 어떤 초대도 30일을 넘겨 살지 못한다. 미지정이면 그 상한을 기본값으로 쓴다
  -- ('영원한 초대'를 없애는 게 상한의 목적이라 null을 무기한으로 두지 않는다).
  -- '보통 며칠'이라는 기본값은 정책이라 호출자(UI)가 정한다.
  expires := coalesce(p_expires_at, now() + interval '30 days');
  if expires <= now() or expires > now() + interval '30 days' then
    raise exception 'invite expiry must be within 30 days';
  end if;
  new_token := encode(extensions.gen_random_bytes(24),'hex');
  insert into public.space_invites(space_id,token,target_user_id,created_by,expires_at)
  values(p_space_id,new_token,p_target_user_id,caller_id,expires);
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
  then raise exception 'invalid or expired invite'; end if;
  -- 대상 지정 초대는 그 사람만 수락한다. 엉뚱한 사람에게는 초대의 존재 자체를
  -- 숨기려고 여느 무효 초대와 같은 메시지로 거부한다.
  if inv.target_user_id is not null and inv.target_user_id<>caller_id then raise exception 'invalid or expired invite'; end if;
  if not exists(select 1 from public.spaces where id=inv.space_id and deleted_at is null) then raise exception 'space not found'; end if;
  if exists(select 1 from public.space_members where space_id=inv.space_id and user_id=caller_id and banned_at is not null) then raise exception 'banned from this space'; end if;
  if exists(select 1 from public.space_members where space_id=inv.space_id and user_id=caller_id) then return inv.space_id; end if;
  insert into public.space_members(space_id,user_id,role) values(inv.space_id,caller_id,'member');
  update public.spaces set member_count=member_count+1 where id=inv.space_id;
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

-- request 정책 공간의 가입 요청을 승인해 멤버로 올린다(매니저 전용). 거절·요청 취소는
-- RPC가 아니라 space_join_requests 직접 delete로 처리한다(정책이 본인 또는 매니저로 제한).
create function public.approve_join_request(p_space_id bigint,p_user_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true);
begin
  if not private.can_manage_space(p_space_id) then raise exception 'space manager required'; end if;
  delete from public.space_join_requests where space_id=p_space_id and user_id=p_user_id;
  if not found then raise exception 'join request not found'; end if;
  -- 요청 후 차단됐거나 탈퇴한 사용자는 요청만 정리하고 승격하지 않는다(member_count 오염 방지).
  if exists(select 1 from public.space_members where space_id=p_space_id and user_id=p_user_id and banned_at is not null) then return; end if;
  if not exists(select 1 from public.profiles where id=p_user_id and status='accepted' and deleted_at is null) then return; end if;
  insert into public.space_members(space_id,user_id,role) values(p_space_id,p_user_id,'member') on conflict do nothing;
  if found then update public.spaces set member_count=member_count+1 where id=p_space_id; end if;
end;
$$;

revoke execute on function public.join_space(bigint), public.leave_space(bigint), public.create_space_invite(bigint,bigint,timestamptz), public.accept_space_invite(text), public.revoke_space_invite(bigint), public.approve_join_request(bigint,bigint) from public, anon, authenticated, service_role;
grant execute on function public.join_space(bigint), public.leave_space(bigint), public.create_space_invite(bigint,bigint,timestamptz), public.accept_space_invite(text), public.revoke_space_invite(bigint), public.approve_join_request(bigint,bigint) to authenticated;
