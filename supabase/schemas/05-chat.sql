create table public.direct_chats (
  id bigserial primary key,
  user1_id bigint not null references public.profiles (id) on delete restrict,
  user2_id bigint not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.chat_rooms (
  id bigserial primary key,
  name text not null,
  created_by bigint null references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.chat_room_members (
  chat_room_id bigint not null references public.chat_rooms (id) on delete restrict,
  user_id bigint not null references public.profiles (id) on delete restrict,
  joined_at timestamptz not null default now(),
  primary key (chat_room_id, user_id)
);

create table public.messages (
  id bigserial primary key,
  direct_chat_id bigint null references public.direct_chats (id) on delete restrict,
  chat_room_id bigint null references public.chat_rooms (id) on delete restrict,
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

create table public.chat_read_states (
  id bigserial primary key,
  direct_chat_id bigint null references public.direct_chats (id) on delete restrict,
  chat_room_id bigint null references public.chat_rooms (id) on delete restrict,
  user_id bigint not null references public.profiles (id) on delete restrict,
  last_read_message_id bigint null references public.messages (id) on delete restrict,
  last_read_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index idx_direct_chats_user1_created_at on public.direct_chats (user1_id, created_at);
create index idx_direct_chats_user2_created_at on public.direct_chats (user2_id, created_at);
create index idx_chat_room_members_user_joined_at on public.chat_room_members (user_id, joined_at);
create index idx_chat_room_members_user_room on public.chat_room_members (user_id, chat_room_id);
create index idx_messages_sender_created_at on public.messages (sender_id, created_at);
create index idx_messages_parent_created_at on public.messages (parent_id, created_at);
create index idx_messages_active_direct_chat_id on public.messages (direct_chat_id, id desc)
where deleted_at is null and direct_chat_id is not null;
create index idx_messages_active_chat_room_id on public.messages (chat_room_id, id desc)
where deleted_at is null and chat_room_id is not null;
create index idx_message_reactions_type_count on public.message_reactions (message_id, reaction_type_id);
create index idx_message_reactions_user_created_at on public.message_reactions (user_id, created_at);
create index idx_chat_read_states_user_last_read_at on public.chat_read_states (user_id, last_read_at);
create unique index chat_read_states_direct_user_key on public.chat_read_states (direct_chat_id, user_id)
where direct_chat_id is not null;
create unique index chat_read_states_room_user_key on public.chat_read_states (chat_room_id, user_id)
where chat_room_id is not null;
create index idx_messages_content_search_gin on public.messages
  using gin (regexp_replace(lower(content), '\s+', '', 'g') extensions.gin_trgm_ops)
  where deleted_at is null;

alter table public.direct_chats
  add constraint direct_chats_users_check check (user1_id < user2_id),
  add constraint direct_chats_users_key unique (user1_id, user2_id);

alter table public.chat_rooms
  add constraint chat_rooms_name_check check (char_length(btrim(name)) between 1 and 100);

alter table public.messages
  add constraint messages_target_check check ((direct_chat_id is null) <> (chat_room_id is null)),
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

alter table public.chat_read_states
  add constraint chat_read_states_target_check check ((direct_chat_id is null) <> (chat_room_id is null));

create function private.is_direct_chat_member(p_direct_chat_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_accepted_user() and exists(
    select 1 from public.direct_chats dc
    where dc.id=p_direct_chat_id
      and private.current_profile_id() in (dc.user1_id, dc.user2_id)
  )
$$;
create function private.is_room_member(p_chat_room_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_accepted_user() and exists(select 1 from public.chat_room_members where chat_room_id=p_chat_room_id and user_id=private.current_profile_id())
$$;
create function private.can_access_message(p_message_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.messages m
    where m.id=p_message_id
      and m.deleted_at is null
      and (
        (m.direct_chat_id is not null and private.is_direct_chat_member(m.direct_chat_id))
        or (m.chat_room_id is not null and private.is_room_member(m.chat_room_id))
      )
  )
$$;
create function private.is_valid_message_parent(p_parent_id bigint,p_direct_chat_id bigint,p_chat_room_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_parent_id is null or exists(
    select 1 from public.messages m
    where m.id=p_parent_id
      and m.parent_id is null
      and m.deleted_at is null
      and m.direct_chat_id is not distinct from p_direct_chat_id
      and m.chat_room_id is not distinct from p_chat_room_id
  )
$$;
create function private.has_active_message_reply(p_message_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.messages where parent_id=p_message_id and deleted_at is null)
$$;
revoke execute on function private.is_direct_chat_member(bigint), private.is_room_member(bigint), private.can_access_message(bigint), private.is_valid_message_parent(bigint,bigint,bigint), private.has_active_message_reply(bigint) from public, anon, service_role;
grant execute on function private.is_direct_chat_member(bigint), private.is_room_member(bigint), private.can_access_message(bigint), private.is_valid_message_parent(bigint,bigint,bigint), private.has_active_message_reply(bigint) to authenticated;

create function private.validate_message_parent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_valid_message_parent(new.parent_id,new.direct_chat_id,new.chat_room_id) then
    raise exception 'message parent must be an active top-level message in the same chat';
  end if;
  return new;
end;
$$;

create trigger trg_validate_message_parent
before insert or update of direct_chat_id, chat_room_id, parent_id on public.messages
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

create function private.validate_chat_read_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.last_read_message_id is not null and not exists (
    select 1
    from public.messages m
    where m.id = new.last_read_message_id
      and m.deleted_at is null
      and m.direct_chat_id is not distinct from new.direct_chat_id
      and m.chat_room_id is not distinct from new.chat_room_id
  ) then
    raise exception 'last read message must be active and in the same chat';
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
before insert or update of direct_chat_id, chat_room_id, last_read_message_id on public.chat_read_states
for each row execute function private.validate_chat_read_state();

create function private.add_chat_room_creator_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.created_by is not null then
    insert into public.chat_room_members(chat_room_id,user_id)
    values(new.id,new.created_by)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger trg_add_chat_room_creator_member
after insert on public.chat_rooms
for each row execute function private.add_chat_room_creator_member();

create function private.mark_sender_chat_read()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.direct_chat_id is not null then
    update public.chat_read_states
    set last_read_message_id=new.id
    where direct_chat_id=new.direct_chat_id
      and user_id=new.sender_id
      and (last_read_message_id is null or last_read_message_id<new.id);
    if not found then
      begin
        insert into public.chat_read_states(direct_chat_id,user_id,last_read_message_id)
        values(new.direct_chat_id,new.sender_id,new.id);
      exception when unique_violation then
        update public.chat_read_states
        set last_read_message_id=new.id
        where direct_chat_id=new.direct_chat_id
          and user_id=new.sender_id
          and (last_read_message_id is null or last_read_message_id<new.id);
      end;
    end if;
  else
    update public.chat_read_states
    set last_read_message_id=new.id
    where chat_room_id=new.chat_room_id
      and user_id=new.sender_id
      and (last_read_message_id is null or last_read_message_id<new.id);
    if not found then
      begin
        insert into public.chat_read_states(chat_room_id,user_id,last_read_message_id)
        values(new.chat_room_id,new.sender_id,new.id);
      exception when unique_violation then
        update public.chat_read_states
        set last_read_message_id=new.id
        where chat_room_id=new.chat_room_id
          and user_id=new.sender_id
          and (last_read_message_id is null or last_read_message_id<new.id);
      end;
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_mark_sender_chat_read
after insert on public.messages
for each row execute function private.mark_sender_chat_read();

revoke execute on function private.validate_message_parent() from public, anon, authenticated, service_role;
revoke execute on function private.mark_message_edited() from public, anon, authenticated, service_role;
revoke execute on function private.mark_message_reaction_updated() from public, anon, authenticated, service_role;
revoke execute on function private.validate_chat_read_state() from public, anon, authenticated, service_role;
revoke execute on function private.add_chat_room_creator_member() from public, anon, authenticated, service_role;
revoke execute on function private.mark_sender_chat_read() from public, anon, authenticated, service_role;

alter table public.direct_chats enable row level security;
alter table public.chat_rooms enable row level security;
alter table public.chat_room_members enable row level security;
alter table public.messages enable row level security;
alter table public.message_attachments enable row level security;
alter table public.message_reactions enable row level security;
alter table public.chat_read_states enable row level security;
create policy direct_chats_select on public.direct_chats for select to authenticated using (private.is_direct_chat_member(id));
create policy direct_chats_insert on public.direct_chats for insert to authenticated with check (private.is_accepted_user() and user1_id<user2_id and private.current_profile_id() in (user1_id,user2_id) and exists(select 1 from public.profiles p where p.id=user1_id and p.status='accepted' and p.deleted_at is null) and exists(select 1 from public.profiles p where p.id=user2_id and p.status='accepted' and p.deleted_at is null));
create policy chat_rooms_select on public.chat_rooms for select to authenticated using (private.is_room_member(id));
create policy chat_rooms_insert on public.chat_rooms for insert to authenticated with check (created_by=private.current_profile_id() and private.is_accepted_user());
create policy chat_room_members_select on public.chat_room_members for select to authenticated using (private.is_room_member(chat_room_id));
create policy chat_room_members_insert on public.chat_room_members for insert to authenticated with check (private.is_room_member(chat_room_id) and exists(select 1 from public.profiles p where p.id=user_id and p.status='accepted' and p.deleted_at is null));
create policy messages_select on public.messages for select to authenticated using ((deleted_at is null or private.has_active_message_reply(id)) and ((direct_chat_id is not null and private.is_direct_chat_member(direct_chat_id)) or (chat_room_id is not null and private.is_room_member(chat_room_id))));
create policy messages_insert on public.messages for insert to authenticated with check (sender_id=private.current_profile_id() and content is not null and private.is_valid_message_parent(parent_id,direct_chat_id,chat_room_id) and ((direct_chat_id is not null and private.is_direct_chat_member(direct_chat_id)) or (chat_room_id is not null and private.is_room_member(chat_room_id))));
create policy messages_update on public.messages for update to authenticated using (deleted_at is null and sender_id=private.current_profile_id() and created_at>=now()-interval '15 minutes' and ((direct_chat_id is not null and private.is_direct_chat_member(direct_chat_id)) or (chat_room_id is not null and private.is_room_member(chat_room_id)))) with check (deleted_at is null and sender_id=private.current_profile_id() and content is not null and created_at>=now()-interval '15 minutes' and ((direct_chat_id is not null and private.is_direct_chat_member(direct_chat_id)) or (chat_room_id is not null and private.is_room_member(chat_room_id))));
create policy message_attachments_select on public.message_attachments for select to authenticated using (private.can_access_message(message_id));
create policy message_reactions_select on public.message_reactions for select to authenticated using (private.can_access_message(message_id));
create policy message_reactions_insert on public.message_reactions for insert to authenticated with check (user_id=private.current_profile_id() and private.can_access_message(message_id));
create policy message_reactions_update on public.message_reactions for update to authenticated using (user_id=private.current_profile_id() and private.can_access_message(message_id)) with check (user_id=private.current_profile_id() and private.can_access_message(message_id));
create policy message_reactions_delete on public.message_reactions for delete to authenticated using (user_id=private.current_profile_id() and private.can_access_message(message_id));
create policy chat_read_states_select on public.chat_read_states for select to authenticated using (user_id=private.current_profile_id() and ((direct_chat_id is not null and private.is_direct_chat_member(direct_chat_id)) or (chat_room_id is not null and private.is_room_member(chat_room_id))));
create policy chat_read_states_insert on public.chat_read_states for insert to authenticated with check (user_id=private.current_profile_id() and last_read_message_id is not null and ((direct_chat_id is not null and private.is_direct_chat_member(direct_chat_id)) or (chat_room_id is not null and private.is_room_member(chat_room_id))));
create policy chat_read_states_update on public.chat_read_states for update to authenticated using (user_id=private.current_profile_id() and ((direct_chat_id is not null and private.is_direct_chat_member(direct_chat_id)) or (chat_room_id is not null and private.is_room_member(chat_room_id)))) with check (user_id=private.current_profile_id() and last_read_message_id is not null and ((direct_chat_id is not null and private.is_direct_chat_member(direct_chat_id)) or (chat_room_id is not null and private.is_room_member(chat_room_id))));

grant select on public.direct_chats, public.chat_rooms, public.chat_room_members, public.messages, public.message_attachments, public.message_reactions, public.chat_read_states to authenticated;
grant insert (user1_id,user2_id) on public.direct_chats to authenticated;
grant insert (name,created_by) on public.chat_rooms to authenticated;
grant insert (chat_room_id,user_id) on public.chat_room_members to authenticated;
grant insert (direct_chat_id,chat_room_id,sender_id,parent_id,content) on public.messages to authenticated;
grant update (content) on public.messages to authenticated;
grant insert (message_id,user_id,reaction_type_id) on public.message_reactions to authenticated;
grant update (reaction_type_id) on public.message_reactions to authenticated;
grant delete on public.message_reactions to authenticated;
grant insert (direct_chat_id,chat_room_id,user_id,last_read_message_id) on public.chat_read_states to authenticated;
grant update (last_read_message_id) on public.chat_read_states to authenticated;
grant usage, select on sequence public.direct_chats_id_seq, public.chat_rooms_id_seq, public.messages_id_seq, public.message_reactions_id_seq, public.chat_read_states_id_seq to authenticated;

grant select, insert, update, delete on public.direct_chats, public.chat_rooms, public.chat_room_members, public.messages, public.message_attachments, public.message_reactions, public.chat_read_states to service_role;
grant usage, select on sequence public.direct_chats_id_seq, public.chat_rooms_id_seq, public.messages_id_seq, public.message_attachments_id_seq, public.message_reactions_id_seq, public.chat_read_states_id_seq to service_role;

create function public.remove_group_member(p_chat_room_id bigint,p_user_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true);
begin
  if not exists(select 1 from public.chat_rooms where id=p_chat_room_id) then raise exception 'chat room required'; end if;
  if caller_id<>p_user_id
    and not exists(select 1 from public.chat_rooms where id=p_chat_room_id and created_by=caller_id)
    and not exists(select 1 from public.profiles where id=caller_id and role='admin')
    then raise exception 'not allowed to remove member'; end if;
  delete from public.chat_read_states where chat_room_id=p_chat_room_id and user_id=p_user_id;
  delete from public.message_reactions mr using public.messages m where mr.message_id=m.id and m.chat_room_id=p_chat_room_id and mr.user_id=p_user_id;
  delete from public.chat_room_members where chat_room_id=p_chat_room_id and user_id=p_user_id;
end;
$$;

create function public.list_chat_rooms()
returns table(
  direct_chat_id bigint,
  chat_room_id bigint,
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
  with direct_rows as (
    select
      dc.id as direct_chat_id,
      null::bigint as chat_room_id,
      null::text as name,
      peer.name as display_name,
      upper(left(regexp_replace(coalesce(peer.name,'?'),'\s+','','g'),2)) as display_initials,
      peer.avatar_url,
      last_message.id as last_message_id,
      last_message.content as last_message_content,
      coalesce(last_message.has_attachment,false) as last_message_has_attachment,
      last_message.sender_id as last_message_sender_id,
      last_sender.name as last_message_sender_name,
      last_message.created_at as last_message_created_at,
      coalesce(unread.unread_count,0) as unread_count,
      2::bigint as member_count,
      dc.created_at
    from public.direct_chats dc
    join public.profiles peer on peer.id=case when dc.user1_id=caller_id then dc.user2_id else dc.user1_id end
    left join lateral (
      select m.id,m.sender_id,m.content,m.created_at,
        exists(select 1 from public.message_attachments a where a.message_id=m.id) as has_attachment
      from public.messages m
      where m.direct_chat_id=dc.id and m.deleted_at is null
      order by m.id desc
      limit 1
    ) last_message on true
    left join public.profiles last_sender on last_sender.id=last_message.sender_id
    left join public.chat_read_states read_state on read_state.direct_chat_id=dc.id and read_state.user_id=caller_id
    left join lateral (
      select count(*)::bigint as unread_count
      from public.messages m
      where m.direct_chat_id=dc.id and m.deleted_at is null and m.sender_id<>caller_id
        and (read_state.last_read_message_id is null or m.id>read_state.last_read_message_id)
    ) unread on true
    where caller_id in (dc.user1_id,dc.user2_id)
  ), group_rows as (
    select
      null::bigint as direct_chat_id,
      r.id as chat_room_id,
      r.name,
      r.name as display_name,
      upper(left(regexp_replace(coalesce(r.name,'?'),'\s+','','g'),2)) as display_initials,
      null::text as avatar_url,
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
    join public.chat_rooms r on r.id=own_membership.chat_room_id
    left join lateral (
      select m.id,m.sender_id,m.content,m.created_at,
        exists(select 1 from public.message_attachments a where a.message_id=m.id) as has_attachment
      from public.messages m
      where m.chat_room_id=r.id and m.deleted_at is null
      order by m.id desc
      limit 1
    ) last_message on true
    left join public.profiles last_sender on last_sender.id=last_message.sender_id
    left join public.chat_read_states read_state on read_state.chat_room_id=r.id and read_state.user_id=caller_id
    left join lateral (
      select count(*)::bigint as unread_count
      from public.messages m
      where m.chat_room_id=r.id and m.deleted_at is null and m.sender_id<>caller_id
        and (read_state.last_read_message_id is null or m.id>read_state.last_read_message_id)
    ) unread on true
    join lateral (
      select count(*)::bigint as member_count from public.chat_room_members m where m.chat_room_id=r.id
    ) member_counts on true
    where own_membership.user_id=caller_id
  )
  select * from direct_rows
  union all
  select * from group_rows
  order by last_message_id desc nulls last, created_at desc, coalesce(direct_chat_id,chat_room_id) desc;
end;
$$;

create function public.get_chat_messages(p_direct_chat_id bigint default null,p_chat_room_id bigint default null,p_before_id bigint default null,p_limit int4 default 50)
returns table(
  message_id bigint,
  direct_chat_id bigint,
  chat_room_id bigint,
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
  if (p_direct_chat_id is null) = (p_chat_room_id is null) then raise exception 'exactly one chat target required'; end if;
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'limit must be between 1 and 100'; end if;
  if p_direct_chat_id is not null and not exists(select 1 from public.direct_chats dc where dc.id=p_direct_chat_id and caller_id in (dc.user1_id,dc.user2_id)) then raise exception 'direct chat membership required'; end if;
  if p_chat_room_id is not null and not exists(select 1 from public.chat_room_members crm where crm.chat_room_id=p_chat_room_id and crm.user_id=caller_id) then raise exception 'chat room membership required'; end if;

  return query
  with page as (
    select m.*
    from public.messages m
    where m.direct_chat_id is not distinct from p_direct_chat_id
      and m.chat_room_id is not distinct from p_chat_room_id
      and (m.deleted_at is null or exists(select 1 from public.messages child where child.parent_id=m.id and child.deleted_at is null))
      and (p_before_id is null or m.id<p_before_id)
    order by m.id desc
    limit p_limit
  )
  select
    page.id as message_id,
    page.direct_chat_id,
    page.chat_room_id,
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
    from public.chat_read_states rs join public.profiles reader on reader.id=rs.user_id
    where rs.direct_chat_id is not distinct from page.direct_chat_id
      and rs.chat_room_id is not distinct from page.chat_room_id
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

create function public.search_messages(p_query text,p_direct_chat_id bigint default null,p_chat_room_id bigint default null)
returns table(message_id bigint,content_snippet text,sender_name text,created_at timestamptz)
language plpgsql security invoker set search_path = '' as $$
declare normalized_query text := regexp_replace(lower(btrim(p_query)), '\s+', '', 'g');
begin
  if (p_direct_chat_id is null) = (p_chat_room_id is null) then raise exception 'exactly one chat target required'; end if;
  if p_query is null or char_length(btrim(p_query)) not between 1 and 200 or normalized_query='' then raise exception 'query must contain 1 to 200 characters'; end if;
  return query select m.id,left(m.content,300),p.name,m.created_at
  from public.messages m join public.profiles p on p.id=m.sender_id
  where m.direct_chat_id is not distinct from p_direct_chat_id
    and m.chat_room_id is not distinct from p_chat_room_id
    and m.deleted_at is null
    and m.content is not null
    and regexp_replace(lower(m.content),'\s+','','g') ilike '%'||normalized_query||'%'
  order by m.created_at desc,m.id desc limit 50;
end;
$$;

create function public.send_direct_message_with_attachment(p_direct_chat_id bigint,p_storage_path text,p_file_name text,p_content_type text,p_size_bytes int8,p_parent_id bigint default null,p_content text default null,p_width int4 default null,p_height int4 default null)
returns bigint language plpgsql security definer set search_path='' as $$
declare caller_id bigint:=private.require_current_profile(true); message_id bigint; expected_prefix text:='direct/'||p_direct_chat_id::text||'/'||(select auth.uid())::text||'/'; normalized_content text;
begin
  if not private.is_direct_chat_member(p_direct_chat_id) then raise exception 'direct chat membership required'; end if;
  if not private.is_valid_message_parent(p_parent_id,p_direct_chat_id,null) then raise exception 'active parent message in chat required'; end if;
  normalized_content:=nullif(btrim(p_content),'');
  if normalized_content is not null and char_length(normalized_content)>10000 then raise exception 'message content must be 1 to 10000 characters'; end if;
  if p_storage_path is null or p_storage_path not like expected_prefix||'%' or p_storage_path !~ '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or p_content_type not in ('image/jpeg','image/png','image/webp','application/pdf','text/plain','text/markdown','text/csv','application/rtf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation','application/x-hwp','application/x-hwpx','application/haansofthwp','application/haansofthwpx','application/vnd.hancom.hwp','application/vnd.hancom.hwpx','application/vnd.oasis.opendocument.text','application/vnd.oasis.opendocument.spreadsheet','application/vnd.oasis.opendocument.presentation') or p_size_bytes>25000000
    or not exists(select 1 from storage.objects where bucket_id='message-files' and name=p_storage_path and created_at>=now()-interval '24 hours' and metadata->>'mimetype'=p_content_type and (metadata->>'size')::int8=p_size_bytes)
  then raise exception 'invalid message attachment'; end if;

  insert into public.messages(direct_chat_id,sender_id,parent_id,content)
  values(p_direct_chat_id,caller_id,p_parent_id,normalized_content)
  returning id into message_id;

  insert into public.message_attachments(message_id,storage_bucket,storage_path,file_name,content_type,size_bytes,sort_order,width,height)
  values(message_id,'message-files',p_storage_path,p_file_name,p_content_type,p_size_bytes,0,p_width,p_height);

  return message_id;
end $$;

create function public.send_room_message_with_attachment(p_chat_room_id bigint,p_storage_path text,p_file_name text,p_content_type text,p_size_bytes int8,p_parent_id bigint default null,p_content text default null,p_width int4 default null,p_height int4 default null)
returns bigint language plpgsql security definer set search_path='' as $$
declare caller_id bigint:=private.require_current_profile(true); message_id bigint; expected_prefix text:='room/'||p_chat_room_id::text||'/'||(select auth.uid())::text||'/'; normalized_content text;
begin
  if not private.is_room_member(p_chat_room_id) then raise exception 'chat room membership required'; end if;
  if not private.is_valid_message_parent(p_parent_id,null,p_chat_room_id) then raise exception 'active parent message in chat required'; end if;
  normalized_content:=nullif(btrim(p_content),'');
  if normalized_content is not null and char_length(normalized_content)>10000 then raise exception 'message content must be 1 to 10000 characters'; end if;
  if p_storage_path is null or p_storage_path not like expected_prefix||'%' or p_storage_path !~ '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or p_content_type not in ('image/jpeg','image/png','image/webp','application/pdf','text/plain','text/markdown','text/csv','application/rtf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation','application/x-hwp','application/x-hwpx','application/haansofthwp','application/haansofthwpx','application/vnd.hancom.hwp','application/vnd.hancom.hwpx','application/vnd.oasis.opendocument.text','application/vnd.oasis.opendocument.spreadsheet','application/vnd.oasis.opendocument.presentation') or p_size_bytes>25000000
    or not exists(select 1 from storage.objects where bucket_id='message-files' and name=p_storage_path and created_at>=now()-interval '24 hours' and metadata->>'mimetype'=p_content_type and (metadata->>'size')::int8=p_size_bytes)
  then raise exception 'invalid message attachment'; end if;

  insert into public.messages(chat_room_id,sender_id,parent_id,content)
  values(p_chat_room_id,caller_id,p_parent_id,normalized_content)
  returning id into message_id;

  insert into public.message_attachments(message_id,storage_bucket,storage_path,file_name,content_type,size_bytes,sort_order,width,height)
  values(message_id,'message-files',p_storage_path,p_file_name,p_content_type,p_size_bytes,0,p_width,p_height);

  return message_id;
end $$;

revoke execute on function public.remove_group_member(bigint,bigint), public.list_chat_rooms(), public.get_chat_messages(bigint,bigint,bigint,int4), public.soft_delete_message(bigint), public.search_messages(text,bigint,bigint), public.send_direct_message_with_attachment(bigint,text,text,text,int8,bigint,text,int4,int4), public.send_room_message_with_attachment(bigint,text,text,text,int8,bigint,text,int4,int4) from public, anon, authenticated, service_role;
grant execute on function public.remove_group_member(bigint,bigint), public.list_chat_rooms(), public.get_chat_messages(bigint,bigint,bigint,int4) to authenticated;
grant execute on function public.soft_delete_message(bigint) to authenticated;
grant execute on function public.search_messages(text,bigint,bigint) to authenticated;
grant execute on function public.send_direct_message_with_attachment(bigint,text,text,text,int8,bigint,text,int4,int4), public.send_room_message_with_attachment(bigint,text,text,text,int8,bigint,text,int4,int4) to authenticated;

create function public.cleanup_direct_chat(p_direct_chat_id bigint)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform private.require_service_role();
  if exists(select 1 from public.message_attachments a join public.messages m on m.id=a.message_id where m.direct_chat_id=p_direct_chat_id) then
    raise exception 'message attachments must be removed before purging direct chat';
  end if;
  delete from public.message_reactions mr using public.messages m where mr.message_id=m.id and m.direct_chat_id=p_direct_chat_id;
  delete from public.chat_read_states where direct_chat_id=p_direct_chat_id;
  delete from public.messages where direct_chat_id=p_direct_chat_id and parent_id is not null;
  delete from public.messages where direct_chat_id=p_direct_chat_id;
  delete from public.direct_chats where id=p_direct_chat_id;
end $$;

grant execute on function public.cleanup_direct_chat(bigint) to service_role;
revoke execute on function public.cleanup_direct_chat(bigint) from public, anon, authenticated;
