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
  queue1 bigint;
  -- 진짜 X25519 점이 아니어도 된다. 스키마가 보는 것은 길이뿐이고, 실제 암복호 왕복은
  -- app/lib/crypto의 단위 테스트와 e2ee 통합 테스트가 증명한다.
  pubkey1 bytea := decode(repeat('a1', 32), 'hex');
  pubkey2 bytea := decode(repeat('b2', 32), 'hex');
  pubkey_new bytea := decode(repeat('c3', 32), 'hex');
  sealed bytea := decode(repeat('dd', 60), 'hex');
  envelope jsonb;
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values
    (user1, 'schema-check-1@example.com', '{"name":"Schema Check 1"}'::jsonb),
    (user2, 'schema-check-2@example.com', '{"name":"Schema Check 2"}'::jsonb),
    (user3, 'schema-check-3@example.com', '{"name":"Schema Check 3"}'::jsonb);

  select id into profile1 from public.profiles where auth_user_id = user1;
  select id into profile2 from public.profiles where auth_user_id = user2;
  select id into profile3 from public.profiles where auth_user_id = user3;

  if profile1 is null or profile2 is null or profile3 is null then
    raise exception 'auth user profile trigger failed';
  end if;

  update public.profiles
  set type = 'teacher',
      track = 'domestic',
      status = case when id = profile3 then 'pending'::public.profile_status else 'accepted'::public.profile_status end
  where id in (profile1, profile2, profile3);

  perform set_config('request.jwt.claim.sub', user1::text, true);
  if private.require_current_profile(true) <> profile1 then
    raise exception 'auth context lookup failed';
  end if;

  room1 := public.create_direct_conversation(profile2);
  room2 := public.create_direct_conversation(profile2);

  if room1 <> room2
    or (select count(*) from public.direct_conversations where user1_id = least(profile1, profile2) and user2_id = greatest(profile1, profile2)) <> 1
  then
    raise exception 'direct conversation uniqueness contract failed';
  end if;

  -- 평문 계약은 이제 그룹 대화의 것이다. 1:1은 종단간 암호화되어 있어 content를 아예
  -- 받지 않는다 -- 그건 아래 E2EE 절에서 따로 확인한다.
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

  -- messages_pin_update lets any conversation member (not just the sender)
  -- toggle pinned_at. profile2 did not send message1.
  perform set_config('request.jwt.claim.sub', user2::text, true);
  update public.messages set pinned_at = now() where id = message1;
  if not exists (
    select 1 from public.messages where id = message1 and pinned_at is not null and pinned_by = profile2
  ) then
    raise exception 'message pin contract failed';
  end if;

  update public.messages set pinned_at = null where id = message1;
  if exists (
    select 1 from public.messages where id = message1 and (pinned_at is not null or pinned_by is not null)
  ) then
    raise exception 'message unpin contract failed';
  end if;

  -- messages_pin_update's broader row visibility must not let a non-sender
  -- sneak a content edit through; private.mark_message_edited() must block it.
  begin
    update public.messages set content = 'unauthorized edit' where id = message1;
    raise exception 'non-sender message content edit should have been rejected';
  exception
    when others then
      if sqlerrm <> 'not allowed to edit this message' then
        raise;
      end if;
  end;

  perform set_config('request.jwt.claim.sub', user1::text, true);

  -- 삭제는 편집이 아니다. mark_message_edited()가 둘을 구분하지 못하면, 본문을 비우는
  -- soft delete가 15분 편집 창에 걸려 "오래된 자기 메시지를 지울 수 없는" 상태가 된다.
  update public.messages set created_at = now() - interval '16 minutes' where id = message1;
  perform public.soft_delete_message(message1);
  if not exists (select 1 from public.messages where id = message1 and deleted_at is not null and content is null) then
    raise exception 'soft delete outside the edit window failed';
  end if;

  -- ---------------------------------------------------------------------
  -- 종단간 암호화 (docs/e2ee.md)
  -- ---------------------------------------------------------------------

  perform public.create_user_keys(encode(pubkey1,'base64'), encode(sealed,'base64'), encode(sealed,'base64'), encode(sealed,'base64'));
  perform set_config('request.jwt.claim.sub', user2::text, true);
  perform public.create_user_keys(encode(pubkey2,'base64'), encode(sealed,'base64'), encode(sealed,'base64'), encode(sealed,'base64'));
  perform set_config('request.jwt.claim.sub', user1::text, true);

  -- 열쇠고리를 덮어쓰면 그 사람의 DM 히스토리가 통째로 죽는다. 비밀번호가 틀려 금고가
  -- 안 열리는 클라이언트가 "그럼 새로 만들지" 하는 것을 막는 것이 이 실패다.
  begin
    perform public.create_user_keys(encode(pubkey1,'base64'), encode(sealed,'base64'), encode(sealed,'base64'), encode(sealed,'base64'));
    raise exception 'a second key vault should have been rejected';
  exception when others then
    if sqlerrm <> 'key vault already exists' then raise; end if;
  end;

  -- 봉인된 blob은 select grant에서 회수돼 있다. 열려 있으면 같은 학교 아무나 반 친구들의
  -- wrapped_user_key를 긁어다 -- 그건 *비밀번호에서 유도된* 키로 봉인돼 있다 -- 약한
  -- 비밀번호를 오프라인에서 때릴 수 있다. 공개키만 나간다.
  if not has_column_privilege('authenticated', 'public.user_keys', 'identity_public_key', 'SELECT')
    or has_column_privilege('authenticated', 'public.user_keys', 'wrapped_user_key', 'SELECT')
    or has_column_privilege('authenticated', 'public.user_keys', 'wrapped_identity_secret_key', 'SELECT')
    or has_column_privilege('authenticated', 'public.user_keys', 'recovery_wrapped_user_key', 'SELECT')
  then
    raise exception 'user_keys must expose only the identity public key';
  end if;

  -- 봉인된 blob이 나가는 유일한 문. 나머지 셋은 쓰기 문이고, 테이블에는 클라이언트 쓰기
  -- grant가 아예 없다.
  if not has_function_privilege('authenticated', 'public.get_my_key_vault()', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.send_encrypted_message(bigint,text,jsonb,bigint,jsonb)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.edit_encrypted_message(bigint,text)', 'EXECUTE')
    -- security invoker인 search_messages가 호출자 권한으로 부른다. 없으면 그룹 검색까지 죽는다.
    or not has_function_privilege('authenticated', 'private.is_direct_conversation(bigint)', 'EXECUTE')
    or has_column_privilege('authenticated', 'public.messages', 'content_ciphertext', 'INSERT')
    or has_column_privilege('authenticated', 'public.messages', 'content_ciphertext', 'UPDATE')
  then
    raise exception 'e2ee write path must be RPC-only';
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

  -- 봉투가 "나 아닌 참여자 전원"을 정확히 덮어야 한다. 덜 덮으면 상대가 못 읽는 메시지가
  -- 조용히 생기고, 더 덮으면 대화 밖 사람 앞으로 봉인한 셈이 된다.
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
    select 1 from public.messages
    where id = secret1 and content is null and content_ciphertext = sealed
  ) then
    raise exception 'encrypted send failed';
  end if;

  -- 봉투는 수신자 앞으로 한 행뿐이다. 발신자 사본은 없다 -- DH가 대칭이라 발신자는 그 행을
  -- 그대로 연다. get_chat_messages가 발신자에게도 그 행을 내줘야 자기가 보낸 메시지를
  -- 다시 읽을 수 있다.
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

  -- 상대가 키를 갈아엎은 뒤 옛 공개키로 봉인해 보내면, 아무도 못 여는 메시지가 영구히
  -- 남는다. 서버가 그걸 알아채고 거절해야 클라이언트가 키를 다시 읽고 재시도한다.
  perform public.rotate_user_keys(encode(pubkey_new,'base64'), encode(sealed,'base64'), encode(sealed,'base64'), encode(sealed,'base64'));
  perform set_config('request.jwt.claim.sub', user1::text, true);
  begin
    perform public.send_encrypted_message(room1, encode(sealed,'base64'), envelope);
    raise exception 'a message sealed to a retired identity key should have been rejected';
  exception when others then
    if sqlerrm not like 'message keys are stale%' then raise; end if;
  end;

  -- 서버는 암호문을 열 수 없으니 1:1을 검색할 방법이 없다. 조용히 0건을 주면 "검색이
  -- 안 되네"가 아니라 "그런 메시지 없네"로 읽히므로, 명시적으로 거절한다.
  begin
    perform public.search_messages('무엇이든', room1);
    raise exception 'server-side search of a direct conversation should have been rejected';
  exception when others then
    if sqlerrm not like 'direct conversations are end-to-end encrypted%' then raise; end if;
  end;

  -- 본문이 사라진 메시지의 봉투는 아무것도 열지 않는다.
  perform public.soft_delete_message(secret1);
  if exists (select 1 from public.message_keys where message_id = secret1)
    or exists (select 1 from public.messages where id = secret1 and content_ciphertext is not null)
  then
    raise exception 'soft delete must burn the envelope with the ciphertext';
  end if;

  perform public.bootstrap_first_app_admin(profile1);

  insert into private.attachment_cleanup_queue (storage_bucket, storage_path)
  values ('avatars', user1::text || '/55555555-5555-4555-8555-555555555555')
  returning id into queue1;
  if not exists (select 1 from public.claim_storage_cleanup(1) where id = queue1) then
    raise exception 'storage cleanup claim failed';
  end if;
  perform public.fail_storage_cleanup(queue1, 'runtime check');
  if not exists (
    select 1 from private.attachment_cleanup_queue
    where id = queue1 and attempts = 1 and last_error = 'runtime check' and processed_at is null
  ) then
    raise exception 'storage cleanup retry failed';
  end if;
  perform public.complete_storage_cleanup(queue1);
  if not exists (select 1 from private.attachment_cleanup_queue where id = queue1 and processed_at is not null) then
    raise exception 'storage cleanup completion failed';
  end if;

  perform public.enqueue_due_storage_cleanup();

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

  -- An insert/update policy open to authenticated, on a table authenticated may
  -- not write a single column of, is a policy that can never fire. That is what a
  -- lost column grant looks like: `supabase db diff` emits table-level grants only
  -- and drops the column-level ones written in the declarative schema.
  if exists (
    select 1
    from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and pol.polcmd in ('a', 'w')
      and (pol.polroles = '{0}'::oid[] or 'authenticated'::regrole = any (pol.polroles))
      and not has_any_column_privilege(
            'authenticated',
            c.oid,
            case pol.polcmd when 'a' then 'INSERT' else 'UPDATE' end
          )
  ) then
    raise exception 'an insert/update policy for authenticated has no matching column grant';
  end if;

  -- The other direction: a table-wide write grant hands authenticated every
  -- column, including ones added later. Client writes are always column-scoped.
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and (
        has_table_privilege('authenticated', c.oid, 'INSERT')
        or has_table_privilege('authenticated', c.oid, 'UPDATE')
      )
  ) then
    raise exception 'authenticated holds a table-wide insert/update grant; scope it to columns';
  end if;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and has_function_privilege('anon', p.oid, 'EXECUTE')
  ) then
    raise exception 'anon must not execute public application functions';
  end if;

  -- 00-foundation revokes the default privileges *for role postgres*, so an
  -- object created by any other role -- supabase_admin, whose defaults still hand
  -- anon arwdDxtm -- would be born readable by anon, and no schema file would say
  -- so. Nothing in public is ever anon's.
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p', 'v', 'm', 'f')
      and (
        has_any_column_privilege('anon', c.oid, 'SELECT')
        or has_any_column_privilege('anon', c.oid, 'INSERT')
        or has_any_column_privilege('anon', c.oid, 'UPDATE')
        or has_any_column_privilege('anon', c.oid, 'REFERENCES')
        or has_table_privilege('anon', c.oid, 'DELETE')
        or has_table_privilege('anon', c.oid, 'TRUNCATE')
        or has_table_privilege('anon', c.oid, 'TRIGGER')
      )
  ) then
    raise exception 'anon must not hold privileges on public tables';
  end if;

  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'S'
      and (
        has_sequence_privilege('anon', c.oid, 'USAGE')
        or has_sequence_privilege('anon', c.oid, 'SELECT')
        or has_sequence_privilege('anon', c.oid, 'UPDATE')
      )
  ) then
    raise exception 'anon must not hold privileges on public sequences';
  end if;

  -- A public function nobody may execute is dead, and almost always means a
  -- grant was lost. `supabase db diff` does not track execute privileges, and
  -- renaming a function's parameter forces it to drop and recreate the function,
  -- which silently discards the grant. Default privileges then leave it callable
  -- by no one.
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
      and not has_function_privilege('service_role', p.oid, 'EXECUTE')
  ) then
    raise exception 'a public function is executable by no role: a grant was probably lost';
  end if;

  if (
    select count(*)
    from storage.buckets
    where id in ('post-files', 'message-files')
      and allowed_mime_types @> array[
        'text/markdown',
        'text/csv',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.hancom.hwpx'
      ]::text[]
  ) <> 2 then
    raise exception 'document attachment MIME allowlist contract failed';
  end if;

  -- public.message_attachment_mime_types is the single source for what may be
  -- attached to a message. The bucket's own allowlist is generated from it, so
  -- the two drifting apart is the failure this catches.
  if (
    select b.allowed_mime_types
    from storage.buckets b
    where b.id = 'message-files'
  ) is distinct from (
    select array_agg(content_type order by content_type)
    from public.message_attachment_mime_types
  ) then
    raise exception 'message-files bucket allowlist has drifted from message_attachment_mime_types';
  end if;

  if (
    select b.file_size_limit
    from storage.buckets b
    where b.id = 'message-files'
  ) is distinct from (select max(max_bytes) from public.message_attachment_mime_types) then
    raise exception 'message-files bucket file_size_limit has drifted from message_attachment_mime_types';
  end if;

  -- 암호화된 첨부는 storage 입장에서 전부 octet-stream이다. message-files에 그걸 허용하면
  -- 위의 화이트리스트 계약이 -- image/svg+xml 차단을 포함해 -- 통째로 무의미해진다. 그래서
  -- 버킷을 갈랐고, 두 버킷의 allowlist가 서로 섞이지 않는 것이 그 분리의 전부다.
  if (
    select b.allowed_mime_types
    from storage.buckets b
    where b.id = 'message-files-encrypted'
  ) is distinct from array['application/octet-stream']::text[] then
    raise exception 'the encrypted attachment bucket must accept opaque bytes and nothing else';
  end if;
  if exists (
    select 1 from storage.buckets
    where id = 'message-files' and 'application/octet-stream' = any (allowed_mime_types)
  ) then
    raise exception 'message-files must not accept opaque bytes: that is what the encrypted bucket is for';
  end if;
  -- 암호문은 평문보다 nonce(12) + GCM 태그(16)만큼 크다. 상한이 그걸 감당하지 못하면
  -- 최대 크기 파일이 storage에서 거부된다.
  if (
    select b.file_size_limit
    from storage.buckets b
    where b.id = 'message-files-encrypted'
  ) < (select max(max_bytes) + 28 from public.message_attachment_mime_types) then
    raise exception 'the encrypted bucket must have room for the AEAD overhead';
  end if;

  -- Messages accept media, and SVG stays rejected. `kind` is universal and lives
  -- in public.mime_types; what a message accepts, and how large, is per-surface.
  if not exists (
      select 1 from public.message_attachment_mime_types allowed
      join public.mime_types mime on mime.content_type = allowed.content_type
      where mime.kind = 'audio'
    )
    or not exists (
      select 1 from public.message_attachment_mime_types allowed
      join public.mime_types mime on mime.content_type = allowed.content_type
      where mime.kind = 'video'
    )
    or exists (select 1 from public.message_attachment_mime_types where content_type = 'image/svg+xml')
  then
    raise exception 'message attachment MIME registry contract failed';
  end if;

  -- Every accepted type is classified. The foreign key guarantees it; this is
  -- here so a future surface that forgets the classification table fails loudly.
  if exists (
    select 1 from public.message_attachment_mime_types allowed
    where not exists (select 1 from public.mime_types mime where mime.content_type = allowed.content_type)
  ) then
    raise exception 'message attachment MIME registry has unclassified types';
  end if;

  if has_function_privilege('authenticated', 'public.enqueue_due_storage_cleanup()', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.enqueue_due_storage_cleanup()', 'EXECUTE')
    or has_table_privilege('authenticated', 'private.attachment_cleanup_queue', 'SELECT')
    or not has_table_privilege('service_role', 'private.attachment_cleanup_queue', 'SELECT')
  then
    raise exception 'service role grant contract failed';
  end if;

  -- 'open' was removed (every space requires membership); 'request' adds an
  -- approval-gated join alongside public and invite_only.
  if (
    select array_agg(e.enumlabel::text order by e.enumsortorder)
    from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'space_join_policy'
  ) <> array['public', 'request', 'invite_only'] then
    raise exception 'space join policy enum contract failed';
  end if;

  if not has_column_privilege('authenticated', 'public.space_members', 'pinned_at', 'UPDATE')
    or to_regprocedure('public.join_space(bigint)') is null
    or to_regprocedure('public.accept_space_invite(text)') is null
    or to_regprocedure('public.create_space_invite(bigint,bigint,timestamp with time zone)') is null
    or to_regprocedure('public.approve_join_request(bigint,bigint)') is null
    or not has_function_privilege('authenticated', 'public.join_space(bigint)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.approve_join_request(bigint,bigint)', 'EXECUTE')
  then
    raise exception 'space membership contract failed';
  end if;
end
$$;

rollback;
