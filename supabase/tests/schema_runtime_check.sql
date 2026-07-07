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
  message1 bigint;
  queue1 bigint;
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

  insert into public.direct_chats (user1_id, user2_id)
  values (least(profile1, profile2), greatest(profile1, profile2))
  on conflict (user1_id, user2_id) do update set user1_id = excluded.user1_id
  returning id into room1;

  insert into public.direct_chats (user1_id, user2_id)
  values (least(profile1, profile2), greatest(profile1, profile2))
  on conflict (user1_id, user2_id) do update set user1_id = excluded.user1_id
  returning id into room2;

  if room1 <> room2
    or (select count(*) from public.direct_chats where user1_id = least(profile1, profile2) and user2_id = greatest(profile1, profile2)) <> 1
  then
    raise exception 'direct chat uniqueness contract failed';
  end if;
  insert into public.messages (direct_chat_id, sender_id, content)
  values (room1, profile1, '검색 테스트 메시지')
  returning id into message1;
  if not exists (select 1 from public.chat_read_states where direct_chat_id = room1 and user_id = profile1 and last_read_message_id = message1) then
    raise exception 'sender read state trigger failed';
  end if;
  if not exists (select 1 from public.search_messages('검색테스트', room1, null) where message_id = message1) then
    raise exception 'space-insensitive message search failed';
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
    or not has_column_privilege('authenticated', 'public.message_reactions', 'reaction_type_id', 'UPDATE')
    or not has_column_privilege('authenticated', 'public.chat_read_states', 'last_read_message_id', 'UPDATE')
    or not has_sequence_privilege('authenticated', 'public.message_reactions_id_seq', 'USAGE')
    or not has_sequence_privilege('authenticated', 'public.direct_chats_id_seq', 'USAGE')
    or not has_sequence_privilege('authenticated', 'public.chat_read_states_id_seq', 'USAGE')
  then
    raise exception 'direct chat write grants missing';
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

  if has_function_privilege('authenticated', 'public.enqueue_due_storage_cleanup()', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.enqueue_due_storage_cleanup()', 'EXECUTE')
    or has_table_privilege('authenticated', 'private.attachment_cleanup_queue', 'SELECT')
    or not has_table_privilege('service_role', 'private.attachment_cleanup_queue', 'SELECT')
  then
    raise exception 'service role grant contract failed';
  end if;
end
$$;

rollback;
