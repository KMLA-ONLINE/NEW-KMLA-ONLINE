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

  room1 := public.create_direct_conversation(profile2);
  room2 := public.create_direct_conversation(profile2);

  if room1 <> room2
    or (select count(*) from public.direct_conversations where user1_id = least(profile1, profile2) and user2_id = greatest(profile1, profile2)) <> 1
  then
    raise exception 'direct conversation uniqueness contract failed';
  end if;
  insert into public.messages (conversation_id, sender_id, content)
  values (room1, profile1, '검색 테스트 메시지')
  returning id into message1;
  if not exists (select 1 from public.chat_read_states where conversation_id = room1 and user_id = profile1 and last_read_message_id = message1) then
    raise exception 'sender read state trigger failed';
  end if;
  if not exists (select 1 from public.search_messages('검색테스트', room1) where message_id = message1) then
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

  -- 'open' was removed: every space now requires membership to participate. A
  -- future 'request' (approval-required join) will extend this array.
  if (
    select array_agg(e.enumlabel::text order by e.enumsortorder)
    from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'space_join_policy'
  ) <> array['public', 'invite_only'] then
    raise exception 'space join policy enum contract failed';
  end if;

  if not has_column_privilege('authenticated', 'public.space_members', 'pinned_at', 'UPDATE')
    or to_regprocedure('public.join_space(bigint)') is null
    or to_regprocedure('public.accept_space_invite(text)') is null
    or to_regprocedure('public.create_space_invite(bigint,bigint,timestamp with time zone)') is null
    or not has_function_privilege('authenticated', 'public.join_space(bigint)', 'EXECUTE')
  then
    raise exception 'space membership contract failed';
  end if;
end
$$;

rollback;
