set check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.message_envelope(p_message_id bigint, p_sender_id bigint, p_caller_id bigint)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'wrapped_key', encode(mk.wrapped_key,'base64'),
    'sender_public_key', encode(mk.sender_public_key,'base64'),
    'recipient_public_key', encode(mk.recipient_public_key,'base64')
  )
  from public.message_keys mk
  where mk.message_id=p_message_id
    and (mk.user_id=p_caller_id or p_sender_id=p_caller_id)
  order by (mk.user_id=p_caller_id) desc, mk.user_id
  limit 1
$function$
;

CREATE OR REPLACE FUNCTION private.stamp_message_pinned_by()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.pinned_at is not distinct from old.pinned_at then
    new.pinned_by := old.pinned_by;
  elsif new.pinned_at is null then
    new.pinned_by := null;
  else
    new.pinned_by := private.current_profile_id();
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_chat_messages(p_conversation_id bigint, p_before_id bigint DEFAULT NULL::bigint, p_limit integer DEFAULT 50)
 RETURNS TABLE(message_id bigint, conversation_id bigint, sender_id bigint, sender jsonb, parent_message jsonb, content text, content_ciphertext text, message_key jsonb, is_edited boolean, edited_at timestamp with time zone, deleted_at timestamp with time zone, pinned_at timestamp with time zone, pinned_by jsonb, created_at timestamp with time zone, attachments jsonb, reactions jsonb, reads jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller_id bigint := private.require_current_profile(true);
begin
  if p_conversation_id is null then raise exception 'conversation target required'; end if;
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'limit must be between 1 and 100'; end if;
  if not private.is_conversation_member(p_conversation_id) then raise exception 'conversation membership required'; end if;

  return query
  with page as (
    select m.*
    from public.messages m
    where m.conversation_id=p_conversation_id
      and (m.deleted_at is null or exists(select 1 from public.messages child where child.parent_id=m.id and child.deleted_at is null))
      and (p_before_id is null or m.id<p_before_id)
    order by m.id desc
    limit p_limit
  )
  select
    page.id as message_id,
    page.conversation_id,
    page.sender_id,
    jsonb_build_object('id',sender.id,'name',sender.name,'avatar_url',sender.avatar_url) as sender,
    case when parent.id is null then null else jsonb_build_object('id',parent.id,'sender_id',parent.sender_id,'sender_name',parent_sender.name,'content',parent.content,'content_ciphertext',encode(parent.content_ciphertext,'base64'),'message_key',private.message_envelope(parent.id,parent.sender_id,caller_id),'created_at',parent.created_at) end as parent_message,
    page.content,
    encode(page.content_ciphertext,'base64') as content_ciphertext,
    private.message_envelope(page.id,page.sender_id,caller_id) as message_key,
    (page.edited_at is not null) as is_edited,
    page.edited_at,
    page.deleted_at,
    page.pinned_at,
    case when pinner.id is null then null else jsonb_build_object('id',pinner.id,'name',pinner.name) end as pinned_by,
    page.created_at,
    coalesce(attachments.items,'[]'::jsonb) as attachments,
    coalesce(reactions.items,'[]'::jsonb) as reactions,
    coalesce(reads.items,'[]'::jsonb) as reads
  from page
  join public.profiles sender on sender.id=page.sender_id
  left join public.messages parent on parent.id=page.parent_id
  left join public.profiles parent_sender on parent_sender.id=parent.sender_id
  left join public.profiles pinner on pinner.id=page.pinned_by
  left join lateral (
    select jsonb_agg(jsonb_build_object('id',a.id,'storage_bucket',a.storage_bucket,'storage_path',a.storage_path,'file_name',a.file_name,'file_name_ciphertext',encode(a.file_name_ciphertext,'base64'),'content_type',a.content_type,'kind',mime.kind,'size_bytes',a.size_bytes,'sort_order',a.sort_order,'width',a.width,'height',a.height,'duration_ms',a.duration_ms,'created_at',a.created_at) order by a.sort_order,a.id) as items
    from public.message_attachments a
    join public.mime_types mime on mime.content_type=a.content_type
    where a.message_id=page.id
  ) attachments on true
  left join lateral (
    select jsonb_agg(jsonb_build_object('user_id',mr.user_id,'user_name',rp.name,'reaction_type_id',rt.id,'reaction_key',rt.key,'reaction_name',rt.name,'reaction_icon',rt.icon,'created_at',mr.created_at,'updated_at',mr.updated_at) order by mr.created_at,mr.user_id) as items
    from public.message_reactions mr join public.reaction_types rt on rt.id=mr.reaction_type_id join public.profiles rp on rp.id=mr.user_id
    where mr.message_id=page.id
  ) reactions on true
  left join lateral (
    select jsonb_agg(jsonb_build_object('user_id',rs.user_id,'user_name',reader.name,'read_at',rs.last_read_at) order by rs.last_read_at,rs.user_id) as items
    from public.chat_read_states rs join public.profiles reader on reader.id=rs.user_id
    where rs.conversation_id=page.conversation_id
      and rs.last_read_message_id is not null
      and rs.last_read_message_id>=page.id
  ) reads on true
  order by page.id asc;
end;
$function$
;

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
    private.message_envelope(m.id,m.sender_id,caller_id)
  from public.messages m
  where m.conversation_id=p_conversation_id
    and m.deleted_at is null
    and m.content_ciphertext is not null
    and (p_before_id is null or m.id<p_before_id)
  order by m.id desc
  limit p_limit;
end $function$
;

CREATE OR REPLACE FUNCTION public.list_conversations()
 RETURNS TABLE(conversation_id bigint, type public.conversation_type, name text, display_name text, display_initials text, avatar_url text, last_message_id bigint, last_message_content text, last_message_content_ciphertext text, last_message_key jsonb, last_message_has_attachment boolean, last_message_sender_id bigint, last_message_sender_name text, last_message_created_at timestamp with time zone, unread_count bigint, member_count bigint, muted_until timestamp with time zone, notification_level public.notification_level, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller_id bigint := private.require_current_profile(true);
begin
  return query
  with my_conversations as (
    select dc.conversation_id, case when dc.user1_id=caller_id then dc.user2_id else dc.user1_id end as peer_id
    from public.direct_conversations dc
    where caller_id in (dc.user1_id, dc.user2_id)
    union all
    select cm.conversation_id, null::bigint as peer_id
    from public.conversation_members cm
    where cm.user_id=caller_id
  )
  select
    c.id as conversation_id,
    c.type,
    c.name,
    case when c.type='direct' then peer.name else c.name end as display_name,
    upper(left(regexp_replace(coalesce(case when c.type='direct' then peer.name else c.name end,'?'),'\s+','','g'),2)) as display_initials,
    case when c.type='direct' then peer.avatar_url else null end as avatar_url,
    last_message.id as last_message_id,
    last_message.content as last_message_content,
    encode(last_message.content_ciphertext,'base64') as last_message_content_ciphertext,
    last_message.envelope as last_message_key,
    coalesce(last_message.has_attachment,false) as last_message_has_attachment,
    last_message.sender_id as last_message_sender_id,
    last_sender.name as last_message_sender_name,
    last_message.created_at as last_message_created_at,
    coalesce(unread.unread_count,0) as unread_count,
    case when c.type='direct' then 2::bigint else coalesce(member_counts.member_count,0) end as member_count,
    -- Raw, not `muted_until > now()`: this function is stable, and the caller has
    -- to re-evaluate the deadline as it passes anyway.
    settings.muted_until,
    coalesce(settings.level,'all') as notification_level,
    c.created_at
  from my_conversations mc
  join public.conversations c on c.id=mc.conversation_id
  left join public.profiles peer on peer.id=mc.peer_id
  left join lateral (
    select m.id,m.sender_id,m.content,m.content_ciphertext,m.created_at,
      exists(select 1 from public.message_attachments a where a.message_id=m.id) as has_attachment,
      private.message_envelope(m.id,m.sender_id,caller_id) as envelope
    from public.messages m
    where m.conversation_id=c.id and m.deleted_at is null
    order by m.id desc
    limit 1
  ) last_message on true
  left join public.profiles last_sender on last_sender.id=last_message.sender_id
  left join public.chat_read_states read_state on read_state.conversation_id=c.id and read_state.user_id=caller_id
  left join public.chat_notification_settings settings on settings.conversation_id=c.id and settings.user_id=caller_id
  left join lateral (
    select count(*)::bigint as unread_count
    from public.messages m
    where m.conversation_id=c.id and m.deleted_at is null and m.sender_id<>caller_id
      and (read_state.last_read_message_id is null or m.id>read_state.last_read_message_id)
  ) unread on true
  left join lateral (
    select count(*)::bigint as member_count from public.conversation_members cm2 where cm2.conversation_id=c.id
  ) member_counts on true
  order by last_message.id desc nulls last, c.created_at desc, c.id desc;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.request_attachment_removal(p_owner_type text, p_attachment_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller_id bigint:=private.require_current_profile(true); bucket text; path text; target_message_id bigint;
begin
  if p_owner_type='post' then
    select a.storage_bucket,a.storage_path into bucket,path from public.post_attachments a join public.posts p on p.id=a.post_id where a.id=p_attachment_id and p.author_id=caller_id and p.deleted_at is null;
  elsif p_owner_type='message' then
    select a.storage_bucket,a.storage_path,a.message_id into bucket,path,target_message_id from public.message_attachments a join public.messages m on m.id=a.message_id where a.id=p_attachment_id and m.sender_id=caller_id and m.deleted_at is null and private.can_access_message(m.id);
  else raise exception 'attachment owner type must be post or message'; end if;
  if path is null then raise exception 'attachment not found or not owned'; end if;

  insert into private.attachment_cleanup_queue(storage_bucket,storage_path,requested_by) values(bucket,path,caller_id)
  on conflict(storage_bucket,storage_path) do update
  set available_at=least(private.attachment_cleanup_queue.available_at,excluded.available_at),
      processed_at=null,
      last_error=null;

  if p_owner_type='post' then
    delete from public.post_attachments where id=p_attachment_id and storage_path=path;
  else
    delete from public.message_attachments where id=p_attachment_id and storage_path=path;

    -- 마지막 첨부를 뗐는데 본문도 없으면(평문이든 암호문이든) 남는 게 없으니 메시지째 삭제된다.
    update public.messages m
    set content=null,content_ciphertext=null,deleted_at=now(),deleted_by=caller_id
    where m.id=target_message_id
      and m.deleted_at is null
      and m.content is null
      and m.content_ciphertext is null
      and not exists(select 1 from public.message_attachments a where a.message_id=m.id);

    -- 반응과 봉투는 **메시지가 실제로 죽었을 때만** 지운다. 조건 없이 지우면 사진 세 장 중
    -- 하나만 뗀 사람이 그 메시지에 달린 반응을 전부 날려 버린다 -- 메시지도 본문도 나머지
    -- 첨부도 멀쩡히 살아 있는데.
    if found then
      delete from public.message_reactions where message_id=target_message_id;
      delete from public.message_keys where message_id=target_message_id;
    end if;
  end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.search_messages(p_query text, p_conversation_id bigint)
 RETURNS TABLE(message_id bigint, content_snippet text, sender_name text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare normalized_query text := regexp_replace(lower(btrim(p_query)), '\s+', '', 'g');
begin
  if p_conversation_id is null then raise exception 'conversation target required'; end if;
  if p_query is null or char_length(btrim(p_query)) not between 1 and 200 or normalized_query='' then raise exception 'query must contain 1 to 200 characters'; end if;
  -- 멤버십을 **먼저** 본다. is_direct_conversation은 security definer라 RLS를 지나쳐 대화 타입을
  -- 답해 주므로, 이 순서가 뒤집히면 비멤버가 "예외가 뜨는가 / 빈 결과가 오는가"로 임의의
  -- conversation_id(bigserial이라 순차 추측된다)가 1:1인지를 스캔할 수 있다. 내용은 안 새지만
  -- 어떤 id가 DM인지가 샌다.
  if not private.is_conversation_member(p_conversation_id) then raise exception 'conversation membership required'; end if;
  if private.is_direct_conversation(p_conversation_id) then
    raise exception 'direct conversations are end-to-end encrypted: search them on the client';
  end if;
  return query select m.id,left(m.content,300),p.name,m.created_at
  from public.messages m join public.profiles p on p.id=m.sender_id
  where m.conversation_id=p_conversation_id
    and m.deleted_at is null
    and m.content is not null
    and regexp_replace(lower(m.content),'\s+','','g') ilike '%'||normalized_query||'%'
  order by m.created_at desc,m.id desc limit 50;
end;
$function$
;



-- db diff는 함수 grant를 내지 않는다. private.message_envelope는 새 함수인데, ACL이 빈 함수는
-- 암묵적으로 EXECUTE TO PUBLIC이다 -- 그리고 authenticated는 private 스키마에 USAGE가 있다.
-- 즉 회수하지 않으면 아무 로그인 사용자나 임의의 p_caller_id를 넣어 이 security definer 함수를
-- 직접 불러, 자기가 속하지도 않은 대화의 봉투를 RLS를 지나쳐 긁어갈 수 있다.
--
-- (anon은 애초에 private 스키마 USAGE가 없어 도달하지 못한다. 그래서 tests/00-privileges.sql의
--  "anon은 public 함수를 실행할 수 없다" 단언이 이걸 잡아주지 못했고, 이번에 private 함수의
--  PUBLIC EXECUTE를 금지하는 단언을 따로 추가했다.)
revoke execute on function private.message_envelope(bigint,bigint,bigint) from public, anon, authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 기존 취약점: private 함수 6개의 ACL이 비어 있었다 = 암묵적 EXECUTE TO PUBLIC.
--
-- 선언적 스키마에는 이 회수/부여가 처음부터 적혀 있었지만 **마이그레이션에 한 번도 실리지
-- 않았다** (db diff는 함수 grant를 내지 않는다). 그동안 RLS 정책이 돌아간 것은 명시적
-- authenticated grant 덕이 아니라 그 암묵적 PUBLIC 권한 덕이었고, 그래서 아무도 눈치채지
-- 못했다.
--
-- 그중 하나가 private.anonymize_profile(bigint)다. security definer이고, 인자로 받은 프로필을
-- 탈퇴 처리한다. authenticated는 private 스키마에 USAGE가 있으므로 --
--
--     select private.anonymize_profile(<아무 프로필 id>);
--
-- -- 아무 로그인 학생이나 남의 계정을 영구히 지울 수 있었다. 실제로 재현 확인했다.
--
-- (tests/00-privileges.sql에 "private 함수는 PUBLIC에 열려선 안 된다"는 단언을 추가했고,
--  그게 이걸 잡았다. anon은 private 스키마 USAGE가 없어 도달하지 못하므로, 기존의 "anon은
--  public 함수를 실행할 수 없다" 단언으로는 영영 안 잡혔을 것이다 -- 위험한 롤은 authenticated다.)
-- ---------------------------------------------------------------------------

-- 아무도 부를 수 없다. 트리거와 다른 security definer 함수만 쓴다.
revoke execute on function private.anonymize_profile(bigint) from public, anon, authenticated, service_role;
revoke execute on function private.add_conversation_creator_member() from public, anon, authenticated, service_role;

-- RLS 정책과 security invoker 함수가 호출자 권한으로 부르므로 authenticated에게는 필요하다.
revoke execute on function private.has_uuid_object_suffix(text,text) from public, anon, service_role;
grant execute on function private.has_uuid_object_suffix(text,text) to authenticated;

revoke execute on function private.is_conversation_member(bigint), private.is_valid_message_parent(bigint,bigint) from public, anon, service_role;
grant execute on function private.is_conversation_member(bigint), private.is_valid_message_parent(bigint,bigint) to authenticated;

revoke execute on function private.can_participate_space(bigint) from public, anon, service_role;
grant execute on function private.can_participate_space(bigint) to authenticated;
