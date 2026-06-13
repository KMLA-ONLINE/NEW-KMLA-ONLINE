create function private.stamp_current_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_id bigint;
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  profile_id := private.current_profile_id();
  if profile_id is null then
    raise exception 'current profile not found';
  end if;

  case tg_table_name
    when 'posts' then new.author_id := profile_id;
    when 'comments' then new.author_id := profile_id;
    when 'post_reactions' then new.user_id := profile_id;
    when 'comment_reactions' then new.user_id := profile_id;
    when 'messages' then new.sender_id := profile_id;
    when 'message_reactions' then new.user_id := profile_id;
    when 'message_reads' then new.user_id := profile_id;
    when 'chat_room_read_states' then new.user_id := profile_id;
    when 'gongangs' then new.owner_id := profile_id;
    when 'song_requests' then new.requester_id := profile_id;
    when 'clubs_apply' then new.user_id := profile_id;
    else raise exception 'unsupported identity stamp table: %', tg_table_name;
  end case;

  return new;
end;
$$;

create trigger trg_stamp_post_identity before insert on public.posts
for each row execute function private.stamp_current_profile();
create trigger trg_stamp_comment_identity before insert on public.comments
for each row execute function private.stamp_current_profile();
create trigger trg_stamp_post_reaction_identity before insert on public.post_reactions
for each row execute function private.stamp_current_profile();
create trigger trg_stamp_comment_reaction_identity before insert on public.comment_reactions
for each row execute function private.stamp_current_profile();
create trigger trg_stamp_message_identity before insert on public.messages
for each row execute function private.stamp_current_profile();
create trigger trg_stamp_message_reaction_identity before insert on public.message_reactions
for each row execute function private.stamp_current_profile();
create trigger trg_stamp_message_read_identity before insert on public.message_reads
for each row execute function private.stamp_current_profile();
create trigger trg_stamp_room_read_state_identity before insert on public.chat_room_read_states
for each row execute function private.stamp_current_profile();
create trigger trg_stamp_gongang_identity before insert on public.gongangs
for each row execute function private.stamp_current_profile();
create trigger trg_stamp_song_request_identity before insert on public.song_requests
for each row execute function private.stamp_current_profile();
create trigger trg_stamp_club_apply_identity before insert on public.clubs_apply
for each row execute function private.stamp_current_profile();

create function private.sync_post_space_type()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select s.type into new.space_type
  from public.spaces as s
  where s.id = new.space_id;

  if new.space_type is null then
    raise exception 'space not found';
  end if;
  return new;
end;
$$;

create trigger trg_sync_post_space_type
before insert or update of space_id on public.posts
for each row execute function private.sync_post_space_type();

create function private.sync_notification_space_type()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.space_id is null then
    new.space_type := null;
  else
    select s.type into new.space_type
    from public.spaces as s
    where s.id = new.space_id;
    if new.space_type is null then
      raise exception 'space not found';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_sync_notification_space_type
before insert or update of space_id on public.notifications
for each row execute function private.sync_notification_space_type();

create function private.propagate_space_type()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.posts set space_type = new.type where space_id = new.id;
  update public.notifications set space_type = new.type where space_id = new.id;
  return new;
end;
$$;

create trigger trg_propagate_space_type
after update of type on public.spaces
for each row when (old.type is distinct from new.type)
execute function private.propagate_space_type();

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

create function private.prevent_membership_identity_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.space_id is distinct from new.space_id or old.user_id is distinct from new.user_id then
    raise exception 'space membership identity is immutable';
  end if;
  return new;
end;
$$;

create trigger trg_prevent_space_membership_identity_update
before update of space_id,user_id on public.space_members
for each row execute function private.prevent_membership_identity_update();

create function private.prevent_chat_membership_identity_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.room_id is distinct from new.room_id or old.user_id is distinct from new.user_id then
    raise exception 'chat membership identity is immutable';
  end if;
  return new;
end;
$$;

create trigger trg_prevent_chat_membership_identity_update
before update of room_id,user_id on public.chat_room_members
for each row execute function private.prevent_chat_membership_identity_update();

create function private.prevent_direct_chat_pair_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'direct chat pair is immutable';
end;
$$;

create trigger trg_prevent_direct_chat_pair_update
before update on public.direct_chat_pairs
for each row execute function private.prevent_direct_chat_pair_update();

create function private.update_post_comment_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('DELETE', 'UPDATE') and old.deleted_at is null then
    update public.posts set comment_count = comment_count - 1 where id = old.post_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.deleted_at is null then
    update public.posts set comment_count = comment_count + 1 where id = new.post_id;
  end if;
  return null;
end;
$$;

create trigger trg_update_post_comment_count
after insert or update of post_id, deleted_at or delete on public.comments
for each row execute function private.update_post_comment_count();

create function private.update_post_reaction_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('DELETE', 'UPDATE') then
    update public.posts set reaction_count = reaction_count - 1 where id = old.post_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    update public.posts set reaction_count = reaction_count + 1 where id = new.post_id;
  end if;
  return null;
end;
$$;

create trigger trg_update_post_reaction_count
after insert or update of post_id or delete on public.post_reactions
for each row execute function private.update_post_reaction_count();

create function private.update_space_member_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    update public.spaces set member_count = member_count - 1 where id = old.space_id;
  elsif tg_op = 'INSERT' then
    update public.spaces set member_count = member_count + 1 where id = new.space_id;
  end if;
  return null;
end;
$$;

create trigger trg_update_space_member_count
after insert or delete on public.space_members
for each row execute function private.update_space_member_count();

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

create function private.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_profiles_updated_at before update on public.profiles
for each row execute function private.set_updated_at();
create trigger trg_spaces_updated_at before update on public.spaces
for each row execute function private.set_updated_at();
create trigger trg_posts_updated_at before update on public.posts
for each row execute function private.set_updated_at();
create trigger trg_comments_updated_at before update on public.comments
for each row execute function private.set_updated_at();
create trigger trg_post_reactions_updated_at before update on public.post_reactions
for each row execute function private.set_updated_at();
create trigger trg_comment_reactions_updated_at before update on public.comment_reactions
for each row execute function private.set_updated_at();
create trigger trg_message_reactions_updated_at before update on public.message_reactions
for each row execute function private.set_updated_at();

create function private.mark_message_edited()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.content is distinct from new.content then
    new.is_edited := true;
    new.edited_at := now();
  end if;
  return new;
end;
$$;

create trigger trg_mark_message_edited
before update of content on public.messages
for each row execute function private.mark_message_edited();

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

revoke execute on function private.stamp_current_profile() from public, anon, authenticated, service_role;
revoke execute on function private.sync_post_space_type() from public, anon, authenticated, service_role;
revoke execute on function private.sync_notification_space_type() from public, anon, authenticated, service_role;
revoke execute on function private.propagate_space_type() from public, anon, authenticated, service_role;
revoke execute on function private.validate_comment_parent() from public, anon, authenticated, service_role;
revoke execute on function private.validate_message_parent() from public, anon, authenticated, service_role;
revoke execute on function private.validate_space_owner() from public, anon, authenticated, service_role;
revoke execute on function private.validate_direct_chat() from public, anon, authenticated, service_role;
revoke execute on function private.validate_direct_chat_room() from public, anon, authenticated, service_role;
revoke execute on function private.prevent_membership_identity_update() from public, anon, authenticated, service_role;
revoke execute on function private.prevent_chat_membership_identity_update() from public, anon, authenticated, service_role;
revoke execute on function private.prevent_direct_chat_pair_update() from public, anon, authenticated, service_role;
revoke execute on function private.update_post_comment_count() from public, anon, authenticated, service_role;
revoke execute on function private.update_post_reaction_count() from public, anon, authenticated, service_role;
revoke execute on function private.update_space_member_count() from public, anon, authenticated, service_role;
revoke execute on function private.validate_chat_read_state() from public, anon, authenticated, service_role;
revoke execute on function private.set_updated_at() from public, anon, authenticated, service_role;
revoke execute on function private.mark_message_edited() from public, anon, authenticated, service_role;
revoke execute on function private.handle_auth_user_deleted() from public, anon, authenticated, service_role;
