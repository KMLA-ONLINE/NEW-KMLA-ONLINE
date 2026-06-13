begin;

do $$
declare
  user1 uuid := '11111111-1111-4111-8111-111111111111';
  user2 uuid := '22222222-2222-4222-8222-222222222222';
  user3 uuid := '33333333-3333-4333-8333-333333333333';
  profile1 bigint;
  profile2 bigint;
  profile3 bigint;
  space1 bigint;
  post1 bigint;
  post2 bigint;
  comment1 bigint;
  room1 bigint;
  room2 bigint;
  message1 bigint;
  queue1 bigint;
  cleanup_count bigint;
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
      status = case when id = profile3 then 'pending'::public.profile_status else 'accepted'::public.profile_status end
  where id in (profile1, profile2, profile3);

  perform set_config('request.jwt.claim.sub', user1::text, true);
  if private.require_current_profile(true) <> profile1 then
    raise exception 'auth context lookup failed';
  end if;

  room1 := public.create_direct_chat(profile2);
  room2 := public.create_direct_chat(profile2);
  if room1 <> room2
    or (select count(*) from public.direct_chat_pairs where room_id = room1) <> 1
    or (select count(*) from public.chat_room_members where room_id = room1) <> 2
  then
    raise exception 'direct chat reuse contract failed';
  end if;
  insert into public.messages (room_id, sender_id, content)
  values (room1, profile1, '검색 테스트 메시지')
  returning id into message1;
  if not exists (select 1 from public.search_messages('검색테스트', room1) where message_id = message1) then
    raise exception 'space-insensitive message search failed';
  end if;

  begin
    update public.direct_chat_pairs set user1_id = profile2 where room_id = room1;
    raise exception 'direct chat pair update was not blocked';
  exception when others then
    if sqlerrm = 'direct chat pair update was not blocked' then raise; end if;
  end;

  begin
    delete from public.direct_chat_pairs where room_id = room1;
    set constraints trg_validate_direct_chat_pair immediate;
    raise exception 'direct chat pair delete was not blocked';
  exception when others then
    if sqlerrm = 'direct chat pair delete was not blocked' then raise; end if;
  end;

  begin
    update public.chat_rooms set is_group = true where id = room1;
    raise exception 'direct room mutation was not blocked';
  exception when others then
    if sqlerrm = 'direct room mutation was not blocked' then raise; end if;
  end;

  space1 := public.create_space('community', 'Schema runtime check', null, 'auto_join');
  insert into public.posts (space_id, space_type, author_id, title, content)
  values (space1, 'community', profile1, '띄어 쓰기 검색', 'body')
  returning id into post1;
  insert into public.comments (post_id, author_id, content)
  values (post1, profile2, 'child')
  returning id into comment1;
  if not exists (select 1 from public.search_posts('띄어쓰기', 'community', space1) where post_id = post1) then
    raise exception 'space-insensitive post search failed';
  end if;

  perform public.purge_deleted_content('post', post1);
  if not exists (select 1 from public.posts where id = post1)
    or not exists (select 1 from public.comments where id = comment1)
  then
    raise exception 'active purge modified content';
  end if;

  perform set_config('request.jwt.claim.sub', user2::text, true);
  begin
    perform public.soft_delete_post(post1);
    raise exception 'unauthorized post deletion was not blocked';
  exception when others then
    if sqlerrm = 'unauthorized post deletion was not blocked' then raise; end if;
  end;
  if exists (select 1 from public.posts where id = post1 and deleted_at is not null) then
    raise exception 'unauthorized post deletion changed target';
  end if;

  perform set_config('request.jwt.claim.sub', user1::text, true);
  perform public.soft_delete_post(post1);
  perform public.purge_deleted_content('post', post1);
  if exists (select 1 from public.posts where id = post1)
    or exists (select 1 from public.comments where id = comment1)
  then
    raise exception 'deleted post purge failed';
  end if;

  insert into public.posts (space_id, space_type, author_id, title, content, deleted_at, deleted_by)
  values (space1, 'community', profile1, 'scheduled purge', 'body', now() - interval '8 days', profile1)
  returning id into post2;
  cleanup_count := public.cleanup_deleted_content();
  if cleanup_count <> 1 or exists (select 1 from public.posts where id = post2) then
    raise exception 'scheduled deleted post cleanup failed: count=%, exists=%',
      cleanup_count,
      exists (select 1 from public.posts where id = post2);
  end if;

  perform public.bootstrap_first_app_admin(profile1);
  begin
    perform public.change_app_role(profile3, 'admin');
    raise exception 'pending profile admin promotion was not blocked';
  exception when others then
    if sqlerrm = 'pending profile admin promotion was not blocked' then raise; end if;
  end;

  perform public.record_upload_authorization(profile1, 'avatars', user1::text || '/44444444-4444-4444-8444-444444444444', 1024);
  if not exists (
    select 1 from private.upload_authorization_events
    where profile_id = profile1 and storage_bucket = 'avatars' and size_bytes = 1024
  ) then
    raise exception 'upload authorization record failed';
  end if;

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
  perform public.reconcile_cached_counts();

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

  if has_function_privilege('authenticated', 'public.cleanup_deleted_content()', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.cleanup_deleted_content()', 'EXECUTE')
    or has_table_privilege('authenticated', 'private.attachment_cleanup_queue', 'SELECT')
    or not has_table_privilege('service_role', 'private.attachment_cleanup_queue', 'SELECT')
  then
    raise exception 'service role grant contract failed';
  end if;
end
$$;

rollback;
