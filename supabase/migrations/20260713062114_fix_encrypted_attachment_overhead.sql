-- 봉인 형식에 버전 바이트가 붙은 뒤(SEAL_VERSION, primitives.ts) 암호화 첨부의 오버헤드가
-- 28(nonce 12 + 태그 16)에서 29(version 1 + nonce 12 + 태그 16)로 늘었다. 두 곳이 옛 값을
-- 그대로 들고 있어, 평문이 정확히 max_bytes인 첨부가 잘못 거부됐다:
--
--   (1) send_encrypted_message 의 size_bytes 상한 비교 (max_bytes+28 -> +29)
--   (2) message-files-encrypted 버킷의 file_size_limit (max(max_bytes)+28 -> +29).
--       이건 send RPC 이전에 업로드 자체를 막으므로, 하나만 고치면 다른 하나가 여전히 막는다.
--
-- 버킷 행은 시드 DML이라 선언적 스키마가 아니라 마이그레이션에 산다(20260712142606과 같다).
-- 함수는 create or replace라 기존 grant가 그대로 유지된다.

create or replace function public.send_encrypted_message(
  p_conversation_id bigint,
  p_content_ciphertext text default null,
  p_keys jsonb default '[]'::jsonb,
  p_parent_id bigint default null,
  p_attachments jsonb default '[]'::jsonb
)
returns bigint language plpgsql security definer set search_path='' as $$
declare
  caller_id bigint := private.require_current_profile(true);
  message_id bigint;
  expected_prefix text := p_conversation_id::text||'/'||(select auth.uid())::text||'/';
  sender_key bytea;
  ciphertext bytea := case when p_content_ciphertext is null then null else decode(p_content_ciphertext,'base64') end;
  attachment_count int4;
begin
  if not private.is_conversation_member(p_conversation_id) then raise exception 'conversation membership required'; end if;
  if not private.is_direct_conversation(p_conversation_id) then raise exception 'conversation is not end-to-end encrypted'; end if;
  if not private.is_valid_message_parent(p_parent_id,p_conversation_id) then raise exception 'active parent message in chat required'; end if;

  if p_attachments is null or jsonb_typeof(p_attachments)<>'array' then raise exception 'attachments must be a json array'; end if;
  if p_keys is null or jsonb_typeof(p_keys)<>'array' then raise exception 'keys must be a json array'; end if;
  attachment_count := jsonb_array_length(p_attachments);
  if ciphertext is null and attachment_count=0 then raise exception 'message needs a body or an attachment'; end if;
  if attachment_count>private.max_message_attachments() then
    raise exception 'a message carries at most % attachments', private.max_message_attachments();
  end if;

  select k.identity_public_key into sender_key from public.user_keys k where k.user_id=caller_id;
  if sender_key is null then raise exception 'sender has no key vault'; end if;

  -- 봉투가 정확히 "이 대화의, 나 아닌 참여자 전원"을 덮어야 한다. 덜 덮으면 상대가 못 여는
  -- 메시지가 조용히 생기고, 더 덮으면 대화 밖 사람 앞으로 봉인한 셈이 된다.
  if exists(
    select r.user_id from private.conversation_recipients(p_conversation_id,caller_id) r
    except
    select (item.value->>'user_id')::bigint from jsonb_array_elements(p_keys) as item(value)
  ) or exists(
    select (item.value->>'user_id')::bigint from jsonb_array_elements(p_keys) as item(value)
    except
    select r.user_id from private.conversation_recipients(p_conversation_id,caller_id) r
  ) then
    raise exception 'message keys must cover exactly the other members of the conversation';
  end if;

  -- 봉인에 쓰인 공개키가 지금의 공개키와 다르면 그 사이에 누가 키를 갈아엎은 것이다. 그대로
  -- 넣으면 아무도 못 여는 메시지가 영구히 남는다. 클라이언트는 키를 다시 읽고 재시도한다.
  if exists(
    select 1
    from jsonb_array_elements(p_keys) as item(value)
    left join public.user_keys k on k.user_id=(item.value->>'user_id')::bigint
    where k.identity_public_key is null
      or k.identity_public_key is distinct from decode(item.value->>'recipient_public_key','base64')
      or sender_key is distinct from decode(item.value->>'sender_public_key','base64')
  ) then
    raise exception 'message keys are stale: re-read the recipient identity keys and retry';
  end if;

  insert into public.messages(conversation_id,sender_id,parent_id,content_ciphertext)
  values(p_conversation_id,caller_id,p_parent_id,ciphertext)
  returning id into message_id;

  insert into public.message_keys(message_id,user_id,wrapped_key,sender_public_key,recipient_public_key)
  select
    message_id,
    (item.value->>'user_id')::bigint,
    decode(item.value->>'wrapped_key','base64'),
    decode(item.value->>'sender_public_key','base64'),
    decode(item.value->>'recipient_public_key','base64')
  from jsonb_array_elements(p_keys) as item(value);

  if attachment_count>0 then
    -- size_bytes는 storage에 실제로 앉아 있는 바이트 수(= 평문 + version 1 + nonce 12 + 태그 16
    -- = 평문 + 29)라서 평문 기준 상한인 max_bytes에 그 오버헤드를 더해 비교한다. 봉인 형식에 버전
    -- 바이트가 붙은 뒤 오버헤드가 28에서 29로 늘었다(primitives.ts의 seal).
    if exists(
      select 1
      from jsonb_array_elements(p_attachments) as item(value)
      left join public.message_attachment_mime_types allowed on allowed.content_type=item.value->>'content_type'
      where allowed.content_type is null
        or item.value->>'storage_path' is null
        or not private.has_uuid_object_suffix(item.value->>'storage_path',expected_prefix)
        or item.value->>'file_name_ciphertext' is null
        or (item.value->>'size_bytes')::int8 is null
        or (item.value->>'size_bytes')::int8<0
        or (item.value->>'size_bytes')::int8>allowed.max_bytes+29
        or not exists(
          select 1 from storage.objects o
          where o.bucket_id='message-files-encrypted'
            and o.name=item.value->>'storage_path'
            and o.created_at>=now()-interval '24 hours'
            and o.metadata->>'mimetype'='application/octet-stream'
            and (o.metadata->>'size')::int8=(item.value->>'size_bytes')::int8
        )
    ) then raise exception 'invalid message attachment'; end if;

    if attachment_count>1 and exists(
      select 1
      from jsonb_array_elements(p_attachments) as item(value)
      join public.mime_types mime on mime.content_type=item.value->>'content_type'
      where mime.kind<>'image'
    ) then raise exception 'only image attachments may share one message'; end if;

    insert into public.message_attachments(message_id,storage_bucket,storage_path,file_name_ciphertext,content_type,size_bytes,sort_order,width,height,duration_ms)
    select
      message_id,'message-files-encrypted',
      item.value->>'storage_path',
      decode(item.value->>'file_name_ciphertext','base64'),
      item.value->>'content_type',
      (item.value->>'size_bytes')::int8,
      (item.position-1)::int4,
      (item.value->>'width')::int4,
      (item.value->>'height')::int4,
      (item.value->>'duration_ms')::int4
    from jsonb_array_elements(p_attachments) with ordinality as item(value,position);
  end if;

  return message_id;
end $$;

-- (2) 버킷 file_size_limit. 평문 상한 + 봉인 오버헤드(29)여야, 평문이 정확히 max_bytes인
-- 첨부(= storage에 max_bytes+29 바이트)가 업로드 단계에서 막히지 않는다.
update storage.buckets
set file_size_limit = (select max(max_bytes) from public.message_attachment_mime_types) + 29
where id = 'message-files-encrypted';
