-- 역할은 두 축이다. (1) 운영 권한: can_manage_space() = owner/admin. (2) 글 작성 권한: manager.
-- manager는 "메인 글은 manager 이상만, 댓글은 멤버 전원"인 공지형 그룹을 위한 예약값이라
-- can_manage_space가 이 값을 안 보는 건 설계다. 다만 아직 그 축을 읽는 곳이 없어 member와
-- 구분되지 않는다 -- 살리려면 spaces에 공간별 스위치(예: post_policy) + posts_insert 정책 +
-- create_post_with_attachments(security definer라 RLS를 지나친다)의 검사가 같이 필요하다.
-- is_space_member의 p_allowed_roles가 정확히 그때 쓰라고 있는 인자다. 자세한 건 docs/db/domains/02-spaces.md.
create type public.member_role as enum ('owner', 'admin', 'manager', 'member');
create type public.notification_setting as enum ('off', 'mentions', 'all');
-- 참여(읽기/쓰기)는 언제나 멤버십이 있어야 한다. 정책은 '어떻게 멤버가 되는가'만 가른다.
-- public: 검색 노출 O, 즉시 가입(승인 불필요)
-- request: 검색 노출 O, 가입 요청 후 매니저 승인 필요(승인 전까지는 멤버 아님)
-- invite_only: 검색 노출 X, 초대장으로만 가입
create type public.space_join_policy as enum ('public', 'request', 'invite_only');
create type public.space_type as enum ('group', 'community');

-- 누가 '메인 글'을 쓸 수 있는가. 댓글은 이 정책과 무관하게 언제나 멤버 전원에게 열려 있다.
-- 'managers'는 공지형 그룹을 위한 것이다 -- 학생회가 글을 올리고 나머지는 댓글로만 반응하는 형태.
-- 그게 member_role의 manager가 존재하는 이유이고, 그래서 이 축은 can_manage_space(운영 권한)와
-- 별개다: manager는 글을 쓸 수 있지만 그룹 설정·모더레이션은 여전히 못 한다.
create type public.space_post_policy as enum ('all', 'managers');

create table public.spaces (
  id bigserial primary key,
  -- 만들 때 정해지고 그 뒤로는 불변이다(update 컬럼 grant에 없고, 바꾸는 RPC도 없다).
  -- storage 경로가 이 값으로 짜여 있어서다: post-files/{pub_id}/{uuid},
  -- space-images/{pub_id}/{uuid}. 슬러그를 바꾸면 이미 올라간 모든 첨부의 경로 검사가 어긋나고,
  -- 그걸 따라가려면 object를 새 경로로 옮기고 storage_path를 다시 쓰는 배치가 필요하다.
  pub_id text not null default left(replace(gen_random_uuid()::text, '-', ''), 12),
  type public.space_type not null,
  name text not null,
  description text null,
  image_url text null,
  join_policy public.space_join_policy not null default 'public',
  post_policy public.space_post_policy not null default 'all',
  -- 이 공간에서 익명 글/댓글을 쓸 수 있는지. 끄면 새 익명 글이 안 만들어진다(trg_enforce_anonymous_
  -- allowed). 이미 올라간 익명 글은 그대로 익명이다 -- is_anonymous는 불변이고, 소급해서 까면
  -- 익명을 믿고 쓴 사람을 배신하는 것이다.
  allow_anonymous_posts boolean not null default true,
  member_count int4 not null default 0,
  created_by bigint null references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz null,
  deleted_at timestamptz null,
  deleted_by bigint null references public.profiles (id) on delete set null
);

-- 익명 작성 권한의 한시적 정지. 관리자가 익명 글의 작성자를 **모른 채로** 그 사람의 익명 권한만 뺏는다.
--
-- 왜 밴이 아니라 익명 정지인가: 밴은 익명을 깬다. 밴은 해제·감사·이의신청 때문에 관리자가 목록을
-- 봐야만 하는데, 익명 글의 작성자를 밴하면 그 목록에 새로 뜬 단 한 명이 곧 작성자다(집합 차집합 한 번).
-- 반면 익명 정지는 스스로 만료되므로 관리자가 볼 이유가 없고, 그래서 **관리자에게 아무 관측 가능한
-- 상태도 남기지 않을 수 있다.** RLS가 본인에게만 보여준다. 관리자는 효과만 얻고 정보는 못 얻는다.
--
-- 처방도 더 정확하다: 문제가 "익명을 악용한다"면 뺏을 것은 익명이지 계정이 아니다.
create table public.space_anonymity_suspensions (
  space_id bigint not null references public.spaces (id) on delete restrict,
  user_id bigint not null references public.profiles (id) on delete restrict,
  suspended_until timestamptz not null,
  -- 누범 횟수. 관리자는 이 사람이 전에도 정지됐는지 알 수 없으므로(그게 익명의 조건이다) 누범
  -- 가중을 스스로 판단할 수가 없다. 그래서 서버가 대신 센다 -- suspend_anonymity가 이 값으로
  -- 형량을 배가한다. 관리자는 여전히 아무것도 관측하지 못한다.
  strike_count int4 not null default 1,
  suspended_by bigint null references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (space_id, user_id)
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

-- 그룹별 게시판/말머리(정보·공식·잡담, 학생회 업무 구분 등). 관리자(can_manage_space)가
-- 정의하고 글이 하나에 속한다(posts.category_id). 0개면 프론트는 분류 없이 전체를 보여준다.
create table public.space_categories (
  id bigserial primary key,
  space_id bigint not null references public.spaces (id) on delete restrict,
  name text not null,
  sort_order int4 not null default 0,
  created_at timestamptz not null default now()
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
create index idx_space_categories_space on public.space_categories (space_id, sort_order, id);
create unique index space_categories_space_name_key
on public.space_categories (space_id, lower(btrim(name)));

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

alter table public.space_categories
  add constraint space_categories_name_check check (char_length(btrim(name)) between 1 and 50),
  add constraint space_categories_sort_order_check check (sort_order >= 0);

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
-- 게시판을 정리할 수 있는지 = owner/admin/manager. **운영 권한(can_manage_space)과 다른 층이다.**
-- manager가 가진 건 정확히 셋뿐이다: 글 고정/해제, 카테고리 관리, 그리고 post_policy='managers'인
-- 그룹에서의 글쓰기. 그룹 설정을 바꾸거나, 초대장을 만들거나, 가입을 승인하거나, 남의 글을 지우거나,
-- 익명을 정지시키는 건 여전히 못 한다 -- 그건 전부 can_manage_space다.
--
-- 이 구분이 요점이다: 게시판을 굴리는 일(고정·분류)과 사람·규칙을 다루는 일(설정·모더레이션·권한)은
-- 다른 신뢰를 요구한다. 공지 그룹의 학생회 간부는 앞엣것만 필요하다.
create function private.can_curate_space(p_space_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_space_member(p_space_id, array['owner','admin','manager']::public.member_role[])
$$;
-- 이 공간에 **메인 글**을 쓸 수 있는지. 참여(댓글·반응)와 갈라지는 유일한 지점이다.
-- posts_insert 정책과 create_post_with_attachments가 **둘 다** 이걸 불러야 한다: 후자는
-- security definer라 RLS를 지나치므로, 정책만 고치면 RPC로 그대로 우회된다.
create function private.can_post_in_space(p_space_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when (select s.post_policy from public.spaces s where s.id=p_space_id) = 'managers'
      then private.can_curate_space(p_space_id)
    else private.can_participate_space(p_space_id)
  end
$$;
revoke execute on function private.is_space_member(bigint,public.member_role[]), private.can_manage_space(bigint,public.member_role[]), private.can_participate_space(bigint), private.can_curate_space(bigint), private.can_post_in_space(bigint) from public, anon, service_role;
grant execute on function private.is_space_member(bigint,public.member_role[]),private.can_manage_space(bigint,public.member_role[]),private.can_participate_space(bigint),private.can_curate_space(bigint),private.can_post_in_space(bigint) to authenticated;

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

-- 지금 이 공간에서 익명으로 쓸 수 있는지. 공간이 익명을 허용하고, 내가 정지 중이 아니어야 한다.
-- posts/comments의 insert 트리거가 이걸 강제한다 -- RPC에서만 막으면 컬럼 grant로 테이블에 직접
-- insert해서 우회할 수 있다.
create function private.can_post_anonymously(p_space_id bigint, p_user_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.spaces s where s.id=p_space_id and s.allow_anonymous_posts)
    and not exists(
      select 1 from public.space_anonymity_suspensions x
      where x.space_id=p_space_id and x.user_id=p_user_id and x.suspended_until > now()
    )
$$;
revoke execute on function private.can_post_anonymously(bigint,bigint) from public, anon, authenticated, service_role;

create function private.enforce_anonymous_allowed()
returns trigger language plpgsql security definer set search_path = '' as $$
declare target_space_id bigint;
begin
  if not new.is_anonymous then return new; end if;

  if tg_table_name='posts' then
    target_space_id := new.space_id;
  else
    select p.space_id into target_space_id from public.posts p where p.id=new.post_id;
  end if;

  if not private.can_post_anonymously(target_space_id, new.author_id) then
    raise exception 'anonymous posting is not available in this space';
  end if;
  return new;
end;
$$;
revoke execute on function private.enforce_anonymous_allowed() from public, anon, authenticated, service_role;

alter table public.spaces enable row level security;
alter table public.space_members enable row level security;
alter table public.space_anonymity_suspensions enable row level security;
alter table public.space_invites enable row level security;
alter table public.space_join_requests enable row level security;
alter table public.space_categories enable row level security;
-- 본인 것만 보인다. 관리자에게 보이면 익명 글 작성자를 밴할 때와 똑같은 유출이 생긴다 --
-- "익명 글 X의 작성자를 정지" 후 목록을 다시 읽으면 새로 뜬 한 명이 곧 X의 작성자다.
-- 쓰기는 RPC(suspend_*_author_anonymity)로만 간다.
create policy space_anonymity_suspensions_select on public.space_anonymity_suspensions
  for select to authenticated using (user_id=private.current_profile_id());
create policy spaces_select on public.spaces for select to authenticated using (
  deleted_at is null and (
    (join_policy in ('public','request') and (select private.is_accepted_user()))
    or private.is_space_member(id)
  )
);
-- 관리자(owner/admin)가 고칠 수 있는 건 컬럼 grant가 정한다: name, description,
-- allow_anonymous_posts, post_policy.
-- join_policy는 전환 시 대기 중인 가입 요청을 먼저 처리해야 해서 set_space_join_policy가 맡는다.
-- member_count는 캐시라 join/leave RPC만 건드린다. image_url은 finalize_space_image가 맡는다.
create policy spaces_update on public.spaces for update to authenticated
  using (deleted_at is null and private.can_manage_space(id))
  with check (deleted_at is null and private.can_manage_space(id));
create policy space_members_select on public.space_members for select to authenticated using (private.is_space_member(space_id));
create policy space_members_update on public.space_members for update to authenticated using (user_id=private.current_profile_id() and private.is_space_member(space_id)) with check (user_id=private.current_profile_id() and private.is_space_member(space_id));
create policy space_invites_select on public.space_invites for select to authenticated using (private.can_manage_space(space_id));
-- 본인 요청 또는 관리하는 공간의 요청만 조회. delete는 요청 취소(본인) 및 거절(매니저)을
-- 겸한다 -- 승인만 멤버십·member_count를 건드리므로 RPC(approve_join_request)로 간다.
create policy space_join_requests_select on public.space_join_requests for select to authenticated using (user_id=private.current_profile_id() or private.can_manage_space(space_id));
create policy space_join_requests_delete on public.space_join_requests for delete to authenticated using (user_id=private.current_profile_id() or private.can_manage_space(space_id));
-- 카테고리 조회는 멤버 전원, 관리(생성·수정·삭제)는 can_curate_space = owner/admin/**manager**.
-- 게시판을 분류하는 일은 게시판을 굴리는 일이지 사람·규칙을 다루는 일이 아니다.
create policy space_categories_select on public.space_categories for select to authenticated using (private.is_space_member(space_id));
create policy space_categories_insert on public.space_categories for insert to authenticated with check (private.can_curate_space(space_id));
create policy space_categories_update on public.space_categories for update to authenticated using (private.can_curate_space(space_id)) with check (private.can_curate_space(space_id));
create policy space_categories_delete on public.space_categories for delete to authenticated using (private.can_curate_space(space_id));

grant select (id,pub_id,type,name,description,image_url,join_policy,post_policy,allow_anonymous_posts,member_count,created_at,deleted_at) on public.spaces to authenticated;
-- suspended_by는 뺀다. 본인은 정지 사실과 기간만 알면 되고, 누가 걸었는지까지 알면 보복 대상이 된다.
grant select (space_id,user_id,suspended_until) on public.space_anonymity_suspensions to authenticated;
grant update (name,description,allow_anonymous_posts,post_policy) on public.spaces to authenticated;
grant select on public.space_members to authenticated;
grant update (notification_setting,pinned_at) on public.space_members to authenticated;
grant select on public.space_invites to authenticated;
grant select, delete on public.space_join_requests to authenticated;
grant select on public.space_categories to authenticated;
grant insert (space_id,name,sort_order) on public.space_categories to authenticated;
grant update (name,sort_order) on public.space_categories to authenticated;
grant delete on public.space_categories to authenticated;
grant usage, select on sequence public.space_categories_id_seq to authenticated;
grant select, insert, update, delete on public.spaces, public.space_members, public.space_anonymity_suspensions, public.space_invites, public.space_join_requests, public.space_categories to service_role;
grant usage, select on sequence public.spaces_id_seq, public.space_invites_id_seq, public.space_categories_id_seq to service_role;

-- 'joined'(즉시 가입 또는 이미 멤버) 또는 'requested'(승인 대기)를 돌려준다. request
-- 정책 공간은 멤버가 되는 게 아니라 요청만 쌓이므로, 호출자가 어느 쪽인지 알아야 한다.
create function public.join_space(p_space_id bigint)
returns text language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true); space_policy public.space_join_policy;
begin
  select join_policy into space_policy from public.spaces where id=p_space_id and deleted_at is null;
  if space_policy is null then raise exception 'space not found'; end if;
  -- 멤버십·밴 확인을 invite_only 분기보다 **먼저** 한다. 그래야 invite_only를 "없는 공간"과
  -- 똑같이 응답할 수 있다 -- 순차 id를 훑어 비공개 공간의 존재를 열거하는 오라클을 막는다.
  -- 이미 멤버/밴인 사람은 어차피 그 공간을 아는 사람이라 여기서 갈라도 새어 나갈 게 없다.
  if exists(select 1 from public.space_members where space_id=p_space_id and user_id=caller_id and banned_at is not null) then raise exception 'banned from this space'; end if;
  if exists(select 1 from public.space_members where space_id=p_space_id and user_id=caller_id) then return 'joined'; end if;
  -- 비멤버에게 invite_only는 존재 자체를 숨긴다(spaces_select가 숨기는 것과 같은 응답).
  if space_policy='invite_only' then raise exception 'space not found'; end if;
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
  -- banned_at is null: 밴당한 사람이 leave로 자기 밴 기록(space_members 행)을 지우고 join_space로
  -- 재가입해 밴을 무효화하는 걸 막는다. 밴은 탈퇴로 풀리지 않는다.
  delete from public.space_members where space_id=p_space_id and user_id=caller_id and banned_at is null;
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

-- 멤버 역할 변경. RPC인 이유: space_members_update 정책은 **본인 행**만 열고 컬럼 grant도
-- notification_setting/pinned_at뿐이라, "관리자가 남의 role을 바꾼다"는 정책으로 표현할 수 없다
-- (set_post_pinned가 RPC인 것과 같은 이유).
--
-- 이게 없으면 manager를 임명할 방법이 없어서 post_policy='managers'가 사실상 owner/admin 전용
-- 그룹이 된다 -- 즉 "특정 사람만 글 쓰게" 하려던 게 안 된다.
-- owner와 admin은 권한이 같고, **서로를 임명하고 서로를 내릴 수 있다.** 그래야 실제로 대등하다.
-- 단 하나의 예외가 owner이고, 그게 이 함수와 transfer_space_ownership을 가르는 선이다.
create function public.set_space_member_role(p_space_id bigint, p_user_id bigint, p_role public.member_role)
returns void language plpgsql security definer set search_path = '' as $$
declare
  caller_id bigint := private.require_current_profile(true);
  target_role public.member_role;
begin
  if not private.can_manage_space(p_space_id) then raise exception 'space manager required'; end if;

  select role into target_role from public.space_members
  where space_id=p_space_id and user_id=p_user_id and banned_at is null
  for update;
  if target_role is null then raise exception 'not a member of this space'; end if;

  -- owner는 이 함수로 세우지도 내리지도 못한다. 이 한 줄이 두 가지를 동시에 막는다.
  -- (1) admin이 owner를 끌어내리는 쿠데타. owner만이 자기 자리를 넘길 수 있다.
  -- (2) "남을 승격시킨다"가 조용히 "내 소유권을 넘긴다"가 되는 사고 -- owner는 space당 정확히
  --     1명이라(space_members_one_owner_key) 새 owner를 세우는 건 반드시 기존 owner를 내리는
  --     일이기도 하다. 그 맞바꿈은 transfer_space_ownership이 명시적으로 한다.
  if p_role='owner' or target_role='owner' then
    raise exception 'ownership transfer is a separate operation';
  end if;

  if target_role=p_role then return; end if;
  -- trg_notify_on_role_changed가 여기서 도는데, actor는 싣지 않는다
  -- (notifications_actor_shape_check가 강제 -- 행정 처분은 기관이 한다).
  update public.space_members set role=p_role where space_id=p_space_id and user_id=p_user_id;
end;
$$;

-- 소유권 이양. owner만 부를 수 있고, **현재 admin에게만** 넘긴다 -- 일반 멤버에게 바로 넘기려면
-- 먼저 admin으로 올려야 한다(그룹을 통째로 넘기는 일이라 한 단계 더 밟게 한다).
-- 끝나면 기존 owner는 admin이 된다. 권한이 같으므로 실질적으로 잃는 건 '이양권' 하나뿐이다.
create function public.transfer_space_ownership(p_space_id bigint, p_new_owner_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare
  caller_id bigint := private.require_current_profile(true);
  target_role public.member_role;
begin
  if not private.is_space_member(p_space_id, array['owner']::public.member_role[]) then
    raise exception 'space owner required';
  end if;
  if p_new_owner_id=caller_id then return; end if;

  select role into target_role from public.space_members
  where space_id=p_space_id and user_id=p_new_owner_id and banned_at is null
  for update;
  if target_role is null then raise exception 'not a member of this space'; end if;
  if target_role<>'admin' then raise exception 'ownership can only be transferred to an admin'; end if;

  -- 순서가 중요하다. space_members_one_owner_key는 deferrable이 아닌 부분 유니크 인덱스라
  -- 커밋까지 미룰 수가 없다 -- 새 owner를 먼저 세우면 그 순간 owner가 둘이 되어 즉시 걸린다.
  -- 기존 owner를 먼저 내리면 잠깐 owner가 0명인데, 부분 유니크 인덱스는 0을 문제 삼지 않는다.
  -- "정확히 1명"을 보는 건 trg_validate_space_owner이고 그건 deferred라 커밋 시점에만 센다.
  update public.space_members set role='admin' where space_id=p_space_id and user_id=caller_id;
  update public.space_members set role='owner' where space_id=p_space_id and user_id=p_new_owner_id;
end;
$$;

-- spaces에는 insert grant가 없다(service_role만). 그래서 공간을 만드는 유일한 길이 이 RPC다.
--
-- group은 app admin만 만든다. 공식 그룹은 학교 조직을 그대로 옮긴 것이라 이름이 곧 권위이고
-- (spaces_active_group_name_key가 이름을 유일하게 잡는다), 아무나 '학생회'를 선점하면 안 된다.
-- community는 accepted면 누구나 만든다.
--
-- 생성자는 owner다. 안 그러면 owner가 0명인 공간이 태어나 trg_validate_space_owner가 커밋을
-- 거부한다 -- 즉 '멤버 없는 빈 공간'은 표현할 수조차 없다.
create function public.create_space(
  p_type public.space_type,
  p_name text,
  p_description text default null,
  p_pub_id text default null,
  p_join_policy public.space_join_policy default 'public',
  p_post_policy public.space_post_policy default 'all',
  p_allow_anonymous_posts boolean default true
)
returns bigint language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true); new_space_id bigint;
begin
  if p_type='group' then perform private.require_app_admin(); end if;
  if p_pub_id is not null and exists(select 1 from public.spaces where pub_id=p_pub_id) then
    raise exception 'pub id already taken';
  end if;

  insert into public.spaces(type,name,description,join_policy,post_policy,allow_anonymous_posts,created_by)
  values(p_type,btrim(p_name),nullif(btrim(coalesce(p_description,'')),''),p_join_policy,p_post_policy,p_allow_anonymous_posts,caller_id)
  returning id into new_space_id;

  insert into public.space_members(space_id,user_id,role) values(new_space_id,caller_id,'owner');
  -- pub_id를 안 넘기면 컬럼 default(랜덤 12자)를 그대로 둔다. coalesce가 그 값을 자기 자신으로
  -- 되쓰므로 슬러그 생성 규칙이 스키마 한 곳에만 산다.
  update public.spaces set pub_id=coalesce(p_pub_id,pub_id), member_count=1 where id=new_space_id;
  return new_space_id;
end;
$$;

-- join_policy만 컬럼 grant에서 빠져 있는 이유가 이 함수다. request에서 벗어나는 순간 대기 중인
-- 가입 요청은 아무도 승인할 수 없는 유령이 된다 -- approve_join_request는 여전히 돌지만 그 공간의
-- 요청함을 띄울 화면이 사라지기 때문이다. 서버가 대신 일괄 수락/거절해 주지도 않는다: 그건 관리자가
-- 내려야 할 판단이지 정책 전환의 부수 효과일 수 없다. 그래서 먼저 비우게 하고 막는다.
create function public.set_space_join_policy(p_space_id bigint, p_join_policy public.space_join_policy)
returns void language plpgsql security definer set search_path = '' as $$
declare current_policy public.space_join_policy;
begin
  perform private.require_current_profile(true);
  if not private.can_manage_space(p_space_id) then raise exception 'space manager required'; end if;

  select join_policy into current_policy from public.spaces
  where id=p_space_id and deleted_at is null
  for update;
  if current_policy is null then raise exception 'space not found'; end if;
  if current_policy=p_join_policy then return; end if;

  if current_policy='request' and exists(select 1 from public.space_join_requests where space_id=p_space_id) then
    raise exception 'resolve pending join requests first';
  end if;

  update public.spaces set join_policy=p_join_policy where id=p_space_id;
end;
$$;

-- 공간 삭제에 owner의 문이 없는 건 의도다. 그룹 하나에는 남의 글이 수백 개 실려 있어서, 지우는
-- 일은 owner 한 사람의 것이 아니다. 지금은 운영자가 service_role로 연다.
create function public.soft_delete_space(p_space_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_service_role();
  update public.spaces set deleted_at=now() where id=p_space_id and deleted_at is null;
  if not found then raise exception 'space not found'; end if;
end;
$$;

-- soft delete된 공간을 흔적까지 지운다. **blob이 먼저 나가야 한다.**
--
-- enqueue_due_storage_cleanup이 삭제 7일이 지난 공간의 첨부와 이미지를 큐에 넣고, 파일이 Storage
-- 에서 실제로 지워진 뒤에야 complete_storage_cleanup이 post_attachments 행을 지우고 image_url을
-- 비운다. 그러니 그 둘이 아직 남아 있다는 건 곧 파일이 아직 살아 있다는 뜻이다. 그때 이 함수가
-- 강제로 밀면 큐가 가리키던 행이 먼저 사라져 blob이 영영 고아로 남는다 -- 다음 실행에서 다시 본다.
create function private.purge_space(p_space_id bigint)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if exists(
    select 1 from public.post_attachments a join public.posts p on p.id=a.post_id
    where p.space_id=p_space_id
  ) or exists(select 1 from public.spaces where id=p_space_id and image_url is not null) then
    return false;
  end if;

  delete from public.comment_reactions r using public.comments c join public.posts p on p.id=c.post_id
  where r.comment_id=c.id and p.space_id=p_space_id;
  delete from public.post_reactions r using public.posts p
  where r.post_id=p.id and p.space_id=p_space_id;
  delete from public.notifications where space_id=p_space_id;

  -- comments.parent_id가 on delete restrict라 부모와 자식을 한 DELETE에 함께 담을 수 없다.
  -- 잎부터 벗겨 내려간다. 멘션은 comments/posts에 cascade로 매달려 같이 떨어진다.
  loop
    delete from public.comments c using public.posts p
    where c.post_id=p.id and p.space_id=p_space_id
      and not exists(select 1 from public.comments child where child.parent_id=c.id);
    exit when not found;
  end loop;

  delete from public.posts where space_id=p_space_id;
  delete from public.space_join_requests where space_id=p_space_id;
  delete from public.space_invites where space_id=p_space_id;
  delete from public.space_anonymity_suspensions where space_id=p_space_id;
  delete from public.space_categories where space_id=p_space_id;
  -- trg_validate_space_owner는 deferred라 커밋 시점에 센다. 그때는 spaces 행도 없어서 통과한다.
  delete from public.space_members where space_id=p_space_id;
  delete from public.spaces where id=p_space_id;
  return true;
end;
$$;

create function public.purge_due_spaces(p_limit int4 default 20)
returns table(purged int4, skipped int4)
language plpgsql security definer set search_path = '' as $$
declare target_id bigint;
begin
  perform private.require_service_role();
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'limit must be between 1 and 100'; end if;
  purged := 0;
  skipped := 0;
  for target_id in
    select id from public.spaces
    where deleted_at < now() - interval '7 days'
    order by deleted_at, id
    limit p_limit
  loop
    if private.purge_space(target_id) then purged := purged + 1; else skipped := skipped + 1; end if;
  end loop;
  return next;
end;
$$;

revoke execute on function public.join_space(bigint), public.leave_space(bigint), public.create_space(public.space_type,text,text,text,public.space_join_policy,public.space_post_policy,boolean), public.set_space_join_policy(bigint,public.space_join_policy), public.create_space_invite(bigint,bigint,timestamptz), public.accept_space_invite(text), public.revoke_space_invite(bigint), public.approve_join_request(bigint,bigint), public.set_space_member_role(bigint,bigint,public.member_role), public.transfer_space_ownership(bigint,bigint) from public, anon, authenticated, service_role;
grant execute on function public.join_space(bigint), public.leave_space(bigint), public.create_space(public.space_type,text,text,text,public.space_join_policy,public.space_post_policy,boolean), public.set_space_join_policy(bigint,public.space_join_policy), public.create_space_invite(bigint,bigint,timestamptz), public.accept_space_invite(text), public.revoke_space_invite(bigint), public.approve_join_request(bigint,bigint), public.set_space_member_role(bigint,bigint,public.member_role), public.transfer_space_ownership(bigint,bigint) to authenticated;
revoke execute on function private.purge_space(bigint) from public, anon, authenticated, service_role;
revoke execute on function public.soft_delete_space(bigint), public.purge_due_spaces(int4) from public, anon, authenticated, service_role;
grant execute on function public.soft_delete_space(bigint), public.purge_due_spaces(int4) to service_role;
