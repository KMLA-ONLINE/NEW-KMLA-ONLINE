drop function if exists "public"."get_post_comments"(p_post_id bigint);

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_post_comments(p_post_id bigint, p_after_id bigint DEFAULT NULL::bigint, p_limit integer DEFAULT 20)
 RETURNS TABLE(comment_id bigint, parent_id bigint, content text, is_anonymous boolean, author jsonb, is_mine boolean, is_deleted boolean, created_at timestamp with time zone, reaction_count bigint, top_reactions jsonb, my_reaction_id bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id bigint := private.require_current_profile(true);
  after_created_at timestamptz;
begin
  if not private.can_access_post(p_post_id) then raise exception 'post access required'; end if;
  if p_limit < 1 or p_limit > 50 then raise exception 'limit must be 1 to 50'; end if;

  if p_after_id is not null then
    select c.created_at into after_created_at from public.comments c where c.id=p_after_id;
  end if;

  return query
  with recursive roots as (
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
    -- tombstone은 본문도 작성자도 내리지 않는다. 남는 건 "여기 삭제된 댓글이 있었다"는 사실뿐이다.
    case when c.deleted_at is not null then null
         else private.post_author(c.author_id, c.is_anonymous) end,
    c.author_id=caller_id and c.deleted_at is null,
    c.deleted_at is not null,
    c.created_at,
    (select count(*) from public.comment_reactions r where r.comment_id=c.id),
    coalesce((select jsonb_agg(t.icon order by t.n desc, t.icon)
      from (
        select rt.icon, count(*) as n
        from public.comment_reactions r join public.reaction_types rt on rt.id=r.reaction_type_id
        where r.comment_id=c.id and rt.icon is not null
        group by rt.icon order by count(*) desc limit 3
      ) t),'[]'::jsonb),
    (select r.reaction_type_id from public.comment_reactions r where r.comment_id=c.id and r.user_id=caller_id)
  from thread th
  join public.comments c on c.id=th.id
  where c.deleted_at is null or private.has_active_descendant(c.id)
  order by c.created_at, c.id;
end;
$function$
;



-- db diff가 놓치는 둘을 손으로 붙인다.
-- 1) is_anonymous를 update 컬럼 grant에서 뺀다. 컬럼 단위 grant 변경은 diff에 아예 안 나타난다.
--    이게 없으면 익명으로 쓴 글을 나중에 실명으로 까거나 그 반대가 가능하다.
revoke update (is_anonymous) on public.posts from authenticated;

-- 2) get_post_comments는 시그니처가 바뀌어 drop + create됐다. drop이 grant를 함께 날리고 default
--    privilege가 execute를 회수해 둔 상태라, 다시 주지 않으면 아무도 호출할 수 없게 조용히 죽는다.
revoke execute on function public.get_post_comments(bigint,bigint,int4) from public, anon, authenticated, service_role;
grant execute on function public.get_post_comments(bigint,bigint,int4) to authenticated;
