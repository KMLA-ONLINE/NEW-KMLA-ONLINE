create table public.chat_rooms (
  id bigserial primary key,
  name text null,
  is_group boolean not null default false,
  created_by bigint null references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.direct_chat_pairs (
  room_id bigint primary key references public.chat_rooms (id) on delete cascade,
  user1_id bigint not null references public.profiles (id) on delete restrict,
  user2_id bigint not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.chat_room_members (
  room_id bigint not null references public.chat_rooms (id) on delete restrict,
  user_id bigint not null references public.profiles (id) on delete restrict,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table public.messages (
  id bigserial primary key,
  room_id bigint not null references public.chat_rooms (id) on delete restrict,
  sender_id bigint not null references public.profiles (id) on delete restrict,
  parent_id bigint null references public.messages (id) on delete restrict,
  content text null,
  is_edited boolean not null default false,
  edited_at timestamptz null,
  deleted_at timestamptz null,
  deleted_by bigint null references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.message_attachments (
  id bigserial primary key,
  message_id bigint not null references public.messages (id) on delete restrict,
  storage_bucket text not null,
  storage_path text not null,
  file_name text not null,
  content_type text not null,
  size_bytes int8 null,
  sort_order int4 not null default 0,
  width int4 null,
  height int4 null,
  created_at timestamptz not null default now()
);

create table public.message_reactions (
  id bigserial primary key,
  message_id bigint not null references public.messages (id) on delete restrict,
  user_id bigint not null references public.profiles (id) on delete restrict,
  reaction_type_id bigint not null references public.reaction_types (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz null
);

create table public.chat_room_read_states (
  room_id bigint not null references public.chat_rooms (id) on delete restrict,
  user_id bigint not null references public.profiles (id) on delete restrict,
  last_read_message_id bigint null references public.messages (id) on delete restrict,
  last_read_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create index idx_direct_chat_pairs_user1_created_at on public.direct_chat_pairs (user1_id, created_at);
create index idx_direct_chat_pairs_user2_created_at on public.direct_chat_pairs (user2_id, created_at);
create index idx_chat_room_members_user_joined_at on public.chat_room_members (user_id, joined_at);
create index idx_chat_room_members_user_room on public.chat_room_members (user_id, room_id);
create index idx_messages_sender_created_at on public.messages (sender_id, created_at);
create index idx_messages_parent_created_at on public.messages (parent_id, created_at);
create index idx_messages_active_room_id on public.messages (room_id, id desc)
where deleted_at is null;
create index idx_message_reactions_type_count on public.message_reactions (message_id, reaction_type_id);
create index idx_message_reactions_user_created_at on public.message_reactions (user_id, created_at);
create index idx_chat_room_read_states_user_last_read_at on public.chat_room_read_states (user_id, last_read_at);
create index idx_messages_content_search_gin on public.messages
  using gin (regexp_replace(lower(content), '\s+', '', 'g') extensions.gin_trgm_ops)
  where deleted_at is null;

alter table public.chat_rooms
  add constraint chat_rooms_name_check check (
    (is_group = false and name is null)
    or (is_group = true and char_length(btrim(name)) between 1 and 100)
  );

alter table public.direct_chat_pairs
  add constraint direct_chat_pairs_users_check check (user1_id < user2_id),
  add constraint direct_chat_pairs_users_key unique (user1_id, user2_id);

alter table public.messages
  add constraint messages_parent_check check (parent_id is null or parent_id <> id),
  add constraint messages_content_check check (content is null or char_length(btrim(content)) between 1 and 10000),
  add constraint messages_deleted_state_check check (deleted_at is not null or deleted_by is null),
  add constraint messages_edit_state_check check (
    (is_edited = false and edited_at is null)
    or (is_edited = true and edited_at is not null)
  );

alter table public.message_attachments
  add constraint message_attachments_message_sort_key unique (message_id, sort_order),
  add constraint message_attachments_storage_key unique (storage_bucket, storage_path),
  add constraint message_attachments_bucket_check check (storage_bucket = 'message-files'),
  add constraint message_attachments_storage_path_check check (
    char_length(storage_path) between 1 and 1024
    and storage_path !~ '(^|/)\.\.?(/|$)'
  ),
  add constraint message_attachments_file_name_check check (char_length(btrim(file_name)) between 1 and 255),
  add constraint message_attachments_content_type_check check (char_length(btrim(content_type)) between 1 and 255),
  add constraint message_attachments_size_check check (size_bytes is null or size_bytes >= 0),
  add constraint message_attachments_sort_order_check check (sort_order >= 0);

alter table public.message_reactions
  add constraint message_reactions_message_user_key unique (message_id, user_id);

create function private.is_room_member(p_room_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_accepted_user() and exists(select 1 from public.chat_room_members where room_id=p_room_id and user_id=private.current_profile_id())
$$;
create function private.can_access_message(p_message_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.messages m where m.id=p_message_id and m.deleted_at is null and private.is_room_member(m.room_id))
$$;
create function private.is_valid_message_parent(p_parent_id bigint,p_room_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_parent_id is null or exists(select 1 from public.messages m where m.id=p_parent_id and m.room_id=p_room_id and m.deleted_at is null)
$$;
create function private.has_active_message_reply(p_message_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.messages where parent_id=p_message_id and deleted_at is null)
$$;
revoke execute on function private.is_room_member(bigint), private.can_access_message(bigint), private.is_valid_message_parent(bigint,bigint), private.has_active_message_reply(bigint) from public, anon, service_role;
grant execute on function private.is_room_member(bigint), private.can_access_message(bigint), private.is_valid_message_parent(bigint,bigint), private.has_active_message_reply(bigint) to authenticated;

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

create function private.mark_message_edited()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.content is not null then
    new.content := nullif(btrim(new.content), '');
  end if;
  if old.deleted_at is null and new.deleted_at is null and new.content is distinct from old.content then
    new.is_edited := true;
    new.edited_at := now();
  end if;
  return new;
end;
$$;

create trigger trg_mark_message_edited
before update of content on public.messages
for each row execute function private.mark_message_edited();

create function private.mark_message_reaction_updated()
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

create trigger trg_mark_message_reaction_updated
before update of reaction_type_id on public.message_reactions
for each row execute function private.mark_message_reaction_updated();

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

revoke execute on function private.validate_message_parent() from public, anon, authenticated, service_role;
revoke execute on function private.mark_message_edited() from public, anon, authenticated, service_role;
revoke execute on function private.validate_direct_chat() from public, anon, authenticated, service_role;
revoke execute on function private.validate_direct_chat_room() from public, anon, authenticated, service_role;
revoke execute on function private.validate_chat_read_state() from public, anon, authenticated, service_role;
revoke execute on function private.mark_message_reaction_updated() from public, anon, authenticated, service_role;

alter table public.chat_rooms enable row level security;
alter table public.direct_chat_pairs enable row level security;
alter table public.chat_room_members enable row level security;
alter table public.messages enable row level security;
alter table public.message_attachments enable row level security;
alter table public.message_reactions enable row level security;
alter table public.chat_room_read_states enable row level security;
create policy chat_rooms_select on public.chat_rooms for select to authenticated using (private.is_room_member(id));
create policy direct_chat_pairs_select on public.direct_chat_pairs for select to authenticated using (private.is_room_member(room_id));
create policy chat_room_members_select on public.chat_room_members for select to authenticated using (private.is_room_member(room_id));
create policy messages_select on public.messages for select to authenticated using ((deleted_at is null or private.has_active_message_reply(id)) and private.is_room_member(room_id));
create policy messages_update on public.messages for update to authenticated using (deleted_at is null and sender_id=private.current_profile_id() and created_at>=now()-interval '15 minutes' and private.is_room_member(room_id)) with check (deleted_at is null and sender_id=private.current_profile_id() and content is not null and created_at>=now()-interval '15 minutes' and private.is_room_member(room_id));
create policy message_attachments_select on public.message_attachments for select to authenticated using (private.can_access_message(message_id));
create policy message_reactions_select on public.message_reactions for select to authenticated using (private.can_access_message(message_id));
create policy message_reactions_insert on public.message_reactions for insert to authenticated with check (user_id=private.current_profile_id() and private.can_access_message(message_id));
create policy message_reactions_update on public.message_reactions for update to authenticated using (user_id=private.current_profile_id() and private.can_access_message(message_id)) with check (user_id=private.current_profile_id() and private.can_access_message(message_id));
create policy message_reactions_delete on public.message_reactions for delete to authenticated using (user_id=private.current_profile_id() and private.can_access_message(message_id));
create policy chat_room_read_states_select on public.chat_room_read_states for select to authenticated using (user_id=private.current_profile_id() and private.is_room_member(room_id));
create policy chat_room_read_states_insert on public.chat_room_read_states for insert to authenticated with check (user_id=private.current_profile_id() and last_read_message_id is not null and private.is_room_member(room_id));
create policy chat_room_read_states_update on public.chat_room_read_states for update to authenticated using (user_id=private.current_profile_id() and private.is_room_member(room_id)) with check (user_id=private.current_profile_id() and last_read_message_id is not null and private.is_room_member(room_id));

grant select on public.chat_rooms, public.direct_chat_pairs, public.chat_room_members, public.messages, public.message_attachments, public.message_reactions, public.chat_room_read_states to authenticated;
grant update (content) on public.messages to authenticated;
grant insert (message_id,user_id,reaction_type_id) on public.message_reactions to authenticated;
grant update (reaction_type_id) on public.message_reactions to authenticated;
grant delete on public.message_reactions to authenticated;
grant insert (room_id,user_id,last_read_message_id) on public.chat_room_read_states to authenticated;
grant update (last_read_message_id) on public.chat_room_read_states to authenticated;
grant usage, select on sequence public.message_reactions_id_seq to authenticated;
grant select, insert, update, delete on public.chat_rooms, public.direct_chat_pairs, public.chat_room_members, public.messages, public.message_attachments, public.message_reactions, public.chat_room_read_states to service_role;
grant usage, select on sequence public.chat_rooms_id_seq, public.messages_id_seq, public.message_attachments_id_seq, public.message_reactions_id_seq to service_role;

create function public.create_direct_chat(p_other_user_id bigint)
returns bigint language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true); first_id bigint; second_id bigint; room_id bigint;
begin
  if caller_id=p_other_user_id or not exists (select 1 from public.profiles where id=p_other_user_id and status='accepted' and deleted_at is null)
    then raise exception 'accepted different target required'; end if;
  first_id:=least(caller_id,p_other_user_id); second_id:=greatest(caller_id,p_other_user_id);
  perform pg_advisory_xact_lock(hashtextextended(first_id::text||':'||second_id::text,0));
  select dcp.room_id into room_id from public.direct_chat_pairs dcp where dcp.user1_id=first_id and dcp.user2_id=second_id;
  if room_id is not null then return room_id; end if;
  insert into public.chat_rooms (is_group,created_by) values (false,caller_id) returning id into room_id;
  insert into public.direct_chat_pairs (room_id,user1_id,user2_id) values (room_id,first_id,second_id);
  insert into public.chat_room_members (room_id,user_id) values (room_id,first_id),(room_id,second_id);
  return room_id;
end;
$$;

create function public.create_group_chat(p_name text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true); room_id bigint;
begin
  insert into public.chat_rooms(name,is_group,created_by) values(btrim(p_name),true,caller_id) returning id into room_id;
  insert into public.chat_room_members(room_id,user_id) values(room_id,caller_id);
  return room_id;
end;
$$;

create function public.add_group_member(p_room_id bigint,p_user_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true);
begin
  if not exists(select 1 from public.chat_rooms r join public.chat_room_members m on m.room_id=r.id where r.id=p_room_id and r.is_group and m.user_id=caller_id)
    or not exists(select 1 from public.profiles where id=p_user_id and status='accepted' and deleted_at is null)
    then raise exception 'eligible group member required'; end if;
  insert into public.chat_room_members(room_id,user_id) values(p_room_id,p_user_id);
end;
$$;

create function public.remove_group_member(p_room_id bigint,p_user_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true);
begin
  if not exists(select 1 from public.chat_rooms where id=p_room_id and is_group) then raise exception 'group room required'; end if;
  if caller_id<>p_user_id
    and not exists(select 1 from public.chat_rooms where id=p_room_id and created_by=caller_id)
    and not exists(select 1 from public.profiles where id=caller_id and role='admin')
    then raise exception 'not allowed to remove member'; end if;
  delete from public.chat_room_read_states where room_id=p_room_id and user_id=p_user_id;
  delete from public.message_reactions mr using public.messages m where mr.message_id=m.id and m.room_id=p_room_id and mr.user_id=p_user_id;
  delete from public.chat_room_members where room_id=p_room_id and user_id=p_user_id;
end;
$$;

create function public.create_group_chat_with_members(p_name text,p_member_ids bigint[] default array[]::bigint[])
returns bigint language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true); room_id bigint; normalized_member_ids bigint[];
begin
  select array_agg(distinct member_id) into normalized_member_ids
  from unnest(coalesce(p_member_ids,array[]::bigint[])) as member_ids(member_id)
  where member_id is not null and member_id <> caller_id;

  if exists (
    select 1
    from unnest(coalesce(normalized_member_ids,array[]::bigint[])) as member_ids(member_id)
    where not exists (
      select 1 from public.profiles p
      where p.id=member_id and p.status='accepted' and p.deleted_at is null
    )
  ) then raise exception 'all group members must be accepted active profiles'; end if;

  insert into public.chat_rooms(name,is_group,created_by) values(btrim(p_name),true,caller_id) returning id into room_id;
  insert into public.chat_room_members(room_id,user_id)
  select room_id, member_id
  from unnest(array_prepend(caller_id,coalesce(normalized_member_ids,array[]::bigint[]))) as member_ids(member_id);
  return room_id;
end;
$$;

create function public.send_message(p_room_id bigint,p_content text default null,p_parent_id bigint default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true); message_id bigint; normalized_content text;
begin
  if not exists(select 1 from public.chat_room_members where room_id=p_room_id and user_id=caller_id) then
    raise exception 'room membership required';
  end if;
  if p_parent_id is not null and not exists(select 1 from public.messages where id=p_parent_id and room_id=p_room_id and deleted_at is null) then
    raise exception 'active parent message in room required';
  end if;

  normalized_content := nullif(btrim(p_content), '');
  if normalized_content is null then
    raise exception 'message content required';
  end if;
  if char_length(normalized_content) > 10000 then
    raise exception 'message content must be 1 to 10000 characters';
  end if;

  insert into public.messages(room_id,sender_id,parent_id,content)
  values(p_room_id,caller_id,p_parent_id,normalized_content)
  returning id into message_id;

  insert into public.chat_room_read_states(room_id,user_id,last_read_message_id)
  values(p_room_id,caller_id,message_id)
  on conflict(room_id,user_id) do update
  set last_read_message_id=excluded.last_read_message_id
  where public.chat_room_read_states.last_read_message_id is null
     or public.chat_room_read_states.last_read_message_id < excluded.last_read_message_id;

  return message_id;
end;
$$;

create function public.list_chat_rooms()
returns table(
  room_id bigint,
  is_group boolean,
  name text,
  display_name text,
  display_initials text,
  avatar_url text,
  last_message_id bigint,
  last_message_content text,
  last_message_has_attachment boolean,
  last_message_sender_id bigint,
  last_message_sender_name text,
  last_message_created_at timestamptz,
  unread_count bigint,
  member_count bigint,
  created_at timestamptz
) language plpgsql stable security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true);
begin
  return query
  select
    r.id as room_id,
    r.is_group,
    r.name,
    coalesce(case when r.is_group then r.name else peer.name end,'채팅방') as display_name,
    upper(left(regexp_replace(coalesce(case when r.is_group then r.name else peer.name end,'?'),'\s+','','g'),2)) as display_initials,
    case when r.is_group then null else peer.avatar_url end as avatar_url,
    last_message.id as last_message_id,
    last_message.content as last_message_content,
    coalesce(last_message.has_attachment,false) as last_message_has_attachment,
    last_message.sender_id as last_message_sender_id,
    last_sender.name as last_message_sender_name,
    last_message.created_at as last_message_created_at,
    coalesce(unread.unread_count,0) as unread_count,
    member_counts.member_count,
    r.created_at
  from public.chat_room_members own_membership
  join public.chat_rooms r on r.id=own_membership.room_id
  left join public.direct_chat_pairs dcp on dcp.room_id=r.id
  left join public.profiles peer on peer.id=case when dcp.user1_id=caller_id then dcp.user2_id when dcp.user2_id=caller_id then dcp.user1_id else null end
  left join lateral (
    select m.id,m.sender_id,m.content,m.created_at,
      exists(select 1 from public.message_attachments a where a.message_id=m.id) as has_attachment
    from public.messages m
    where m.room_id=r.id and m.deleted_at is null
    order by m.id desc
    limit 1
  ) last_message on true
  left join public.profiles last_sender on last_sender.id=last_message.sender_id
  left join public.chat_room_read_states read_state on read_state.room_id=r.id and read_state.user_id=caller_id
  left join lateral (
    select count(*)::bigint as unread_count
    from public.messages m
    where m.room_id=r.id and m.deleted_at is null and m.sender_id<>caller_id
      and (read_state.last_read_message_id is null or m.id>read_state.last_read_message_id)
  ) unread on true
  join lateral (
    select count(*)::bigint as member_count from public.chat_room_members m where m.room_id=r.id
  ) member_counts on true
  where own_membership.user_id=caller_id
  order by last_message.id desc nulls last,r.created_at desc,r.id desc;
end;
$$;

create function public.get_chat_messages(p_room_id bigint,p_before_id bigint default null,p_limit int4 default 50)
returns table(
  message_id bigint,
  room_id bigint,
  sender_id bigint,
  sender jsonb,
  parent_message jsonb,
  content text,
  is_edited boolean,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz,
  attachments jsonb,
  reactions jsonb,
  reads jsonb
) language plpgsql stable security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true);
begin
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'limit must be between 1 and 100'; end if;
  if not exists(select 1 from public.chat_room_members crm where crm.room_id=p_room_id and crm.user_id=caller_id) then raise exception 'room membership required'; end if;

  return query
  with page as (
    select m.*
    from public.messages m
    where m.room_id=p_room_id
      and (m.deleted_at is null or exists(select 1 from public.messages child where child.parent_id=m.id and child.deleted_at is null))
      and (p_before_id is null or m.id<p_before_id)
    order by m.id desc
    limit p_limit
  )
  select
    page.id as message_id,
    page.room_id,
    page.sender_id,
    jsonb_build_object('id',sender.id,'name',sender.name,'avatar_url',sender.avatar_url) as sender,
    case when parent.id is null then null else jsonb_build_object('id',parent.id,'sender_id',parent.sender_id,'sender_name',parent_sender.name,'content',parent.content,'created_at',parent.created_at) end as parent_message,
    page.content,
    page.is_edited,
    page.edited_at,
    page.deleted_at,
    page.created_at,
    coalesce(attachments.items,'[]'::jsonb) as attachments,
    coalesce(reactions.items,'[]'::jsonb) as reactions,
    coalesce(reads.items,'[]'::jsonb) as reads
  from page
  join public.profiles sender on sender.id=page.sender_id
  left join public.messages parent on parent.id=page.parent_id
  left join public.profiles parent_sender on parent_sender.id=parent.sender_id
  left join lateral (
    select jsonb_agg(jsonb_build_object('id',a.id,'storage_bucket',a.storage_bucket,'storage_path',a.storage_path,'file_name',a.file_name,'content_type',a.content_type,'size_bytes',a.size_bytes,'sort_order',a.sort_order,'width',a.width,'height',a.height,'created_at',a.created_at) order by a.sort_order,a.id) as items
    from public.message_attachments a where a.message_id=page.id
  ) attachments on true
  left join lateral (
    select jsonb_agg(jsonb_build_object('id',mr.id,'user_id',mr.user_id,'user_name',rp.name,'reaction_type_id',rt.id,'reaction_key',rt.key,'reaction_name',rt.name,'reaction_icon',rt.icon,'created_at',mr.created_at,'updated_at',mr.updated_at) order by mr.created_at,mr.id) as items
    from public.message_reactions mr join public.reaction_types rt on rt.id=mr.reaction_type_id join public.profiles rp on rp.id=mr.user_id
    where mr.message_id=page.id
  ) reactions on true
  left join lateral (
    select jsonb_agg(jsonb_build_object('user_id',rs.user_id,'user_name',reader.name,'read_at',rs.last_read_at) order by rs.last_read_at,rs.user_id) as items
    from public.chat_room_read_states rs join public.profiles reader on reader.id=rs.user_id
    where rs.room_id=page.room_id
      and rs.last_read_message_id is not null
      and rs.last_read_message_id>=page.id
  ) reads on true
  order by page.id asc;
end;
$$;

create function public.soft_delete_message(p_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
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

  update public.messages
  set content=null,deleted_at=now(),deleted_by=caller_id
  where id=p_id;
end;
$$;

create function public.search_messages(p_query text,p_room_id bigint)
returns table(message_id bigint,content_snippet text,sender_name text,created_at timestamptz)
language plpgsql security invoker set search_path = '' as $$
declare normalized_query text := regexp_replace(lower(btrim(p_query)), '\s+', '', 'g');
begin
  if p_query is null or char_length(btrim(p_query)) not between 1 and 200 or normalized_query='' then raise exception 'query must contain 1 to 200 characters'; end if;
  return query select m.id,left(m.content,300),p.name,m.created_at
  from public.messages m join public.profiles p on p.id=m.sender_id
  where m.room_id=p_room_id and m.deleted_at is null
    and m.content is not null
    and regexp_replace(lower(m.content),'\s+','','g') ilike '%'||normalized_query||'%'
  order by m.created_at desc,m.id desc limit 50;
end;
$$;

create function public.send_message_with_attachment(p_room_id bigint,p_storage_path text,p_file_name text,p_content_type text,p_size_bytes int8,p_parent_id bigint default null,p_content text default null,p_width int4 default null,p_height int4 default null)
returns bigint language plpgsql security definer set search_path='' as $$
declare caller_id bigint:=private.require_current_profile(true); message_id bigint; expected_prefix text:=p_room_id::text||'/'||(select auth.uid())::text||'/'; normalized_content text;
begin
  if not exists(select 1 from public.chat_room_members where room_id=p_room_id and user_id=caller_id) then raise exception 'room membership required'; end if;
  if not private.is_valid_message_parent(p_parent_id,p_room_id) then raise exception 'active parent message in room required'; end if;
  normalized_content:=nullif(btrim(p_content),'');
  if normalized_content is not null and char_length(normalized_content)>10000 then raise exception 'message content must be 1 to 10000 characters'; end if;
  if p_storage_path is null or p_storage_path not like expected_prefix||'%' or p_storage_path !~ '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or p_content_type not in ('image/jpeg','image/png','image/webp','application/pdf','text/plain','text/markdown','text/csv','application/rtf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation','application/x-hwp','application/x-hwpx','application/haansofthwp','application/haansofthwpx','application/vnd.hancom.hwp','application/vnd.hancom.hwpx','application/vnd.oasis.opendocument.text','application/vnd.oasis.opendocument.spreadsheet','application/vnd.oasis.opendocument.presentation') or p_size_bytes>25000000
    or not exists(select 1 from storage.objects where bucket_id='message-files' and name=p_storage_path and created_at>=now()-interval '24 hours' and metadata->>'mimetype'=p_content_type and (metadata->>'size')::int8=p_size_bytes)
  then raise exception 'invalid message attachment'; end if;

  insert into public.messages(room_id,sender_id,parent_id,content)
  values(p_room_id,caller_id,p_parent_id,normalized_content)
  returning id into message_id;

  insert into public.message_attachments(message_id,storage_bucket,storage_path,file_name,content_type,size_bytes,sort_order,width,height)
  values(message_id,'message-files',p_storage_path,p_file_name,p_content_type,p_size_bytes,0,p_width,p_height);

  insert into public.chat_room_read_states(room_id,user_id,last_read_message_id)
  values(p_room_id,caller_id,message_id)
  on conflict(room_id,user_id) do update
  set last_read_message_id=excluded.last_read_message_id
  where public.chat_room_read_states.last_read_message_id is null
     or public.chat_room_read_states.last_read_message_id<excluded.last_read_message_id;

  return message_id;
end $$;

revoke execute on function public.create_direct_chat(bigint), public.create_group_chat(text), public.add_group_member(bigint,bigint), public.remove_group_member(bigint,bigint), public.create_group_chat_with_members(text,bigint[]), public.send_message(bigint,text,bigint), public.list_chat_rooms(), public.get_chat_messages(bigint,bigint,int4), public.soft_delete_message(bigint), public.search_messages(text,bigint) from public, anon, authenticated, service_role;
grant execute on function public.create_direct_chat(bigint), public.create_group_chat(text), public.add_group_member(bigint,bigint), public.remove_group_member(bigint,bigint), public.create_group_chat_with_members(text,bigint[]), public.send_message(bigint,text,bigint), public.list_chat_rooms(), public.get_chat_messages(bigint,bigint,int4) to authenticated;
grant execute on function public.soft_delete_message(bigint) to authenticated;
grant execute on function public.search_messages(text,bigint) to authenticated;
grant execute on function public.send_message_with_attachment(bigint,text,text,text,int8,bigint,text,int4,int4) to authenticated;
revoke execute on function public.send_message_with_attachment(bigint,text,text,text,int8,bigint,text,int4,int4) from public, anon, service_role;

create function public.cleanup_direct_chat_room(p_room_id bigint)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform private.require_service_role();
  if exists(select 1 from public.chat_rooms where id=p_room_id and is_group) then
    raise exception 'only direct chat rooms can be cleaned up';
  end if;
  if exists(select 1 from public.message_attachments a join public.messages m on m.id=a.message_id where m.room_id=p_room_id) then
    raise exception 'message attachments must be removed before purging room';
  end if;
  delete from public.message_reactions mr using public.messages m where mr.message_id=m.id and m.room_id=p_room_id;
  delete from public.chat_room_read_states where room_id=p_room_id;
  delete from public.messages where room_id=p_room_id and parent_id is not null;
  delete from public.messages where room_id=p_room_id;
  delete from public.chat_room_members where room_id=p_room_id;
  delete from public.chat_rooms where id=p_room_id;
end $$;

grant execute on function public.cleanup_direct_chat_room(bigint) to service_role;
revoke execute on function public.cleanup_direct_chat_room(bigint) from public, anon, authenticated;
