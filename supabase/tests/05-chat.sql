-- 채팅. supabase/schemas/05-chat.sql
--
-- 두 절로 나뉜다: 그룹 대화의 평문 계약, 그리고 1:1 대화의 종단간 암호화 계약. 같은
-- messages 테이블 위에 앉아 있어서 한 파일에 둔다 -- 나누면 픽스처만 두 벌이 된다.

begin;

do $$
declare
  user1 uuid := '11111111-1111-4111-8111-111111111111';
  user2 uuid := '22222222-2222-4222-8222-222222222222';
  user3 uuid := '33333333-3333-4333-8333-333333333333';
  profile1 bigint;
  profile2 bigint;
  profile3 bigint;
  room1 bigint;
  room2 bigint;
  group1 bigint;
  message1 bigint;
  secret1 bigint;
  -- 진짜 X25519 점일 필요가 없다. 스키마가 보는 것은 길이뿐이고, 실제 암복호 왕복은
  -- app/lib/crypto/e2ee.integration.test.ts가 진짜 키로 증명한다.
  pubkey1 bytea := decode(repeat('a1', 32), 'hex');
  pubkey2 bytea := decode(repeat('b2', 32), 'hex');
  pubkey_new bytea := decode(repeat('c3', 32), 'hex');
  sealed bytea := decode(repeat('dd', 60), 'hex');
  resealed bytea := decode(repeat('ee', 60), 'hex');
  envelope jsonb;
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values
    (user1, 'chat-check-1@example.com', '{"name":"Chat Check 1"}'::jsonb),
    (user2, 'chat-check-2@example.com', '{"name":"Chat Check 2"}'::jsonb),
    (user3, 'chat-check-3@example.com', '{"name":"Chat Check 3"}'::jsonb);

  select id into profile1 from public.profiles where auth_user_id = user1;
  select id into profile2 from public.profiles where auth_user_id = user2;
  select id into profile3 from public.profiles where auth_user_id = user3;

  update public.profiles
  set type = 'teacher', status = 'accepted'
  where id in (profile1, profile2, profile3);

  perform set_config('request.jwt.claim.sub', user1::text, true);

  room1 := public.create_direct_conversation(profile2);
  room2 := public.create_direct_conversation(profile2);
  if room1 <> room2
    or (select count(*) from public.direct_conversations where user1_id = least(profile1, profile2) and user2_id = greatest(profile1, profile2)) <> 1
  then
    raise exception 'direct conversation uniqueness contract failed';
  end if;

  -- -------------------------------------------------------------------------
  -- 평문: 그룹 대화
  -- -------------------------------------------------------------------------

  insert into public.conversations (type, name, created_by)
  values ('group', '런타임 체크', profile1)
  returning id into group1;
  insert into public.conversation_members (conversation_id, user_id)
  values (group1, profile2)
  on conflict do nothing;

  insert into public.messages (conversation_id, sender_id, content)
  values (group1, profile1, '검색 테스트 메시지')
  returning id into message1;
  if not exists (select 1 from public.chat_read_states where conversation_id = group1 and user_id = profile1 and last_read_message_id = message1) then
    raise exception 'sender read state trigger failed';
  end if;
  if not exists (select 1 from public.search_messages('검색테스트', group1) where message_id = message1) then
    raise exception 'space-insensitive message search failed';
  end if;

  -- messages_pin_update는 발신자가 아닌 참여자에게도 pinned_at을 허용한다. profile2는
  -- message1을 보내지 않았다.
  perform set_config('request.jwt.claim.sub', user2::text, true);
  update public.messages set pinned_at = now() where id = message1;
  if not exists (
    select 1 from public.messages where id = message1 and pinned_at is not null and pinned_by = profile2
  ) then
    raise exception 'message pin contract failed';
  end if;

  -- pinned_at을 자기 값으로 재대입하는 no-op UPDATE로 pinned_by를 가로챌 수 없다.
  -- `update of pinned_at` 트리거는 값이 같아도 컬럼이 SET 목록에 있기만 하면 발화하므로,
  -- 가드가 없으면 아무 멤버나 남이 고정한 메시지의 "고정한 사람"을 자기 이름으로 바꿔친다.
  perform set_config('request.jwt.claim.sub', user3::text, true);

  -- get_chat_messages의 유일한 접근 통제는 멤버십 검사다. 비멤버가 임의 conversation_id로 부르면
  -- 예외가 나야 한다 -- 0행을 조용히 주면 내용은 안 새도 "그 대화가 존재하고 내가 못 본다"가 새고,
  -- conversation_id가 bigserial이라 순차 추측된다. room1(1:1)에 profile3는 절대 낄 수 없다.
  begin
    perform public.get_chat_messages(room1);
    raise exception 'a non-member must not read a conversation via get_chat_messages';
  exception when others then
    if sqlerrm not like '%conversation membership required%' then raise; end if;
  end;

  insert into public.conversation_members (conversation_id, user_id) values (group1, profile3) on conflict do nothing;
  update public.messages set pinned_at = pinned_at where id = message1;
  if not exists (select 1 from public.messages where id = message1 and pinned_by = profile2) then
    raise exception 'a no-op pin update must not reassign pinned_by';
  end if;
  perform set_config('request.jwt.claim.sub', user2::text, true);

  update public.messages set pinned_at = null where id = message1;
  if exists (
    select 1 from public.messages where id = message1 and (pinned_at is not null or pinned_by is not null)
  ) then
    raise exception 'message unpin contract failed';
  end if;

  -- 그 넓어진 행 가시성이 본문 편집까지 흘려보내면 안 된다. 컬럼 grant로는 다시 좁힐 수
  -- 없으므로 private.mark_message_edited()가 유일한 관문이다.
  begin
    update public.messages set content = 'unauthorized edit' where id = message1;
    raise exception 'non-sender message content edit should have been rejected';
  exception when others then
    if sqlerrm <> 'not allowed to edit this message' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub', user1::text, true);

  -- 삭제는 편집이 아니다. mark_message_edited()가 둘을 구분하지 못하면, 본문을 비우는
  -- soft delete가 15분 편집 창에 걸려 "오래된 자기 메시지를 지울 수 없는" 상태가 된다.
  update public.messages set created_at = now() - interval '16 minutes' where id = message1;
  perform public.soft_delete_message(message1);
  if not exists (select 1 from public.messages where id = message1 and deleted_at is not null and content is null) then
    raise exception 'soft delete outside the edit window failed';
  end if;

  -- -------------------------------------------------------------------------
  -- 종단간 암호화: 1:1 대화 (docs/e2ee.md)
  -- -------------------------------------------------------------------------

  perform public.create_user_keys(encode(pubkey1,'base64'), encode(sealed,'base64'), encode(sealed,'base64'));
  perform set_config('request.jwt.claim.sub', user2::text, true);
  perform public.create_user_keys(encode(pubkey2,'base64'), encode(sealed,'base64'), encode(sealed,'base64'));
  perform set_config('request.jwt.claim.sub', user1::text, true);

  -- 암호문 쓰기는 RPC만이 문이다. 컬럼 grant가 없으므로 테이블 직접 쓰기는 구조적으로 막힌다.
  if has_column_privilege('authenticated', 'public.messages', 'content_ciphertext', 'INSERT')
    or has_column_privilege('authenticated', 'public.messages', 'content_ciphertext', 'UPDATE')
    or has_any_column_privilege('authenticated', 'public.message_keys', 'INSERT')
    or not has_function_privilege('authenticated', 'public.send_encrypted_message(bigint,text,jsonb,bigint,jsonb)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.edit_encrypted_message(bigint,text)', 'EXECUTE')
  then
    raise exception 'the encrypted write path must be RPC-only';
  end if;

  -- 1:1은 평문을 받지 않고, 그룹은 암호문을 받지 않는다.
  begin
    insert into public.messages (conversation_id, sender_id, content) values (room1, profile1, '평문');
    raise exception 'plaintext into a direct conversation should have been rejected';
  exception when others then
    if sqlerrm not like 'direct conversations are end-to-end encrypted%' then raise; end if;
  end;
  begin
    insert into public.messages (conversation_id, sender_id, content_ciphertext) values (group1, profile1, sealed);
    raise exception 'ciphertext into a group conversation should have been rejected';
  exception when others then
    if sqlerrm not like 'group conversations are not encrypted%' then raise; end if;
  end;

  -- 봉투가 "이 대화의, 나 아닌 참여자 전원"을 정확히 덮어야 한다. 덜 덮으면 상대가 못 여는
  -- 메시지가 조용히 생기고, 더 덮으면 대화 밖 사람 앞으로 봉인한 셈이 된다.
  envelope := jsonb_build_array(jsonb_build_object(
    'user_id', profile2,
    'wrapped_key', encode(sealed,'base64'),
    'sender_public_key', encode(pubkey1,'base64'),
    'recipient_public_key', encode(pubkey2,'base64')
  ));
  begin
    perform public.send_encrypted_message(room1, encode(sealed,'base64'), '[]'::jsonb);
    raise exception 'a message sealed to nobody should have been rejected';
  exception when others then
    if sqlerrm not like 'message keys must cover exactly%' then raise; end if;
  end;
  begin
    perform public.send_encrypted_message(room1, encode(sealed,'base64'), jsonb_set(envelope, '{0,user_id}', to_jsonb(profile3)));
    raise exception 'a message sealed to a non-member should have been rejected';
  exception when others then
    if sqlerrm not like 'message keys must cover exactly%' then raise; end if;
  end;

  secret1 := public.send_encrypted_message(room1, encode(sealed,'base64'), envelope);
  if not exists (
    select 1 from public.messages where id = secret1 and content is null and content_ciphertext = sealed
  ) then
    raise exception 'encrypted send failed';
  end if;

  -- 봉투는 수신자 앞으로 한 행뿐이다. 발신자 사본은 없다 -- DH가 대칭이라 발신자가 그 행을
  -- 그대로 연다. 그래서 get_chat_messages는 발신자에게도 그 행을 내줘야 한다. 안 그러면
  -- 자기가 보낸 메시지를 자기가 못 읽는다.
  if (select count(*) from public.message_keys where message_id = secret1) <> 1 then
    raise exception 'a direct message must carry exactly one envelope';
  end if;
  if not exists (
    select 1 from public.get_chat_messages(room1)
    where message_id = secret1
      and content is null
      and content_ciphertext = encode(sealed,'base64')
      and message_key ->> 'recipient_public_key' = encode(pubkey2,'base64')
  ) then
    raise exception 'the sender must be handed the envelope of their own message';
  end if;
  perform set_config('request.jwt.claim.sub', user2::text, true);
  if not exists (
    select 1 from public.get_chat_messages(room1)
    where message_id = secret1 and message_key ->> 'wrapped_key' = encode(sealed,'base64')
  ) then
    raise exception 'the recipient must be handed their envelope';
  end if;

  -- 대화 목록의 미리보기도 서버가 만들 수 없다. 암호문과 봉투를 그대로 내려보내야 한다.
  if not exists (
    select 1 from public.list_conversations()
    where conversation_id = room1
      and last_message_content is null
      and last_message_content_ciphertext = encode(sealed,'base64')
      and last_message_key is not null
  ) then
    raise exception 'the conversation list preview must ship ciphertext, not a summary';
  end if;

  -- 편집. 같은 메시지 키를 다시 쓰므로 봉투를 받지 않으며(첨부가 그 키로 봉인돼 있다),
  -- edited_at은 트리거가 찍는다.
  perform set_config('request.jwt.claim.sub', user1::text, true);
  perform public.edit_encrypted_message(secret1, encode(resealed,'base64'));
  if not exists (
    select 1 from public.messages
    where id = secret1 and content_ciphertext = resealed and edited_at is not null
  ) then
    raise exception 'encrypted edit must replace the ciphertext and stamp edited_at';
  end if;
  if (select count(*) from public.message_keys where message_id = secret1) <> 1
    or not exists (select 1 from public.message_keys where message_id = secret1 and wrapped_key = sealed)
  then
    raise exception 'encrypted edit must not touch the envelope';
  end if;

  -- 발신자가 아니면 편집할 수 없다.
  perform set_config('request.jwt.claim.sub', user2::text, true);
  begin
    perform public.edit_encrypted_message(secret1, encode(sealed,'base64'));
    raise exception 'a non-sender edit should have been rejected';
  exception when others then
    if sqlerrm <> 'message sender required' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', user1::text, true);

  -- 15분이 지나면 발신자도 편집할 수 없다.
  update public.messages set created_at = now() - interval '16 minutes' where id = secret1;
  begin
    perform public.edit_encrypted_message(secret1, encode(sealed,'base64'));
    raise exception 'an edit outside the window should have been rejected';
  exception when others then
    if sqlerrm <> 'not allowed to edit this message' then raise; end if;
  end;
  update public.messages set created_at = now() where id = secret1;

  -- 상대가 키를 갈아엎은 뒤 옛 공개키로 봉인해 보내면 아무도 못 여는 메시지가 영구히 남는다.
  -- 서버가 알아채고 거절해야 클라이언트가 키를 다시 읽고 재시도한다.
  perform public.rotate_user_keys(encode(pubkey_new,'base64'), encode(sealed,'base64'), encode(sealed,'base64'));
  perform set_config('request.jwt.claim.sub', user1::text, true);
  begin
    perform public.send_encrypted_message(room1, encode(sealed,'base64'), envelope);
    raise exception 'a message sealed to a retired identity key should have been rejected';
  exception when others then
    if sqlerrm not like 'message keys are stale%' then raise; end if;
  end;

  -- 서버는 암호문을 열 수 없으니 1:1을 검색해 줄 방법이 없다. 조용히 0건을 주면 "검색이
  -- 안 되네"가 아니라 "그런 메시지 없네"로 읽히므로, 명시적으로 거절한다.
  begin
    perform public.search_messages('무엇이든', room1);
    raise exception 'server-side search of a direct conversation should have been rejected';
  exception when others then
    if sqlerrm not like 'direct conversations are end-to-end encrypted%' then raise; end if;
  end;

  -- 대신 클라이언트가 통째로 받아 스스로 푼다. 그 대량 읽기가 이것이고, 복호화에 필요한
  -- 최소한(암호문 + 봉투)만 준다. 본문은 위에서 편집돼 resealed다.
  if not exists (
    select 1 from public.get_encrypted_message_bodies(room1)
    where message_id = secret1
      and content_ciphertext = encode(resealed,'base64')
      and message_key ->> 'wrapped_key' = encode(sealed,'base64')
  ) then
    raise exception 'the bulk read for client-side search must hand over the ciphertext and its envelope';
  end if;
  -- 두 검색 경로는 서로의 반대편이다: 한쪽이 받는 대화를 다른 쪽은 거절해야 한다.
  begin
    perform public.get_encrypted_message_bodies(group1);
    raise exception 'the encrypted bulk read should have rejected a group conversation';
  exception when others then
    if sqlerrm not like 'conversation is not end-to-end encrypted%' then raise; end if;
  end;

  -- 비멤버는 그룹이든 1:1이든 **같은** 예외를 받아야 한다. 멤버십 검사가 종류 판정보다
  -- 뒤에 오면, 비멤버가 예외/빈결과의 차이로 임의의 id가 DM인지를 스캔할 수 있다.
  perform set_config('request.jwt.claim.sub', user3::text, true);
  begin
    perform public.search_messages('무엇이든', room1);
    raise exception 'a non-member must not learn that a conversation is a DM';
  exception when others then
    if sqlerrm <> 'conversation membership required' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', user1::text, true);

  -- 본문이 사라진 메시지의 봉투는 아무것도 열지 않는다. 남겨두면 삭제된 메시지에 대해
  -- "누가 누구에게 봉인했는가"만 영원히 남는다.
  perform public.soft_delete_message(secret1);
  if exists (select 1 from public.message_keys where message_id = secret1)
    or exists (select 1 from public.messages where id = secret1 and content_ciphertext is not null)
  then
    raise exception 'soft delete must burn the envelope with the ciphertext';
  end if;

  -- -------------------------------------------------------------------------
  -- 쓰기 grant와 죽은 RPC
  -- -------------------------------------------------------------------------

  if to_regprocedure('public.update_message(bigint,text)') is not null
    or to_regprocedure('public.mark_chat_read(bigint,bigint)') is not null
    or to_regprocedure('public.set_message_reaction(bigint,bigint)') is not null
    or to_regprocedure('public.finalize_message_attachment(bigint,text,text,text,bigint,integer,integer,integer)') is not null
  then
    raise exception 'redundant chat RPCs must not exist';
  end if;

  if not has_column_privilege('authenticated', 'public.messages', 'content', 'UPDATE')
    or not has_column_privilege('authenticated', 'public.messages', 'pinned_at', 'UPDATE')
    or not has_column_privilege('authenticated', 'public.message_reactions', 'reaction_type_id', 'UPDATE')
    or not has_column_privilege('authenticated', 'public.chat_read_states', 'last_read_message_id', 'UPDATE')
    or not has_column_privilege('authenticated', 'public.chat_notification_settings', 'muted_until', 'UPDATE')
    or not has_column_privilege('authenticated', 'public.chat_notification_settings', 'level', 'UPDATE')
    or not has_sequence_privilege('authenticated', 'public.conversations_id_seq', 'USAGE')
    or not has_sequence_privilege('authenticated', 'public.messages_id_seq', 'USAGE')
  then
    raise exception 'chat write grants missing';
  end if;
end
$$;

rollback;
