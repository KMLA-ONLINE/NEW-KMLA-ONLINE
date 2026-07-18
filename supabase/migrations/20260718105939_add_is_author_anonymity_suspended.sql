drop function if exists "public"."get_post"(p_pub_id uuid);

drop function if exists "public"."list_feed_posts"(p_before_id bigint, p_limit integer);

drop function if exists "public"."list_space_posts"(p_space_id bigint, p_category_id bigint, p_before_id bigint, p_limit integer);

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_post(p_pub_id uuid)
 RETURNS TABLE(post_id bigint, pub_id uuid, space_id bigint, title text, content text, is_anonymous boolean, is_author_anonymity_suspended boolean, author jsonb, is_mine boolean, category jsonb, pinned_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone, comment_count bigint, reaction_count bigint, top_reactions jsonb, my_reaction_id bigint, attachments jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id bigint := private.require_current_profile(true);
  target_id bigint;
begin
  select p.id into target_id from public.posts p where p.pub_id=p_pub_id and p.deleted_at is null;
  if not found then return; end if;
  if not private.can_access_post(target_id) then raise exception 'post access required'; end if;

  return query
  select
    p.id, p.pub_id, p.space_id, p.title, p.content, p.is_anonymous,
    -- list_space_posts와 같은 관리자 전용 게이트(private.can_manage_space) -- 주석은 그쪽에 있다.
    private.can_manage_space(p.space_id) and exists(
      select 1 from public.space_anonymity_suspensions x
      where x.space_id=p.space_id and x.user_id=p.author_id and x.suspended_until > now()
    ),
    private.post_author(p.author_id, p.is_anonymous),
    p.author_id=caller_id,
    case when cat.id is null then null else
      jsonb_build_object('id',cat.id,'name',cat.name,'sort_order',cat.sort_order) end,
    p.pinned_at, p.created_at, p.updated_at,
    (select count(*) from public.comments c where c.post_id=p.id and c.deleted_at is null),
    (select count(*) from public.post_reactions r where r.post_id=p.id),
    rs.top_reactions,
    rs.my_reaction_id,
    coalesce((select jsonb_agg(jsonb_build_object(
      'id',a.id,'storage_bucket',a.storage_bucket,'storage_path',a.storage_path,'file_name',a.file_name,
      'content_type',a.content_type,'kind',mime.kind,'size_bytes',a.size_bytes,'sort_order',a.sort_order,
      'width',a.width,'height',a.height
    ) order by a.sort_order, a.id)
    from public.post_attachments a join public.mime_types mime on mime.content_type=a.content_type
    where a.post_id=p.id),'[]'::jsonb)
  from public.posts p
  left join public.space_categories cat on cat.id=p.category_id
  left join lateral (select * from private.post_reaction_summary(p.id, caller_id)) rs on true
  where p.id=target_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.list_feed_posts(p_before_id bigint DEFAULT NULL::bigint, p_limit integer DEFAULT 20)
 RETURNS TABLE(post_id bigint, pub_id uuid, title text, content text, is_anonymous boolean, is_author_anonymity_suspended boolean, author jsonb, is_mine boolean, category jsonb, space jsonb, pinned_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone, comment_count bigint, reaction_count bigint, top_reactions jsonb, my_reaction_id bigint, attachments jsonb)
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
  if p_before_id is not null then
    select p.created_at into before_created_at from public.posts p where p.id=p_before_id;
  end if;

  return query
  select
    p.id,
    p.pub_id,
    p.title,
    p.content,
    p.is_anonymous,
    -- list_space_posts와 같은 관리자 전용 게이트(private.can_manage_space) -- 주석은 그쪽에 있다.
    private.can_manage_space(p.space_id) and exists(
      select 1 from public.space_anonymity_suspensions x
      where x.space_id=p.space_id and x.user_id=p.author_id and x.suspended_until > now()
    ),
    private.post_author(p.author_id, p.is_anonymous),
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
 RETURNS TABLE(post_id bigint, pub_id uuid, title text, content text, is_anonymous boolean, is_author_anonymity_suspended boolean, author jsonb, is_mine boolean, category jsonb, pinned_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone, comment_count bigint, reaction_count bigint, top_reactions jsonb, my_reaction_id bigint, attachments jsonb)
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
  if p_before_id is not null then
    select p.created_at into before_created_at from public.posts p where p.id=p_before_id;
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
    -- 관리자에게만 뜨는 "익명 제한 취소" 메뉴 항목의 표시 여부. can_manage_space로 관리자가 아닌
    -- 호출자에게는 항상 false다 -- 그렇지 않으면 멤버 전원이 익명 글 목록을 훑어 "지금 정지 중인
    -- 사람이 쓴 글"을 공짜로 골라낼 수 있다. 이 함수가 이미 감수하기로 한 상습범 연결 유출(위
    -- suspend_anonymity 주석)조차 그 행동에 비용이 들게 설계돼 있는데, 목록에 상시로 뿌리면 그
    -- 비용이 사라져 정확히 그 문서가 경고하는 "공짜 작성자 지도"가 된다.
    private.can_manage_space(page.space_id) and exists(
      select 1 from public.space_anonymity_suspensions x
      where x.space_id=page.space_id and x.user_id=page.author_id and x.suspended_until > now()
    ),
    private.post_author(page.author_id, page.is_anonymous),
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




-- 반환 컬럼이 늘어 drop+create됐다. drop이 grant를 함께 날리므로 다시 주지 않으면 아무도 못
-- 부른다(docs/db/README.md의 DB 변경 워크플로 참고).
revoke execute on function public.get_post(uuid), public.list_feed_posts(bigint,int4), public.list_space_posts(bigint,bigint,bigint,int4) from public, anon, authenticated, service_role;
grant execute on function public.get_post(uuid), public.list_feed_posts(bigint,int4), public.list_space_posts(bigint,bigint,bigint,int4) to authenticated;
