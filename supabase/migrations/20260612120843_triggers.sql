create function private.validate_comment_parent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.parent_id is not null and not exists (
    select 1
    from public.comments as parent
    where parent.id = new.parent_id
      and parent.post_id = new.post_id
      and parent.parent_id is null
      and parent.deleted_at is null
  ) then
    raise exception 'comment parent must be an active top-level comment on the same post';
  end if;
  return new;
end;
$$;

create trigger trg_validate_comment_parent
before insert or update of post_id, parent_id on public.comments
for each row execute function private.validate_comment_parent();

create function private.validate_message_parent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.parent_id is not null and not exists (
    select 1
    from public.messages as parent
    where parent.id = new.parent_id
      and parent.room_id = new.room_id
      and parent.parent_id is null
      and parent.deleted_at is null
  ) then
    raise exception 'message parent must be an active top-level message in the same room';
  end if;
  return new;
end;
$$;

create trigger trg_validate_message_parent
before insert or update of room_id, parent_id on public.messages
for each row execute function private.validate_message_parent();

create function private.validate_space_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_space_id bigint := case when tg_op='DELETE' then old.space_id else new.space_id end;
begin
  if not exists (select 1 from public.spaces where id = affected_space_id) then
    return null;
  end if;
  if (select count(*) from public.space_members where space_id = affected_space_id and role = 'owner') <> 1 then
    raise exception 'active space must have exactly one owner';
  end if;
  return null;
end;
$$;

create constraint trigger trg_validate_space_owner
after insert or update or delete on public.space_members
deferrable initially deferred
for each row execute function private.validate_space_owner();

create function private.validate_direct_chat()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_room_id bigint := case when tg_op='DELETE' then old.room_id else new.room_id end;
  pair public.direct_chat_pairs%rowtype;
begin
  if tg_op = 'DELETE' and exists (select 1 from public.chat_rooms where id = old.room_id) then
    raise exception 'direct chat pair cannot be deleted while its room exists';
  end if;
  select * into pair from public.direct_chat_pairs where room_id = affected_room_id;
  if not found then
    return null;
  end if;

  if not exists (
    select 1 from public.chat_rooms
    where id = affected_room_id and is_group = false and name is null
  ) then
    raise exception 'direct chat pair must reference a direct room';
  end if;

  if (select count(*) from public.chat_room_members where room_id = affected_room_id) <> 2
    or not exists (
      select 1 from public.chat_room_members
      where room_id = affected_room_id and user_id = pair.user1_id
    )
    or not exists (
      select 1 from public.chat_room_members
      where room_id = affected_room_id and user_id = pair.user2_id
    )
  then
    raise exception 'direct chat memberships must exactly match the pair';
  end if;
  return null;
end;
$$;

create constraint trigger trg_validate_direct_chat_pair
after insert or update or delete on public.direct_chat_pairs
deferrable initially deferred
for each row execute function private.validate_direct_chat();

create constraint trigger trg_validate_direct_chat_member
after insert or update or delete on public.chat_room_members
deferrable initially deferred
for each row execute function private.validate_direct_chat();

create function private.validate_direct_chat_room()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.direct_chat_pairs where room_id=new.id)
    and (new.is_group or new.name is not null)
  then
    raise exception 'direct chat room must remain non-group with no name';
  end if;
  return new;
end;
$$;

create trigger trg_validate_direct_chat_room
before update of is_group,name on public.chat_rooms
for each row execute function private.validate_direct_chat_room();

create function private.validate_chat_read_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.last_read_message_id is not null and not exists (
    select 1 from public.messages
    where id = new.last_read_message_id
      and room_id = new.room_id
      and deleted_at is null
  ) then
    raise exception 'last read message must be active and in the same room';
  end if;

  if tg_op = 'UPDATE'
    and old.last_read_message_id is not null
    and (new.last_read_message_id is null or new.last_read_message_id < old.last_read_message_id)
  then
    raise exception 'last read message may only move forward';
  end if;

  new.last_read_at := now();
  return new;
end;
$$;

create trigger trg_validate_chat_read_state
before insert or update of room_id, last_read_message_id on public.chat_room_read_states
for each row execute function private.validate_chat_read_state();

create function private.handle_auth_user_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_id bigint;
begin
  select id into profile_id from public.profiles where auth_user_id = old.id for update;
  if profile_id is null then
    return old;
  end if;

  if exists (
    select 1 from public.profiles where id = profile_id and role = 'admin'
  ) or exists (
    select 1
    from public.space_members as sm
    join public.spaces as s on s.id = sm.space_id
    where sm.user_id = profile_id
      and sm.role = 'owner'
      and s.deleted_at is null
  ) then
    raise exception 'transfer owner/admin responsibilities before deleting auth user';
  end if;

  update public.profiles
  set auth_user_id = null,
      name = '탈퇴한 사용자',
      anonymous_username = null,
      role = 'user',
      student_number = null,
      class_no = null,
      cohort = null,
      gender = null,
      phone_number = null,
      avatar_url = null,
      birthday = null,
      description = null,
      status = 'withdrawn',
      dorm_room = null,
      status_updated_at = now(),
      status_updated_by = null,
      deleted_at = now()
  where id = profile_id;

  return old;
end;
$$;

create trigger on_auth_user_deleted
before delete on auth.users
for each row execute function private.handle_auth_user_deleted();

revoke execute on function private.validate_comment_parent() from public, anon, authenticated, service_role;
revoke execute on function private.validate_message_parent() from public, anon, authenticated, service_role;
revoke execute on function private.validate_space_owner() from public, anon, authenticated, service_role;
revoke execute on function private.validate_direct_chat() from public, anon, authenticated, service_role;
revoke execute on function private.validate_direct_chat_room() from public, anon, authenticated, service_role;
revoke execute on function private.validate_chat_read_state() from public, anon, authenticated, service_role;
revoke execute on function private.handle_auth_user_deleted() from public, anon, authenticated, service_role;
