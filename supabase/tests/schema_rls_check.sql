begin;

do $$
declare
  user1 uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  user2 uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  profile1 bigint;
  profile2 bigint;
  space1 bigint;
  room1 bigint;
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values
    (user1, 'rls-check-1@example.com', '{"name":"RLS Check 1"}'::jsonb),
    (user2, 'rls-check-2@example.com', '{"name":"RLS Check 2"}'::jsonb);

  select id into profile1 from public.profiles where auth_user_id = user1;
  select id into profile2 from public.profiles where auth_user_id = user2;
  update public.profiles set type = 'teacher', status = 'accepted' where id in (profile1, profile2);

  insert into public.spaces (type, name, join_policy, created_by)
  values ('community', 'RLS runtime check', 'invite_only', profile1)
  returning id into space1;
  insert into public.space_members (space_id, user_id, role)
  values (space1, profile1, 'owner');

  insert into public.chat_rooms (name, is_group, created_by)
  values ('RLS runtime check', true, profile1)
  returning id into room1;
  insert into public.chat_room_members (room_id, user_id)
  values (room1, profile1), (room1, profile2);

  perform set_config('schema_check.profile1', profile1::text, false);
  perform set_config('schema_check.profile2', profile2::text, false);
  perform set_config('schema_check.space1', space1::text, false);
  perform set_config('schema_check.room1', room1::text, false);
end
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);

do $$
declare
  profile1 bigint := current_setting('schema_check.profile1')::bigint;
  profile2 bigint := current_setting('schema_check.profile2')::bigint;
  space1 bigint := current_setting('schema_check.space1')::bigint;
  room1 bigint := current_setting('schema_check.room1')::bigint;
  post1 bigint;
  message1 bigint;
begin
  begin
    insert into public.posts (space_id, author_id, title, content)
    values (space1, profile2, 'malicious author', 'body');
    raise exception 'author_id injection was not blocked';
  exception when insufficient_privilege then
    null;
  end;

  insert into public.posts (space_id, title, content, is_anonymous)
  values (space1, 'own post', 'body', false)
  returning id into post1;
  if not exists (select 1 from public.posts where id = post1 and author_id = profile1) then
    raise exception 'post identity stamping failed';
  end if;

  begin
    insert into public.messages (room_id, sender_id, content)
    values (room1, profile2, 'malicious sender');
    raise exception 'sender_id injection was not blocked';
  exception when insufficient_privilege then
    null;
  end;

  insert into public.messages (room_id, content)
  values (room1, 'own message')
  returning id into message1;
  if not exists (select 1 from public.messages where id = message1 and sender_id = profile1) then
    raise exception 'message identity stamping failed';
  end if;

  insert into public.chat_room_read_states (room_id, last_read_message_id)
  values (room1, message1);
  if not exists (
    select 1 from public.chat_room_read_states
    where room_id = room1 and user_id = profile1 and last_read_message_id = message1
  ) then
    raise exception 'read state identity stamping failed';
  end if;
end
$$;

reset role;
delete from public.chat_room_read_states
where room_id = current_setting('schema_check.room1')::bigint
  and user_id = current_setting('schema_check.profile1')::bigint;
delete from public.message_reads
where user_id = current_setting('schema_check.profile1')::bigint;
delete from public.chat_room_members
where room_id = current_setting('schema_check.room1')::bigint
  and user_id = current_setting('schema_check.profile1')::bigint;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);

do $$
begin
  if exists (
    select 1 from public.chat_room_read_states
    where room_id = current_setting('schema_check.room1')::bigint
  ) then
    raise exception 'former member can read chat room read state';
  end if;
end
$$;

rollback;
