set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_encrypted_message_bodies(p_conversation_id bigint, p_before_id bigint DEFAULT NULL::bigint, p_limit integer DEFAULT 500)
 RETURNS TABLE(message_id bigint, sender_id bigint, created_at timestamp with time zone, content_ciphertext text, message_key jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller_id bigint := private.require_current_profile(true);
begin
  if p_conversation_id is null then raise exception 'conversation target required'; end if;
  if p_limit is null or p_limit not between 1 and 1000 then raise exception 'limit must be between 1 and 1000'; end if;
  if not private.is_conversation_member(p_conversation_id) then raise exception 'conversation membership required'; end if;
  if not private.is_direct_conversation(p_conversation_id) then
    raise exception 'conversation is not end-to-end encrypted: use search_messages';
  end if;

  return query
  select
    m.id,
    m.sender_id,
    m.created_at,
    encode(m.content_ciphertext,'base64'),
    envelope.value
  from public.messages m
  left join lateral (
    select jsonb_build_object('wrapped_key',encode(mk.wrapped_key,'base64'),'sender_public_key',encode(mk.sender_public_key,'base64'),'recipient_public_key',encode(mk.recipient_public_key,'base64')) as value
    from public.message_keys mk
    where mk.message_id=m.id and (mk.user_id=caller_id or m.sender_id=caller_id)
    order by (mk.user_id=caller_id) desc, mk.user_id
    limit 1
  ) envelope on true
  where m.conversation_id=p_conversation_id
    and m.deleted_at is null
    and m.content_ciphertext is not null
    and (p_before_id is null or m.id<p_before_id)
  order by m.id desc
  limit p_limit;
end $function$
;



-- db diff는 함수 grant를 단 하나도 내지 않는다. 그리고 ACL이 비어 있는 함수는 암묵적으로
-- EXECUTE TO PUBLIC이라, 명시적으로 회수하지 않으면 이 RPC는 anon에게도 열린 채 태어난다 --
-- 즉 이 두 줄이 없으면 대화 전체의 암호문이 로그인도 없이 나간다.
-- (tests/00-privileges.sql이 그걸 잡는다.)
revoke execute on function public.get_encrypted_message_bodies(bigint,bigint,int4) from public, anon, service_role;
grant execute on function public.get_encrypted_message_bodies(bigint,bigint,int4) to authenticated;
