set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_post_comments(p_post_id bigint, p_after_id bigint DEFAULT NULL::bigint, p_limit integer DEFAULT 20)
 RETURNS TABLE(comment_id bigint, parent_id bigint, content text, is_anonymous boolean, author_attribution public.author_attribution, author jsonb, anonymous_label text, is_author_anonymity_suspended boolean, is_mine boolean, is_deleted boolean, created_at timestamp with time zone, updated_at timestamp with time zone, reaction_count bigint, top_reactions jsonb, my_reaction_id bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id bigint := private.require_current_profile(true);
  after_created_at timestamptz;
  post_author_id bigint;
  post_is_anonymous boolean;
begin
  if not private.can_access_post(p_post_id) then raise exception 'post access required'; end if;
  -- null을 빼먹으면 `limit null`이 되어 상한이 통째로 사라진다(null < 1은 참이 아니라 null이라
  -- 이 가드를 그냥 지나간다). 그러면 클라이언트가 p_limit=null 한 번으로 접근 가능한 글/댓글을
  -- 전부 빨아낼 수 있다 -- 05-chat의 읽기 RPC들이 처음부터 `p_limit is null`을 함께 본 이유다.
  if p_limit is null or p_limit < 1 or p_limit > 50 then raise exception 'limit must be 1 to 50'; end if;

  select p.author_id, p.is_anonymous into post_author_id, post_is_anonymous
  from public.posts p where p.id=p_post_id;

  -- 못 찾으면 끊는다 -- 이유는 list_space_posts 쪽 주석에 있다(null을 흘리면 행 비교가 null이 되어
  -- 예외 없이 빈 페이지가 나간다). 커서는 이 글의 루트 댓글이어야 하므로 post 소속까지 본다.
  if p_after_id is not null then
    select c.created_at into after_created_at
    from public.comments c where c.id=p_after_id and c.post_id=p_post_id;
    if not found then raise exception 'cursor comment not found in this post'; end if;
  end if;

  return query
  with recursive
  -- 익명 작성자마다 그 글 안에서만 유효한 번호를 매긴다. author_id는 절대 밖으로 안 나가고 번호만
  -- 나간다. 번호를 서버가 매기는 게 핵심이다 -- 클라이언트가 매기려면 작성자별 키가 필요한데 그게
  -- 곧 author_id고, 그러면 익명이 깨진다.
  --
  -- 페이지가 아니라 글 전체를 기준으로 센다. 페이지마다 새로 세면 2페이지의 "익명1"이 1페이지의
  -- "익명1"과 다른 사람이 되어버린다. 그리고 이 번호는 이 글 안에서만 유효하다 -- 같은 사람이 다른
  -- 글에선 다른 번호를 받으므로 여러 글에 걸쳐 "같은 익명"이라고 이어 붙일 수 없다.
  anon_index as (
    -- 삭제된 익명 댓글도 번호 매김에 포함한다(deleted_at 필터 없음). 빼면 A(익명1)가 지워질 때
    -- B가 익명2에서 익명1로 당겨져, 예전 화면·알림에 남은 "익명2"가 다른 사람을 가리키게 된다.
    -- tombstone은 author_id와 is_anonymous를 그대로 유지하므로 앵커로 쓸 수 있다. 번호는 그
    -- 작성자의 (삭제 여부 무관) 최초 댓글 시각으로 고정된다.
    select c.author_id, dense_rank() over (order by min(c.created_at), min(c.id)) as idx
    from public.comments c
    where c.post_id=p_post_id and c.is_anonymous
      -- 글쓴이 본인은 번호가 아니라 "글쓴이"로 표시하므로 번호 매김에서 뺀다.
      and not (post_is_anonymous and c.author_id=post_author_id)
    group by c.author_id
  ),
  roots as (
    select c.id, c.created_at
    from public.comments c
    where c.post_id=p_post_id and c.parent_id is null
      -- deleted_at is null이 먼저라 살아있는 댓글에는 재귀 검사가 돌지 않는다(OR 단축 평가).
      and (c.deleted_at is null or private.has_active_descendant(c.id))
      and (p_after_id is null or (c.created_at, c.id) > (after_created_at, p_after_id))
    order by c.created_at, c.id
    limit p_limit
  ),
  thread as (
    select c.id, 0 as depth
    from public.comments c
    join roots r on r.id=c.id
    union all
    select child.id, t.depth+1
    from public.comments child
    join thread t on child.parent_id=t.id
    where t.depth < 50
  )
  select
    c.id,
    c.parent_id,
    c.content,
    c.is_anonymous,
    c.author_attribution,
    -- tombstone은 본문도 작성자도 내리지 않는다. 남는 건 "여기 삭제된 댓글이 있었다"는 사실뿐이다.
    case when c.deleted_at is not null then null
         else private.post_author(c.author_id, c.is_anonymous or c.author_attribution='staff') end,
    -- 익명 댓글의 표시 이름. 익명 글의 글쓴이가 자기 글에 단 댓글이면 "글쓴이"다 -- 신원은 여전히
    -- 안 드러나면서(어차피 익명 글이니까) 같은 사람임은 보인다. 글이 실명이면 "글쓴이"를 붙이면
    -- 안 된다: 글쓴이가 누군지 다 아는데 그 라벨을 달면 익명 댓글이 곧바로 까진다.
    case
      when c.deleted_at is not null or not c.is_anonymous or c.author_attribution='staff' then null
      when post_is_anonymous and c.author_id=post_author_id then '글쓴이'
      else '익명' || (select ai.idx from anon_index ai where ai.author_id=c.author_id)
    end,
    private.can_manage_space((select p.space_id from public.posts p where p.id=c.post_id)) and exists(
      select 1 from public.space_anonymity_suspensions x
      join public.posts p on p.space_id=x.space_id
      where p.id=c.post_id and x.user_id=c.author_id and x.suspended_until>now()
    ),
    c.author_id=caller_id and c.deleted_at is null,
    c.deleted_at is not null,
    c.created_at,
    c.updated_at,
    (select count(*) from public.comment_reactions r where r.comment_id=c.id),
    rs.top_reactions,
    rs.my_reaction_id
  from thread th
  join public.comments c on c.id=th.id
  left join lateral (select * from private.comment_reaction_summary(c.id, caller_id)) rs on true
  where c.deleted_at is null or private.has_active_descendant(c.id)
  order by c.created_at, c.id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.list_feed_posts(p_before_id bigint DEFAULT NULL::bigint, p_limit integer DEFAULT 20)
 RETURNS TABLE(post_id bigint, pub_id uuid, title text, content text, is_anonymous boolean, author_attribution public.author_attribution, is_author_anonymity_suspended boolean, author jsonb, is_mine boolean, category jsonb, space jsonb, pinned_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone, comment_count bigint, reaction_count bigint, top_reactions jsonb, my_reaction_id bigint, attachments jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id bigint := private.require_current_profile(true);
  before_created_at timestamptz;
begin
  -- null을 빼먹으면 `limit null`이 되어 상한이 통째로 사라진다(null < 1은 참이 아니라 null이라
  -- 이 가드를 그냥 지나간다). 그러면 클라이언트가 p_limit=null 한 번으로 접근 가능한 글/댓글을
  -- 전부 빨아낼 수 있다 -- 05-chat의 읽기 RPC들이 처음부터 `p_limit is null`을 함께 본 이유다.
  if p_limit is null or p_limit < 1 or p_limit > 50 then raise exception 'limit must be 1 to 50'; end if;

  -- 커서는 id 하나지만 전체 피드는 (created_at, id) 내림차순이다. 시간도 함께 찾아 행 비교를
  -- 쓰면 각 space의 idx_posts_active_space_created_at을 그대로 이용할 수 있다.
  --
  -- 못 찾으면 끊는다 -- 이유는 list_space_posts 쪽 주석에 있다(null을 흘리면 행 비교가 null이 되어
  -- 예외 없이 빈 페이지가 나간다). 여기는 여러 space를 가로지르는 흐름이라 소속으로 좁힐 컬럼이
  -- 없고, 접근 경계는 아래 space_members 조인이 이미 잡는다.
  if p_before_id is not null then
    select p.created_at into before_created_at from public.posts p where p.id=p_before_id;
    if not found then raise exception 'cursor post not found'; end if;
  end if;

  return query
  select
    p.id,
    p.pub_id,
    p.title,
    p.content,
    p.is_anonymous,
    p.author_attribution,
    -- list_space_posts와 같은 관리자 전용 게이트(private.can_manage_space) -- 주석은 그쪽에 있다.
    private.can_manage_space(p.space_id) and exists(
      select 1 from public.space_anonymity_suspensions x
      where x.space_id=p.space_id and x.user_id=p.author_id and x.suspended_until > now()
    ),
    private.post_author(p.author_id, p.is_anonymous or p.author_attribution='staff'),
    p.author_id=caller_id,
    case when cat.id is null then null else
      jsonb_build_object('id',cat.id,'name',cat.name,'sort_order',cat.sort_order) end,
    jsonb_build_object('name',s.name,'type',s.type,'pub_id',s.pub_id),
    p.pinned_at,
    p.created_at,
    p.updated_at,
    coalesce(counts.comment_count,0),
    coalesce(counts.reaction_count,0),
    coalesce(summary.top_reactions,'[]'::jsonb),
    summary.my_reaction_id,
    coalesce(files.items,'[]'::jsonb)
  from public.posts p
  join public.spaces s on s.id=p.space_id and s.deleted_at is null
  join public.space_members sm
    on sm.space_id=p.space_id and sm.user_id=caller_id and sm.banned_at is null
  left join public.space_categories cat on cat.id=p.category_id
  left join lateral (
    select
      (select count(*) from public.comments c where c.post_id=p.id and c.deleted_at is null) as comment_count,
      (select count(*) from public.post_reactions r where r.post_id=p.id) as reaction_count
  ) counts on true
  left join lateral (select * from private.post_reaction_summary(p.id, caller_id)) summary on true
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'id',a.id,'storage_bucket',a.storage_bucket,'storage_path',a.storage_path,'file_name',a.file_name,
      'content_type',a.content_type,'kind',mime.kind,'size_bytes',a.size_bytes,'sort_order',a.sort_order,
      'width',a.width,'height',a.height
    ) order by a.sort_order, a.id) as items
    from public.post_attachments a
    join public.mime_types mime on mime.content_type=a.content_type
    where a.post_id=p.id
  ) files on true
  where p.deleted_at is null
    and (p_before_id is null or (p.created_at, p.id) < (before_created_at, p_before_id))
  order by p.created_at desc, p.id desc
  limit p_limit;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.list_space_posts(p_space_id bigint, p_category_id bigint DEFAULT NULL::bigint, p_before_id bigint DEFAULT NULL::bigint, p_limit integer DEFAULT 20)
 RETURNS TABLE(post_id bigint, pub_id uuid, title text, content text, is_anonymous boolean, author_attribution public.author_attribution, is_author_anonymity_suspended boolean, author jsonb, is_mine boolean, category jsonb, pinned_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone, comment_count bigint, reaction_count bigint, top_reactions jsonb, my_reaction_id bigint, attachments jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id bigint := private.require_current_profile(true);
  before_created_at timestamptz;
begin
  if not private.can_participate_space(p_space_id) then raise exception 'space membership required'; end if;
  -- null을 빼먹으면 `limit null`이 되어 상한이 통째로 사라진다(null < 1은 참이 아니라 null이라
  -- 이 가드를 그냥 지나간다). 그러면 클라이언트가 p_limit=null 한 번으로 접근 가능한 글/댓글을
  -- 전부 빨아낼 수 있다 -- 05-chat의 읽기 RPC들이 처음부터 `p_limit is null`을 함께 본 이유다.
  if p_limit is null or p_limit < 1 or p_limit > 50 then raise exception 'limit must be 1 to 50'; end if;

  -- 커서는 id 하나지만 정렬은 (created_at, id)다. 그 글의 created_at을 찾아 행 비교로 쓰면
  -- idx_posts_active_space_created_at을 그대로 탄다.
  --
  -- **못 찾으면 여기서 끊어야 한다.** null을 그대로 흘리면 아래 행 비교가
  -- `(created_at, id) < (null, id)`가 되는데, 행 비교는 첫 원소가 null이면 false가 아니라 **null**
  -- 이라 모든 행이 걸러진다 -- 예외 없이 빈 페이지가 나가고 클라이언트는 그걸 "끝에 도달"과
  -- 구분할 수 없다. 바로 위 p_limit 가드와 정확히 같은 3값 논리 함정이다.
  --
  -- space 소속까지 보는 이유: 다른 space의 글을 커서로 주면 남의 타임스탬프를 기준으로 이 space를
  -- 페이징하게 된다. 반대로 deleted_at은 **일부러 안 본다** -- 커서 글이 페이지 사이에 소프트
  -- 삭제돼도 그 지점부터 계속 넘길 수 있어야 한다.
  if p_before_id is not null then
    select p.created_at into before_created_at
    from public.posts p where p.id=p_before_id and p.space_id=p_space_id;
    if not found then raise exception 'cursor post not found in this space'; end if;
  end if;

  return query
  with page as (
    -- 고정 글은 첫 페이지에만 얹고, 시간순 스트림에서는 빼서 두 번 나오지 않게 한다(FB와 동일).
    select p.*, 0 as sort_group
    from public.posts p
    where p_before_id is null
      and p.space_id=p_space_id and p.deleted_at is null and p.pinned_at is not null
      and (p_category_id is null or p.category_id=p_category_id)
    union all
    (
      select p.*, 1 as sort_group
      from public.posts p
      where p.space_id=p_space_id and p.deleted_at is null and p.pinned_at is null
        and (p_category_id is null or p.category_id=p_category_id)
        and (p_before_id is null or (p.created_at, p.id) < (before_created_at, p_before_id))
      order by p.created_at desc, p.id desc
      limit p_limit
    )
  )
  select
    page.id,
    page.pub_id,
    page.title,
    page.content,
    page.is_anonymous,
    page.author_attribution,
    -- 관리자에게만 뜨는 "익명 제한 취소" 메뉴 항목의 표시 여부. can_manage_space로 관리자가 아닌
    -- 호출자에게는 항상 false다 -- 그렇지 않으면 멤버 전원이 익명 글 목록을 훑어 "지금 정지 중인
    -- 사람이 쓴 글"을 공짜로 골라낼 수 있다. 이 함수가 이미 감수하기로 한 상습범 연결 유출(위
    -- suspend_anonymity 주석)조차 그 행동에 비용이 들게 설계돼 있는데, 목록에 상시로 뿌리면 그
    -- 비용이 사라져 정확히 그 문서가 경고하는 "공짜 작성자 지도"가 된다.
    private.can_manage_space(page.space_id) and exists(
      select 1 from public.space_anonymity_suspensions x
      where x.space_id=page.space_id and x.user_id=page.author_id and x.suspended_until > now()
    ),
    private.post_author(page.author_id, page.is_anonymous or page.author_attribution='staff'),
    page.author_id=caller_id,
    case when cat.id is null then null else
      jsonb_build_object('id',cat.id,'name',cat.name,'sort_order',cat.sort_order) end,
    page.pinned_at,
    page.created_at,
    page.updated_at,
    coalesce(counts.comment_count,0),
    coalesce(counts.reaction_count,0),
    coalesce(summary.top_reactions,'[]'::jsonb),
    summary.my_reaction_id,
    coalesce(files.items,'[]'::jsonb)
  from page
  left join public.space_categories cat on cat.id=page.category_id
  left join lateral (
    select
      (select count(*) from public.comments c where c.post_id=page.id and c.deleted_at is null) as comment_count,
      (select count(*) from public.post_reactions r where r.post_id=page.id) as reaction_count
  ) counts on true
  left join lateral (select * from private.post_reaction_summary(page.id, caller_id)) summary on true
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'id',a.id,'storage_bucket',a.storage_bucket,'storage_path',a.storage_path,'file_name',a.file_name,
      'content_type',a.content_type,'kind',mime.kind,'size_bytes',a.size_bytes,'sort_order',a.sort_order,
      'width',a.width,'height',a.height
    ) order by a.sort_order, a.id) as items
    from public.post_attachments a
    join public.mime_types mime on mime.content_type=a.content_type
    where a.post_id=page.id
  ) files on true
  order by page.sort_group, page.pinned_at desc nulls last, page.created_at desc, page.id desc;
end;
$function$
;


