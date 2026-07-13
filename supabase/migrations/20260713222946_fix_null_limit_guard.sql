set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.list_notifications(p_before_id bigint DEFAULT NULL::bigint, p_limit integer DEFAULT 20)
 RETURNS TABLE(id bigint, type public.notification_type, actor jsonb, actor_is_anonymous boolean, space jsonb, post jsonb, comment jsonb, payload jsonb, read_at timestamp with time zone, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id bigint := private.require_current_profile(true);
begin
  -- null을 빼먹으면 `limit null`이 되어 상한이 통째로 사라진다(null not between …은 참이 아니라
  -- null이라 이 가드를 그냥 지나간다). 그러면 클라이언트가 p_limit=null 한 번으로 내 알림을 전부
  -- 가져간다. 03-content와 05-chat의 읽기 RPC가 같은 이유로 `p_limit is null`을 함께 본다.
  if p_limit is null or p_limit not between 1 and 50 then raise exception 'limit must be between 1 and 50'; end if;

  return query
  select
    n.id,
    n.type,
    case when n.actor_is_anonymous or a.id is null then null
         else jsonb_build_object('id',a.id,'name',a.name,'avatar_url',a.avatar_url) end,
    n.actor_is_anonymous,
    case when s.id is null then null
         else jsonb_build_object('pub_id',s.pub_id,'name',s.name,'type',s.type) end,
    case when p.id is null then null
         else jsonb_build_object('pub_id',p.pub_id,'title',p.title) end,
    -- 삭제된 댓글은 soft_delete_comment가 content를 이미 비웠다. 알림이 원문을 되살리지 않는다.
    case when c.id is null then null
         else jsonb_build_object('id',c.id,'content',c.content,'is_deleted',c.deleted_at is not null) end,
    n.payload,
    n.read_at,
    n.created_at
  from public.notifications n
  left join public.profiles a on a.id=n.actor_id
  left join public.spaces s on s.id=n.space_id
  left join public.posts p on p.id=n.post_id
  left join public.comments c on c.id=n.comment_id
  where n.recipient_id=caller_id
    and (p_before_id is null or n.id < p_before_id)
  order by n.id desc
  limit p_limit;
end;
$function$
;


