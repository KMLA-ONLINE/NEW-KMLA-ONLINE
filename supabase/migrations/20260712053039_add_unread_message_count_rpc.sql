set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_unread_message_count()
 RETURNS bigint
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id bigint := private.require_current_profile(true);
  result bigint;
begin
  with my_cursors as (
    select mc.conversation_id, rs.last_read_message_id
    from (
      select dc.conversation_id
      from public.direct_conversations dc
      where caller_id in (dc.user1_id, dc.user2_id)
      union all
      select cm.conversation_id
      from public.conversation_members cm
      where cm.user_id=caller_id
    ) mc
    -- 커서 행이 아예 없으면(한 번도 열지 않은 대화) last_read_message_id가 null -- 전부 안 읽음이다.
    left join public.chat_read_states rs on rs.conversation_id=mc.conversation_id and rs.user_id=caller_id
  )
  select coalesce(sum(capped.unread_count),0)::bigint into result
  from my_cursors c
  cross join lateral (
    select count(*)::bigint as unread_count
    from (
      select 1
      from public.messages m
      where m.conversation_id=c.conversation_id and m.deleted_at is null and m.sender_id<>caller_id
        and (c.last_read_message_id is null or m.id>c.last_read_message_id)
      limit 100
    ) rows_capped
  ) capped;

  return result;
end;
$function$
;

-- db diff가 grant/revoke를 안 잡아서 손으로 붙인다. 이게 없으면 새 함수의 EXECUTE가 Postgres
-- 기본값대로 PUBLIC에 열려 anon도 호출할 수 있다.
revoke execute on function public.get_unread_message_count() from public, anon, authenticated, service_role;
grant execute on function public.get_unread_message_count() to authenticated;
