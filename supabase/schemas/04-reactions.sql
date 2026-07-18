create table public.reaction_types (
  id bigserial primary key,
  key text not null,
  name text not null,
  icon text null,
  sort_order int2 not null default 0,
  created_at timestamptz not null default now()
);

create table public.post_reactions (
  post_id bigint not null references public.posts (id) on delete restrict,
  user_id bigint not null references public.profiles (id) on delete restrict,
  reaction_type_id bigint not null references public.reaction_types (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.comment_reactions (
  comment_id bigint not null references public.comments (id) on delete restrict,
  user_id bigint not null references public.profiles (id) on delete restrict,
  reaction_type_id bigint not null references public.reaction_types (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index idx_post_reactions_type_count on public.post_reactions (post_id, reaction_type_id);
create index idx_post_reactions_user_created_at on public.post_reactions (user_id, created_at);
-- 반응자 목록(get_post_reactors)의 시간순 keyset. (post_id, created_at, user_id)면 "전체" 정렬을
-- 역방향 스캔으로 잇고, 튜플 커서 비교도 이 인덱스로 받는다. type_count 인덱스는 (post_id,
-- reaction_type_id)라 시간 정렬엔 못 쓴다.
create index idx_post_reactions_post_created_at on public.post_reactions (post_id, created_at, user_id);
create index idx_comment_reactions_type_count on public.comment_reactions (comment_id, reaction_type_id);
create index idx_comment_reactions_user_created_at on public.comment_reactions (user_id, created_at);

alter table public.reaction_types
  add constraint reaction_types_key_key unique (key),
  add constraint reaction_types_key_check check (char_length(btrim(key)) between 1 and 100),
  add constraint reaction_types_name_check check (char_length(btrim(name)) between 1 and 100);

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
grant select, insert, update, delete on public.reaction_types, public.post_reactions, public.comment_reactions to service_role;
grant usage, select on sequence public.reaction_types_id_seq to service_role;

-- 반응 요약(상위 3개 아이콘 + 내 반응 id). 03-content의 list_space_posts·get_post·
-- get_post_comments 세 곳에 같은 상관 서브쿼리가 복붙돼 있던 것을 함수로 모은다. post와 comment는
-- 반응 테이블이 달라 두 함수로 갈리지만 규칙은 각각 한 곳에만 산다. post_reactions를 참조하므로
-- 그 테이블이 정의된 뒤인 이 파일에 둔다(03-content가 아니라). 호출자가 전부 security definer라
-- 이 private 함수도 소유자 권한으로 실행되므로 authenticated grant는 없다.
create function private.post_reaction_summary(p_post_id bigint, p_caller_id bigint)
returns table(top_reactions jsonb, my_reaction_id bigint)
language sql stable security definer set search_path = '' as $$
  select
    coalesce((select jsonb_agg(t.icon order by t.n desc, t.icon)
      from (
        select rt.icon, count(*) as n
        from public.post_reactions r join public.reaction_types rt on rt.id=r.reaction_type_id
        where r.post_id=p_post_id and rt.icon is not null
        group by rt.icon order by count(*) desc limit 3
      ) t),'[]'::jsonb),
    (select r.reaction_type_id from public.post_reactions r where r.post_id=p_post_id and r.user_id=p_caller_id)
$$;

create function private.comment_reaction_summary(p_comment_id bigint, p_caller_id bigint)
returns table(top_reactions jsonb, my_reaction_id bigint)
language sql stable security definer set search_path = '' as $$
  select
    coalesce((select jsonb_agg(t.icon order by t.n desc, t.icon)
      from (
        select rt.icon, count(*) as n
        from public.comment_reactions r join public.reaction_types rt on rt.id=r.reaction_type_id
        where r.comment_id=p_comment_id and rt.icon is not null
        group by rt.icon order by count(*) desc limit 3
      ) t),'[]'::jsonb),
    (select r.reaction_type_id from public.comment_reactions r where r.comment_id=p_comment_id and r.user_id=p_caller_id)
$$;
revoke execute on function private.post_reaction_summary(bigint,bigint), private.comment_reaction_summary(bigint,bigint) from public, anon, authenticated, service_role;

-- 반응자 목록. "누가 어떤 이모지로 눌렀나" 모달이 요약 이모지를 눌렀을 때 연다. 요약
-- (private.post_reaction_summary)이 상위 3개 아이콘만 세어 주는 것과 달리, 여기선 반응자를 한
-- 명씩 최신순으로 페이지네이션해 내려준다. get_post_comments와 같은 계약이다:
--   * security definer -- author_id처럼 profiles를 invoker 컬럼 grant에 기대지 않고 소유자 권한으로
--     name/avatar_url을 붙인다(반응자는 익명이 아니라 실명이므로 숨길 건 없다).
--   * can_access_post 게이트 -- 접근 못 하는 글의 반응자 명단이 새지 않게. 존재 오라클도 겸한다.
--   * keyset 페이지네이션 -- 정렬은 (created_at, user_id) 내림차순(최신 반응이 위). 커서는 직전
--     페이지 마지막 반응자의 user_id다((post_id,user_id)가 PK라 한 명을 유일하게 가리킨다). 그 행의
--     created_at을 되읽어 튜플 비교로 잇는다 -- get_post_comments가 마지막 루트 id로 잇는 것과 같은 꼴.
-- p_reaction_type_id를 주면 그 타입만(모달의 타입 탭), null이면 전체. avatar_url은 원본 경로 그대로
-- 내려주고 서명은 로더 몫이다(다른 프로필 이미지와 같은 계약).
create function public.get_post_reactors(
  p_post_id bigint,
  p_reaction_type_id bigint default null,
  p_after_user_id bigint default null,
  p_limit int4 default 30
)
returns table(
  user_id bigint,
  name text,
  avatar_url text,
  reaction_type_id bigint,
  created_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
declare
  after_created_at timestamptz;
begin
  perform private.require_current_profile(true);
  if not private.can_access_post(p_post_id) then raise exception 'post access required'; end if;
  -- null 상한 가드. `p_limit < 1`은 null일 때 참이 아니라 null이라 그냥 지나가고, `limit null`은
  -- 상한이 없다는 뜻이라 접근 가능한 반응자를 한 번에 통째로 빨아낼 수 있다(다른 읽기 RPC와 동일).
  if p_limit is null or p_limit < 1 or p_limit > 50 then raise exception 'limit must be 1 to 50'; end if;

  if p_after_user_id is not null then
    select r.created_at into after_created_at
    from public.post_reactions r where r.post_id=p_post_id and r.user_id=p_after_user_id;
  end if;

  return query
  select r.user_id, pr.name, pr.avatar_url, r.reaction_type_id, r.created_at
  from public.post_reactions r
  join public.profiles pr on pr.id=r.user_id
  where r.post_id=p_post_id
    and (p_reaction_type_id is null or r.reaction_type_id=p_reaction_type_id)
    and (p_after_user_id is null or (r.created_at, r.user_id) < (after_created_at, p_after_user_id))
  order by r.created_at desc, r.user_id desc
  limit p_limit;
end;
$$;
revoke execute on function public.get_post_reactors(bigint,bigint,bigint,int4) from public, anon, authenticated, service_role;
grant execute on function public.get_post_reactors(bigint,bigint,bigint,int4) to authenticated;
