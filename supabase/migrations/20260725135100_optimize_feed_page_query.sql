set check_function_bodies = off;

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
  with member_spaces as materialized (
    select s.id, s.name, s.type, s.pub_id
    from public.space_members sm
    join public.spaces s on s.id=sm.space_id and s.deleted_at is null
    where sm.user_id=caller_id and sm.banned_at is null
  ),
  page as materialized (
    -- space마다 p_limit개면 전체 상위 p_limit개를 빠뜨릴 수 없다. 이 안쪽 limit은
    -- idx_posts_active_space_created_at을 타서 각 space의 오래된 글을 전부 읽지 않게 하고,
    -- 바깥 limit은 그 후보들을 홈 피드의 단일 시간순으로 합친다.
    select candidate.*, ms.name as space_name, ms.type as space_type, ms.pub_id as space_pub_id
    from member_spaces ms
    cross join lateral (
      select p.id, p.pub_id, p.space_id, p.author_id, p.title, p.content, p.is_anonymous,
             p.author_attribution, p.category_id, p.pinned_at, p.created_at, p.updated_at
      from public.posts p
      where p.space_id=ms.id and p.deleted_at is null
        and (p_before_id is null or (p.created_at, p.id) < (before_created_at, p_before_id))
      order by p.created_at desc, p.id desc
      limit p_limit
    ) candidate
    order by candidate.created_at desc, candidate.id desc
    limit p_limit
  )
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
    jsonb_build_object('name',p.space_name,'type',p.space_type,'pub_id',p.space_pub_id),
    p.pinned_at,
    p.created_at,
    p.updated_at,
    coalesce(counts.comment_count,0),
    coalesce(counts.reaction_count,0),
    coalesce(summary.top_reactions,'[]'::jsonb),
    summary.my_reaction_id,
    coalesce(files.items,'[]'::jsonb)
  from page p
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
  order by p.created_at desc, p.id desc;
end;
$function$
;

