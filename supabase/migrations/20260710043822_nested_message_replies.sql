set check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.is_valid_message_parent(p_parent_id bigint, p_conversation_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p_parent_id is null or exists(
    select 1 from public.messages m
    where m.id=p_parent_id
      and m.deleted_at is null
      and m.conversation_id=p_conversation_id
  )
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_conversation(p_conversation_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.require_service_role();
  if exists(select 1 from public.message_attachments a join public.messages m on m.id=a.message_id where m.conversation_id=p_conversation_id) then
    raise exception 'message attachments must be removed before purging conversation';
  end if;
  delete from public.message_reactions mr using public.messages m where mr.message_id=m.id and m.conversation_id=p_conversation_id;
  delete from public.chat_read_states where conversation_id=p_conversation_id;

  -- Replies nest to any depth and messages.parent_id restricts deletes, so peel
  -- the leaves off until none are left. Deleting replies then roots would only
  -- ever work for a single level.
  loop
    delete from public.messages m
    where m.conversation_id=p_conversation_id
      and not exists(select 1 from public.messages child where child.parent_id=m.id);
    exit when not found;
  end loop;
  delete from public.direct_conversations where conversation_id=p_conversation_id;
  delete from public.conversation_members where conversation_id=p_conversation_id;
  delete from public.conversations where id=p_conversation_id;
end $function$
;


