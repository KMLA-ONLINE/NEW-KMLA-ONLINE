drop trigger if exists "trg_mark_message_edited" on "public"."messages";

alter table "public"."message_attachments" drop constraint "message_attachments_bucket_check";

alter table "public"."message_attachments" drop constraint "message_attachments_file_name_check";

drop function if exists "public"."get_chat_messages"(p_conversation_id bigint, p_before_id bigint, p_limit integer);

drop function if exists "public"."list_conversations"();


  create table "public"."message_keys" (
    "message_id" bigint not null,
    "user_id" bigint not null,
    "wrapped_key" bytea not null,
    "sender_public_key" bytea not null,
    "recipient_public_key" bytea not null,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."message_keys" enable row level security;


  create table "public"."user_keys" (
    "user_id" bigint not null,
    "identity_public_key" bytea not null,
    "wrapped_user_key" bytea not null,
    "wrapped_identity_secret_key" bytea not null,
    "recovery_wrapped_user_key" bytea not null,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone
      );


alter table "public"."user_keys" enable row level security;

alter table "public"."message_attachments" add column "file_name_ciphertext" bytea;

alter table "public"."message_attachments" alter column "file_name" drop not null;

alter table "public"."messages" add column "content_ciphertext" bytea;

CREATE UNIQUE INDEX message_keys_pkey ON public.message_keys USING btree (message_id, user_id);

CREATE UNIQUE INDEX user_keys_pkey ON public.user_keys USING btree (user_id);

alter table "public"."message_keys" add constraint "message_keys_pkey" PRIMARY KEY using index "message_keys_pkey";

alter table "public"."user_keys" add constraint "user_keys_pkey" PRIMARY KEY using index "user_keys_pkey";

alter table "public"."message_attachments" add constraint "message_attachments_file_name_ciphertext_check" CHECK (((file_name_ciphertext IS NULL) OR ((octet_length(file_name_ciphertext) >= 29) AND (octet_length(file_name_ciphertext) <= 1052)))) not valid;

alter table "public"."message_attachments" validate constraint "message_attachments_file_name_ciphertext_check";

alter table "public"."message_attachments" add constraint "message_attachments_name_shape_check" CHECK (
CASE
    WHEN (storage_bucket = 'message-files-encrypted'::text) THEN ((file_name IS NULL) AND (file_name_ciphertext IS NOT NULL))
    ELSE ((file_name IS NOT NULL) AND (file_name_ciphertext IS NULL))
END) not valid;

alter table "public"."message_attachments" validate constraint "message_attachments_name_shape_check";

alter table "public"."message_keys" add constraint "message_keys_message_id_fkey" FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE RESTRICT not valid;

alter table "public"."message_keys" validate constraint "message_keys_message_id_fkey";

alter table "public"."message_keys" add constraint "message_keys_recipient_public_key_check" CHECK ((octet_length(recipient_public_key) = 32)) not valid;

alter table "public"."message_keys" validate constraint "message_keys_recipient_public_key_check";

alter table "public"."message_keys" add constraint "message_keys_sender_public_key_check" CHECK ((octet_length(sender_public_key) = 32)) not valid;

alter table "public"."message_keys" validate constraint "message_keys_sender_public_key_check";

alter table "public"."message_keys" add constraint "message_keys_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE RESTRICT not valid;

alter table "public"."message_keys" validate constraint "message_keys_user_id_fkey";

alter table "public"."message_keys" add constraint "message_keys_wrapped_key_check" CHECK (((octet_length(wrapped_key) >= 48) AND (octet_length(wrapped_key) <= 128))) not valid;

alter table "public"."message_keys" validate constraint "message_keys_wrapped_key_check";

alter table "public"."messages" add constraint "messages_body_exclusive_check" CHECK (((content IS NULL) OR (content_ciphertext IS NULL))) not valid;

alter table "public"."messages" validate constraint "messages_body_exclusive_check";

alter table "public"."messages" add constraint "messages_content_ciphertext_check" CHECK (((content_ciphertext IS NULL) OR ((octet_length(content_ciphertext) >= 29) AND (octet_length(content_ciphertext) <= 40060)))) not valid;

alter table "public"."messages" validate constraint "messages_content_ciphertext_check";

alter table "public"."messages" add constraint "messages_deleted_body_check" CHECK (((deleted_at IS NULL) OR ((content IS NULL) AND (content_ciphertext IS NULL)))) not valid;

alter table "public"."messages" validate constraint "messages_deleted_body_check";

alter table "public"."user_keys" add constraint "user_keys_identity_public_key_check" CHECK ((octet_length(identity_public_key) = 32)) not valid;

alter table "public"."user_keys" validate constraint "user_keys_identity_public_key_check";

alter table "public"."user_keys" add constraint "user_keys_recovery_wrapped_user_key_check" CHECK (((octet_length(recovery_wrapped_user_key) >= 48) AND (octet_length(recovery_wrapped_user_key) <= 128))) not valid;

alter table "public"."user_keys" validate constraint "user_keys_recovery_wrapped_user_key_check";

alter table "public"."user_keys" add constraint "user_keys_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."user_keys" validate constraint "user_keys_user_id_fkey";

alter table "public"."user_keys" add constraint "user_keys_wrapped_identity_secret_key_check" CHECK (((octet_length(wrapped_identity_secret_key) >= 48) AND (octet_length(wrapped_identity_secret_key) <= 128))) not valid;

alter table "public"."user_keys" validate constraint "user_keys_wrapped_identity_secret_key_check";

alter table "public"."user_keys" add constraint "user_keys_wrapped_user_key_check" CHECK (((octet_length(wrapped_user_key) >= 48) AND (octet_length(wrapped_user_key) <= 128))) not valid;

alter table "public"."user_keys" validate constraint "user_keys_wrapped_user_key_check";

alter table "public"."message_attachments" add constraint "message_attachments_bucket_check" CHECK ((storage_bucket = ANY (ARRAY['message-files'::text, 'message-files-encrypted'::text]))) not valid;

alter table "public"."message_attachments" validate constraint "message_attachments_bucket_check";

alter table "public"."message_attachments" add constraint "message_attachments_file_name_check" CHECK (((file_name IS NULL) OR ((char_length(btrim(file_name)) >= 1) AND (char_length(btrim(file_name)) <= 255)))) not valid;

alter table "public"."message_attachments" validate constraint "message_attachments_file_name_check";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.conversation_recipients(p_conversation_id bigint, p_sender_id bigint)
 RETURNS TABLE(user_id bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case when dc.user1_id=p_sender_id then dc.user2_id else dc.user1_id end
  from public.direct_conversations dc
  where dc.conversation_id=p_conversation_id and p_sender_id in (dc.user1_id,dc.user2_id)
  union
  select cm.user_id
  from public.conversation_members cm
  where cm.conversation_id=p_conversation_id and cm.user_id<>p_sender_id
$function$
;

CREATE OR REPLACE FUNCTION private.enforce_message_encryption_shape()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if private.is_direct_conversation(new.conversation_id) then
    if new.content is not null then
      raise exception 'direct conversations are end-to-end encrypted: send content_ciphertext, not content';
    end if;
  elsif new.content_ciphertext is not null then
    raise exception 'group conversations are not encrypted: send content, not content_ciphertext';
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.is_direct_conversation(p_conversation_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists(select 1 from public.conversations c where c.id=p_conversation_id and c.type='direct')
$function$
;

CREATE OR REPLACE FUNCTION public.create_user_keys(p_identity_public_key text, p_wrapped_user_key text, p_wrapped_identity_secret_key text, p_recovery_wrapped_user_key text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller_id bigint := private.require_current_profile(false);
begin
  insert into public.user_keys (
    user_id, identity_public_key, wrapped_user_key, wrapped_identity_secret_key, recovery_wrapped_user_key
  )
  values (
    caller_id,
    decode(p_identity_public_key, 'base64'),
    decode(p_wrapped_user_key, 'base64'),
    decode(p_wrapped_identity_secret_key, 'base64'),
    decode(p_recovery_wrapped_user_key, 'base64')
  );
exception when unique_violation then
  raise exception 'key vault already exists';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.edit_encrypted_message(p_id bigint, p_content_ciphertext text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller_id bigint := private.require_current_profile(true); target public.messages;
begin
  select * into target from public.messages where id=p_id and deleted_at is null for update;
  if target.id is null then raise exception 'message not found'; end if;
  if not private.is_direct_conversation(target.conversation_id) then raise exception 'conversation is not end-to-end encrypted'; end if;
  if target.sender_id<>caller_id then raise exception 'message sender required'; end if;
  if target.created_at<now()-interval '15 minutes' then raise exception 'not allowed to edit this message'; end if;
  if p_content_ciphertext is null then raise exception 'message body required'; end if;

  -- edited_at은 trg_mark_message_edited가 찍는다.
  update public.messages set content_ciphertext=decode(p_content_ciphertext,'base64') where id=p_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.get_my_key_vault()
 RETURNS TABLE(identity_public_key text, wrapped_user_key text, wrapped_identity_secret_key text, recovery_wrapped_user_key text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller_id bigint := private.require_current_profile(false);
begin
  return query
  select
    encode(k.identity_public_key, 'base64'),
    encode(k.wrapped_user_key, 'base64'),
    encode(k.wrapped_identity_secret_key, 'base64'),
    encode(k.recovery_wrapped_user_key, 'base64')
  from public.user_keys k
  where k.user_id = caller_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reseal_user_keys(p_wrapped_user_key text, p_recovery_wrapped_user_key text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller_id bigint := private.require_current_profile(false);
begin
  update public.user_keys
  set wrapped_user_key = decode(p_wrapped_user_key, 'base64'),
      recovery_wrapped_user_key = decode(p_recovery_wrapped_user_key, 'base64'),
      updated_at = now()
  where user_id = caller_id;
  if not found then raise exception 'key vault not found'; end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rotate_user_keys(p_identity_public_key text, p_wrapped_user_key text, p_wrapped_identity_secret_key text, p_recovery_wrapped_user_key text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller_id bigint := private.require_current_profile(false);
begin
  update public.user_keys
  set identity_public_key = decode(p_identity_public_key, 'base64'),
      wrapped_user_key = decode(p_wrapped_user_key, 'base64'),
      wrapped_identity_secret_key = decode(p_wrapped_identity_secret_key, 'base64'),
      recovery_wrapped_user_key = decode(p_recovery_wrapped_user_key, 'base64'),
      updated_at = now()
  where user_id = caller_id;
  if not found then raise exception 'key vault not found'; end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.send_encrypted_message(p_conversation_id bigint, p_content_ciphertext text DEFAULT NULL::text, p_keys jsonb DEFAULT '[]'::jsonb, p_parent_id bigint DEFAULT NULL::bigint, p_attachments jsonb DEFAULT '[]'::jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    -- size_bytes는 storage에 실제로 앉아 있는 바이트 수(= 평문 + nonce 12 + 태그 16)라서
    -- 평문 기준 상한인 max_bytes에 그 오버헤드를 더해 비교한다.
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
        or (item.value->>'size_bytes')::int8>allowed.max_bytes+28
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
end $function$
;

CREATE OR REPLACE FUNCTION private.anonymize_profile(p_profile_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- 탈퇴하면 열쇠고리도 같이 태운다. 남겨둬 봐야 아무도 열 수 없는 blob일 뿐이고
  -- (userKey를 푸는 비밀번호는 애초에 서버에 없다), 상대방 쪽 히스토리는 상대의
  -- 키로 그대로 읽힌다. 재가입하면 새 신원키를 받고, 예전 DM은 영영 안 열린다 --
  -- 종단간 암호화가 뜻하는 바가 그거다.
  delete from public.user_keys where user_id = p_profile_id;

  update public.profiles
  set name = '탈퇴한 사용자',
      role = 'user',
      student_number = null,
      class_no = null,
      cohort = null,
      gender = null,
      track = null,
      department = null,
      phone_number = null,
      avatar_url = null,
      cover_image_url = null,
      birthday = null,
      description = null,
      status = 'withdrawn',
      dorm_room = null,
      is_reenrolled = false,
      status_updated_at = now(),
      status_updated_by = null,
      deleted_at = now()
  where id = p_profile_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.enforce_message_attachment_shape()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if exists (
    select 1
    from (select distinct message_id from new_rows) touched
    cross join lateral (
      select
        count(*) as total,
        count(*) filter (where mime.kind <> 'image') as non_image_count
      from public.message_attachments a
      join public.mime_types mime on mime.content_type = a.content_type
      where a.message_id = touched.message_id
    ) shape
    where shape.total > private.max_message_attachments()
      or (shape.total > 1 and shape.non_image_count > 0)
  ) then
    raise exception 'a message carries at most % attachments, and only images may share one', private.max_message_attachments();
  end if;

  -- 암호화된 대화의 첨부는 암호화 전용 버킷에만 산다. 버킷을 가른 이유는 09-storage에
  -- 있다: 암호문은 전부 octet-stream이라 message-files의 MIME 화이트리스트를 무력화한다.
  -- 여기서 막지 않으면 그룹 첨부를 암호화 버킷에 올려 그 화이트리스트를 우회할 수 있다.
  if exists (
    select 1
    from new_rows a
    join public.messages m on m.id = a.message_id
    join public.conversations c on c.id = m.conversation_id
    where a.storage_bucket <> case when c.type = 'direct' then 'message-files-encrypted' else 'message-files' end
  ) then
    raise exception 'attachment bucket does not match the conversation encryption';
  end if;

  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.mark_message_edited()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare body_changed boolean;
begin
  if new.content is not null then
    new.content := nullif(btrim(new.content), '');
  end if;

  body_changed := new.content is distinct from old.content
    or new.content_ciphertext is distinct from old.content_ciphertext;

  -- 삭제는 편집이 아니다. soft_delete_message()도 본문을 비우는 UPDATE라서, 이 구분이
  -- 없으면 아래 편집 시간창이 그걸 붙잡아 15분 지난 자기 메시지를 지울 수 없게 만든다.
  -- (deleted_at에는 authenticated 컬럼 grant가 없다 -- security definer RPC와
  --  service_role만 세울 수 있고, 그 RPC가 발신자 본인인지 이미 확인한다.)
  if new.deleted_at is not null and old.deleted_at is null then
    return new;
  end if;

  -- messages_pin_update lets any conversation member update an active
  -- message row (for pinning), which as a side effect widens row-level
  -- visibility for this UPDATE command as a whole. Column grants alone
  -- can't re-narrow that back down, so content edits are only actually
  -- authorized here: sender, within the edit window.
  if body_changed
    and (old.sender_id <> private.current_profile_id() or old.created_at < now() - interval '15 minutes')
  then
    raise exception 'not allowed to edit this message';
  end if;

  if old.deleted_at is null and new.deleted_at is null and body_changed then
    new.edited_at := now();
  end if;
  return new;
end;
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
  delete from public.message_keys mk using public.messages m where mk.message_id=m.id and m.conversation_id=p_conversation_id;
  delete from public.chat_read_states where conversation_id=p_conversation_id;
  delete from public.chat_notification_settings where conversation_id=p_conversation_id;

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

CREATE OR REPLACE FUNCTION public.complete_storage_cleanup(p_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare bucket text; path text;
begin
  perform private.require_service_role();
  select storage_bucket,storage_path into bucket,path from private.attachment_cleanup_queue where id=p_id and processed_at is null for update;
  if path is null then return; end if;
  if bucket='post-files' then delete from public.post_attachments where storage_path=path;
  elsif bucket in ('message-files','message-files-encrypted') then delete from public.message_attachments where storage_bucket=bucket and storage_path=path;
  elsif bucket='avatars' then update public.profiles set avatar_url=null where avatar_url=path;
  elsif bucket='profile-covers' then update public.profiles set cover_image_url=null where cover_image_url=path;
  elsif bucket='space-images' then update public.spaces set image_url=null where image_url=path and deleted_at is not null;
  else raise exception 'invalid cleanup bucket'; end if;
  update private.attachment_cleanup_queue set processed_at=now(),last_error=null where id=p_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.enqueue_due_storage_cleanup()
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result bigint;
begin
  perform private.require_service_role();
  delete from private.attachment_cleanup_queue where processed_at<now()-interval '30 days';

  insert into private.attachment_cleanup_queue(storage_bucket,storage_path)
  select a.storage_bucket,a.storage_path from public.post_attachments a join public.posts p on p.id=a.post_id
  where p.deleted_at<now()-interval '7 days'
  union
  select a.storage_bucket,a.storage_path from public.message_attachments a join public.messages m on m.id=a.message_id
  where m.deleted_at<now()-interval '7 days'
  union
  select a.storage_bucket,a.storage_path from public.post_attachments a join public.posts p on p.id=a.post_id join public.spaces s on s.id=p.space_id
  where s.deleted_at<now()-interval '7 days'
  union
  select 'space-images',s.image_url from public.spaces s
  where s.deleted_at<now()-interval '7 days' and s.image_url is not null
  union
  select o.bucket_id,o.name from storage.objects o
  where o.created_at<now()-interval '48 hours'
    and o.bucket_id in ('avatars','profile-covers','space-images','post-files','message-files','message-files-encrypted')
    and not exists(select 1 from public.profiles p where o.bucket_id='avatars' and p.avatar_url=o.name)
    and not exists(select 1 from public.profiles p where o.bucket_id='profile-covers' and p.cover_image_url=o.name)
    and not exists(select 1 from public.spaces s where o.bucket_id='space-images' and s.image_url=o.name)
    and not exists(select 1 from public.post_attachments a where o.bucket_id='post-files' and a.storage_path=o.name)
    and not exists(select 1 from public.message_attachments a where o.bucket_id in ('message-files','message-files-encrypted') and a.storage_bucket=o.bucket_id and a.storage_path=o.name)
  on conflict(storage_bucket,storage_path) do update
  set available_at=least(private.attachment_cleanup_queue.available_at,excluded.available_at),processed_at=null;

  get diagnostics result=row_count;
  return result;
end $function$
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
    case when parent.id is null then null else jsonb_build_object('id',parent.id,'sender_id',parent.sender_id,'sender_name',parent_sender.name,'content',parent.content,'content_ciphertext',encode(parent.content_ciphertext,'base64'),'message_key',parent_key.envelope,'created_at',parent.created_at) end as parent_message,
    page.content,
    encode(page.content_ciphertext,'base64') as content_ciphertext,
    message_key.envelope as message_key,
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
    select jsonb_build_object('wrapped_key',encode(mk.wrapped_key,'base64'),'sender_public_key',encode(mk.sender_public_key,'base64'),'recipient_public_key',encode(mk.recipient_public_key,'base64')) as envelope
    from public.message_keys mk
    where mk.message_id=page.id and (mk.user_id=caller_id or page.sender_id=caller_id)
    order by (mk.user_id=caller_id) desc, mk.user_id
    limit 1
  ) message_key on true
  left join lateral (
    select jsonb_build_object('wrapped_key',encode(mk.wrapped_key,'base64'),'sender_public_key',encode(mk.sender_public_key,'base64'),'recipient_public_key',encode(mk.recipient_public_key,'base64')) as envelope
    from public.message_keys mk
    where mk.message_id=parent.id and (mk.user_id=caller_id or parent.sender_id=caller_id)
    order by (mk.user_id=caller_id) desc, mk.user_id
    limit 1
  ) parent_key on true
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
      (
        select jsonb_build_object('wrapped_key',encode(mk.wrapped_key,'base64'),'sender_public_key',encode(mk.sender_public_key,'base64'),'recipient_public_key',encode(mk.recipient_public_key,'base64'))
        from public.message_keys mk
        where mk.message_id=m.id and (mk.user_id=caller_id or m.sender_id=caller_id)
        order by (mk.user_id=caller_id) desc, mk.user_id
        limit 1
      ) as envelope
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
    delete from public.message_reactions where message_id=target_message_id;

    -- 마지막 첨부를 뗐는데 본문도 없으면(평문이든 암호문이든) 남는 게 없으니 메시지째 삭제된다.
    update public.messages m
    set content=null,content_ciphertext=null,deleted_at=now(),deleted_by=caller_id
    where m.id=target_message_id
      and m.deleted_at is null
      and m.content is null
      and m.content_ciphertext is null
      and not exists(select 1 from public.message_attachments a where a.message_id=m.id);

    -- 삭제됐다면 봉투도 같이 태운다. soft_delete_message()와 같은 이유다.
    if found then
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

CREATE OR REPLACE FUNCTION public.soft_delete_message(p_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller_id bigint := private.require_current_profile(true); target_sender_id bigint;
begin
  select sender_id into target_sender_id from public.messages where id=p_id and deleted_at is null for update;
  if target_sender_id is null then return; end if;
  if target_sender_id<>caller_id then raise exception 'message sender required'; end if;

  insert into private.attachment_cleanup_queue(storage_bucket,storage_path,requested_by)
  select a.storage_bucket,a.storage_path,caller_id
  from public.message_attachments a
  where a.message_id=p_id
  on conflict(storage_bucket,storage_path) do update
  set available_at=least(private.attachment_cleanup_queue.available_at,excluded.available_at),
      processed_at=null,
      last_error=null;

  delete from public.message_attachments where message_id=p_id;
  delete from public.message_reactions where message_id=p_id;
  -- 본문이 사라진 메시지의 봉투는 아무것도 열지 않는다. 남겨두면 삭제된 메시지에 대해
  -- "누가 누구에게 봉인했는가"만 영원히 남는 셈이라, 지우는 쪽이 맞다.
  delete from public.message_keys where message_id=p_id;

  update public.messages
  set content=null,content_ciphertext=null,deleted_at=now(),deleted_by=caller_id
  where id=p_id;
end;
$function$
;

grant select on table "public"."message_keys" to "authenticated";

grant delete on table "public"."message_keys" to "service_role";

grant insert on table "public"."message_keys" to "service_role";

grant select on table "public"."message_keys" to "service_role";

grant update on table "public"."message_keys" to "service_role";

grant delete on table "public"."user_keys" to "service_role";

grant insert on table "public"."user_keys" to "service_role";

grant select on table "public"."user_keys" to "service_role";

grant update on table "public"."user_keys" to "service_role";


  create policy "message_keys_select"
  on "public"."message_keys"
  as permissive
  for select
  to authenticated
using (private.can_access_message(message_id));



  create policy "user_keys_select"
  on "public"."user_keys"
  as permissive
  for select
  to authenticated
using (((user_id = ( SELECT private.current_profile_id() AS current_profile_id)) OR (( SELECT private.is_accepted_user() AS is_accepted_user) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = user_keys.user_id) AND (p.status = 'accepted'::public.profile_status) AND (p.deleted_at IS NULL)))))));


CREATE TRIGGER trg_enforce_message_encryption_shape BEFORE INSERT OR UPDATE OF conversation_id, content, content_ciphertext ON public.messages FOR EACH ROW EXECUTE FUNCTION private.enforce_message_encryption_shape();

CREATE TRIGGER trg_mark_message_edited BEFORE UPDATE OF content, content_ciphertext ON public.messages FOR EACH ROW EXECUTE FUNCTION private.mark_message_edited();

drop policy "message_files_insert" on "storage"."objects";

drop policy "message_files_select" on "storage"."objects";


  create policy "message_files_insert"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = ANY (ARRAY['message-files'::text, 'message-files-encrypted'::text])) AND (split_part(name, '/'::text, 2) = (( SELECT auth.uid() AS uid))::text) AND (EXISTS ( SELECT 1
   FROM public.conversations c
  WHERE (((c.id)::text = split_part(objects.name, '/'::text, 1)) AND private.is_conversation_member(c.id) AND private.has_uuid_object_suffix(objects.name, ((((c.id)::text || '/'::text) || (( SELECT auth.uid() AS uid))::text) || '/'::text)) AND (objects.bucket_id =
        CASE
            WHEN (c.type = 'direct'::public.conversation_type) THEN 'message-files-encrypted'::text
            ELSE 'message-files'::text
        END))))));



  create policy "message_files_select"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = ANY (ARRAY['message-files'::text, 'message-files-encrypted'::text])) AND ((EXISTS ( SELECT 1
   FROM public.message_attachments a
  WHERE ((a.storage_bucket = objects.bucket_id) AND (a.storage_path = objects.name) AND private.can_access_message(a.message_id)))) OR ((split_part(name, '/'::text, 2) = (( SELECT auth.uid() AS uid))::text) AND (EXISTS ( SELECT 1
   FROM public.conversations c
  WHERE (((c.id)::text = split_part(objects.name, '/'::text, 1)) AND private.is_conversation_member(c.id) AND private.has_uuid_object_suffix(objects.name, ((((c.id)::text || '/'::text) || (( SELECT auth.uid() AS uid))::text) || '/'::text)))))))));





-- ---------------------------------------------------------------------------
-- 여기서부터는 손으로 붙인 것이다. `supabase db diff`는 (1) 함수 grant를 단 하나도
-- 내보내지 않고, (2) 컬럼 단위 grant를 보지 못하며, (3) DML을 모른다. 위쪽 자동 생성분만
-- 적용하면 다음이 전부 죽는다.
-- ---------------------------------------------------------------------------

-- (2) user_keys의 컬럼 grant. 이게 없으면 아무도 상대의 신원 공개키를 읽을 수 없고,
-- 그러면 메시지 키를 봉인할 대상이 없어 DM을 한 통도 보낼 수 없다.
-- 봉인된 blob들은 여기 없다 -- 오직 public.get_my_key_vault()로만 나간다.
grant select (user_id, identity_public_key, created_at, updated_at) on table public.user_keys to authenticated;

-- (1) 함수 grant.
--
-- get_chat_messages와 list_conversations는 반환 시그니처가 바뀌어 drop 후 재생성됐다.
-- drop은 기존 grant를 조용히 들고 가면서, 동시에 함수의 암묵적 EXECUTE TO PUBLIC을 되살린다
-- (기본 권한 revoke는 그걸 막지 못한다 -- 스키마의 모든 함수가 명시적으로 revoke하는 이유다).
-- 그래서 재생성된 함수는 grant만으로 부족하고, 반드시 다시 회수까지 해야 한다: 안 하면
-- 대화 목록과 메시지 전문이 anon에게 열린다.
revoke execute on function public.get_chat_messages(bigint,bigint,int4) from public, anon, service_role;
revoke execute on function public.list_conversations() from public, anon, service_role;
grant execute on function public.get_chat_messages(bigint,bigint,int4) to authenticated;
grant execute on function public.list_conversations() to authenticated;

-- 새 RPC들.
grant execute on function public.get_my_key_vault() to authenticated;
grant execute on function public.create_user_keys(text,text,text,text) to authenticated;
grant execute on function public.reseal_user_keys(text,text) to authenticated;
grant execute on function public.rotate_user_keys(text,text,text,text) to authenticated;
grant execute on function public.send_encrypted_message(bigint,text,jsonb,bigint,jsonb) to authenticated;
grant execute on function public.edit_encrypted_message(bigint,text) to authenticated;

-- private.is_direct_conversation은 security invoker인 public.search_messages가 부른다.
-- 즉 호출자 권한으로 실행되므로 authenticated에게 execute가 없으면 그룹 채팅 검색까지
-- 통째로 죽는다. (schema_runtime_check의 "실행 가능한 롤이 없는 함수" 단언은 public 스키마만
--  보므로 이건 잡아주지 못한다.)
grant execute on function private.is_direct_conversation(bigint) to authenticated;
revoke execute on function private.is_direct_conversation(bigint) from public, anon, service_role;

revoke execute on function private.conversation_recipients(bigint,bigint) from public, anon, authenticated, service_role;
revoke execute on function private.enforce_message_encryption_shape() from public, anon, authenticated, service_role;

revoke execute on function public.get_my_key_vault(), public.create_user_keys(text,text,text,text), public.reseal_user_keys(text,text), public.rotate_user_keys(text,text,text,text) from public, anon, service_role;
revoke execute on function public.send_encrypted_message(bigint,text,jsonb,bigint,jsonb), public.edit_encrypted_message(bigint,text) from public, anon, service_role;

-- (3) 암호화 전용 버킷. 버킷 행은 시드 DML이라 선언적 스키마가 아니라 마이그레이션에 산다
-- (message-files도 그렇다).
--
-- 이 버킷을 따로 두는 이유: 암호화된 첨부는 storage 입장에서 전부 application/octet-stream
-- 이다. 그걸 message-files에 넣으면 그 버킷의 MIME 화이트리스트가 -- image/svg+xml 차단을
-- 포함해 -- 통째로 무의미해진다. 그룹 채팅은 그 화이트리스트를 그대로 지킨다.
--
-- 크기 상한은 평문 기준 상한 + AEAD 오버헤드(nonce 12 + GCM 태그 16)다.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'message-files-encrypted',
  'message-files-encrypted',
  false,
  (select max(max_bytes) from public.message_attachment_mime_types) + 28,
  array['application/octet-stream']
)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- 상대의 신원 공개키를 읽는 문. security invoker라 RLS와 컬럼 grant가 그대로 걸린다 --
-- 즉 테이블이 이미 허용하는 것 이상을 줄 수 없고, 봉인된 blob은 grant가 없어 새어 나갈
-- 방법 자체가 없다.
create or replace function public.get_identity_public_keys(p_user_ids bigint[])
returns table(user_id bigint, identity_public_key text)
language sql stable security invoker set search_path = '' as $$
  select k.user_id, encode(k.identity_public_key, 'base64')
  from public.user_keys k
  where k.user_id = any(p_user_ids)
$$;

revoke execute on function public.get_identity_public_keys(bigint[]) from public, anon, service_role;
grant execute on function public.get_identity_public_keys(bigint[]) to authenticated;
