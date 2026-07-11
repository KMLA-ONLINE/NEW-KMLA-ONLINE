create type public.conversation_type as enum ('direct', 'group');

create table public.conversations (
  id bigserial primary key,
  type public.conversation_type not null,
  name text null,
  created_by bigint null references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Membership + one-per-pair uniqueness for direct conversations (peers are not stored in conversation_members).
create table public.direct_conversations (
  conversation_id bigint primary key references public.conversations (id) on delete restrict,
  user1_id bigint not null references public.profiles (id) on delete restrict,
  user2_id bigint not null references public.profiles (id) on delete restrict
);

-- Membership for group conversations only.
create table public.conversation_members (
  conversation_id bigint not null references public.conversations (id) on delete restrict,
  user_id bigint not null references public.profiles (id) on delete restrict,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table public.messages (
  id bigserial primary key,
  conversation_id bigint not null references public.conversations (id) on delete restrict,
  sender_id bigint not null references public.profiles (id) on delete restrict,
  parent_id bigint null references public.messages (id) on delete restrict,
  content text null,
  edited_at timestamptz null,
  deleted_at timestamptz null,
  deleted_by bigint null references public.profiles (id) on delete set null,
  pinned_at timestamptz null,
  pinned_by bigint null references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Which MIME types a message accepts, and how large each may be. The kind of each
-- one is universal and lives in public.mime_types.
--
-- message_attachments has a foreign key onto this table, so a type a message does
-- not accept cannot be stored at all, and the message-files bucket's
-- allowed_mime_types array is generated from these rows. Rows are seed data, so
-- they live in a migration.
create table public.message_attachment_mime_types (
  content_type text primary key references public.mime_types (content_type) on update cascade on delete restrict,
  max_bytes int8 not null,
  created_at timestamptz not null default now()
);

create table public.message_attachments (
  id bigserial primary key,
  message_id bigint not null references public.messages (id) on delete restrict,
  storage_bucket text not null,
  storage_path text not null,
  file_name text not null,
  content_type text not null references public.message_attachment_mime_types (content_type) on update cascade on delete restrict,
  size_bytes int8 null,
  sort_order int4 not null default 0,
  width int4 null,
  height int4 null,
  duration_ms int4 null,
  created_at timestamptz not null default now()
);

create table public.message_reactions (
  message_id bigint not null references public.messages (id) on delete restrict,
  user_id bigint not null references public.profiles (id) on delete restrict,
  reaction_type_id bigint not null references public.reaction_types (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz null,
  primary key (message_id, user_id)
);

create table public.chat_read_states (
  conversation_id bigint not null references public.conversations (id) on delete restrict,
  user_id bigint not null references public.profiles (id) on delete restrict,
  last_read_message_id bigint null references public.messages (id) on delete restrict,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

-- Muting is a user's preference about a conversation, not a property of it, and
-- not a boolean either: `muted_until` carries "for 8 hours" and "until I say
-- otherwise" ('infinity') in one column. `level` is orthogonal -- a loud group
-- chat can stay unmuted while only notifying on a mention.
--
-- Its own table rather than a column on chat_read_states, whose insert policy
-- demands a last_read_message_id: you must be able to mute a conversation you
-- have never opened. And not on conversation_members, which direct conversations
-- have no rows in.
create table public.chat_notification_settings (
  conversation_id bigint not null references public.conversations (id) on delete restrict,
  user_id bigint not null references public.profiles (id) on delete restrict,
  muted_until timestamptz null,
  level public.notification_level not null default 'all',
  created_at timestamptz not null default now(),
  updated_at timestamptz null,
  primary key (conversation_id, user_id)
);

create index idx_direct_conversations_user1 on public.direct_conversations (user1_id);
create index idx_direct_conversations_user2 on public.direct_conversations (user2_id);
create index idx_conversation_members_user on public.conversation_members (user_id, conversation_id);
create index idx_messages_sender_created_at on public.messages (sender_id, created_at);
create index idx_messages_parent_created_at on public.messages (parent_id, created_at);
create index idx_messages_active_conversation_id on public.messages (conversation_id, id desc)
where deleted_at is null;
create index idx_messages_pinned on public.messages (conversation_id, pinned_at desc)
where pinned_at is not null and deleted_at is null;
create index idx_message_reactions_type_count on public.message_reactions (message_id, reaction_type_id);
create index idx_message_reactions_user_created_at on public.message_reactions (user_id, created_at);
create index idx_chat_read_states_user_last_read_at on public.chat_read_states (user_id, last_read_at);
create index idx_chat_notification_settings_user on public.chat_notification_settings (user_id, conversation_id);
create index idx_messages_content_search_gin on public.messages
  using gin (regexp_replace(lower(content), '\s+', '', 'g') extensions.gin_trgm_ops)
  where deleted_at is null;

alter table public.conversations
  add constraint conversations_shape_check check (
    (type = 'group' and name is not null and char_length(btrim(name)) between 1 and 100)
    or (type = 'direct' and name is null)
  );

alter table public.direct_conversations
  add constraint direct_conversations_users_check check (user1_id < user2_id),
  add constraint direct_conversations_users_key unique (user1_id, user2_id);

alter table public.messages
  add constraint messages_parent_check check (parent_id is null or parent_id <> id),
  add constraint messages_content_check check (content is null or char_length(btrim(content)) between 1 and 10000),
  add constraint messages_deleted_state_check check (deleted_at is not null or deleted_by is null),
  add constraint messages_pinned_state_check check (pinned_at is not null or pinned_by is null);

alter table public.message_attachment_mime_types
  add constraint message_attachment_mime_types_content_type_check check (char_length(btrim(content_type)) between 1 and 255),
  add constraint message_attachment_mime_types_max_bytes_check check (max_bytes > 0);

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
  add constraint message_attachments_sort_order_check check (sort_order >= 0),
  add constraint message_attachments_duration_check check (duration_ms is null or duration_ms >= 0);

create function private.is_conversation_member(p_conversation_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_accepted_user() and (
    exists(
      select 1 from public.direct_conversations dc
      where dc.conversation_id=p_conversation_id
        and private.current_profile_id() in (dc.user1_id, dc.user2_id)
    )
    or exists(
      select 1 from public.conversation_members cm
      where cm.conversation_id=p_conversation_id and cm.user_id=private.current_profile_id()
    )
  )
$$;
create function private.can_access_message(p_message_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.messages m
    where m.id=p_message_id
      and m.deleted_at is null
      and private.is_conversation_member(m.conversation_id)
  )
$$;
-- A reply quotes exactly one message; it does not open a thread. So a reply may
-- itself be quoted, to any depth: C shows B, B shows A, and following the
-- previews walks the chain back. Nothing renders more than one level at a time,
-- so nothing needs the depth bounded.
create function private.is_valid_message_parent(p_parent_id bigint,p_conversation_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_parent_id is null or exists(
    select 1 from public.messages m
    where m.id=p_parent_id
      and m.deleted_at is null
      and m.conversation_id=p_conversation_id
  )
$$;
create function private.has_active_message_reply(p_message_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.messages where parent_id=p_message_id and deleted_at is null)
$$;
-- Which MIME types are allowed is answered by message_attachment_mime_types and
-- enforced by message_attachments' foreign key onto it. Only the ceiling on how
-- many attachments one message may carry needs a home of its own.
create function private.max_message_attachments()
returns int4 language sql immutable set search_path = '' as $$ select 10 $$;
revoke execute on function private.is_conversation_member(bigint), private.can_access_message(bigint), private.is_valid_message_parent(bigint,bigint), private.has_active_message_reply(bigint), private.max_message_attachments() from public, anon, service_role;
grant execute on function private.is_conversation_member(bigint), private.can_access_message(bigint), private.is_valid_message_parent(bigint,bigint), private.has_active_message_reply(bigint) to authenticated;

create function private.validate_message_parent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_valid_message_parent(new.parent_id,new.conversation_id) then
    raise exception 'message parent must be an active top-level message in the same chat';
  end if;
  return new;
end;
$$;

create trigger trg_validate_message_parent
before insert or update of conversation_id, parent_id on public.messages
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

  -- messages_pin_update lets any conversation member update an active
  -- message row (for pinning), which as a side effect widens row-level
  -- visibility for this UPDATE command as a whole. Column grants alone
  -- can't re-narrow that back down, so content edits are only actually
  -- authorized here: sender, within the edit window.
  if new.content is distinct from old.content
    and (old.sender_id <> private.current_profile_id() or old.created_at < now() - interval '15 minutes')
  then
    raise exception 'not allowed to edit this message';
  end if;

  if old.deleted_at is null and new.deleted_at is null and new.content is distinct from old.content then
    new.edited_at := now();
  end if;
  return new;
end;
$$;

create trigger trg_mark_message_edited
before update of content on public.messages
for each row execute function private.mark_message_edited();

-- pinned_by is trigger-derived rather than client-writable, so pinning
-- can't be spoofed as someone else and unpinning always clears it.
create function private.stamp_message_pinned_by()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.pinned_at is null then
    new.pinned_by := null;
  else
    new.pinned_by := private.current_profile_id();
  end if;
  return new;
end;
$$;

create trigger trg_stamp_message_pinned_by
before update of pinned_at on public.messages
for each row execute function private.stamp_message_pinned_by();

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

create function private.mark_chat_notification_settings_updated()
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

create trigger trg_mark_chat_notification_settings_updated
before update of muted_until, level on public.chat_notification_settings
for each row execute function private.mark_chat_notification_settings_updated();

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
      and m.conversation_id = new.conversation_id
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
before insert or update of conversation_id, last_read_message_id on public.chat_read_states
for each row execute function private.validate_chat_read_state();

create function private.add_conversation_creator_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.type = 'group' and new.created_by is not null then
    insert into public.conversation_members(conversation_id,user_id)
    values(new.id,new.created_by)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger trg_add_conversation_creator_member
after insert on public.conversations
for each row execute function private.add_conversation_creator_member();

create function private.mark_sender_chat_read()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.chat_read_states
  set last_read_message_id=new.id
  where conversation_id=new.conversation_id
    and user_id=new.sender_id
    and (last_read_message_id is null or last_read_message_id<new.id);
  if not found then
    begin
      insert into public.chat_read_states(conversation_id,user_id,last_read_message_id)
      values(new.conversation_id,new.sender_id,new.id);
    exception when unique_violation then
      update public.chat_read_states
      set last_read_message_id=new.id
      where conversation_id=new.conversation_id
        and user_id=new.sender_id
        and (last_read_message_id is null or last_read_message_id<new.id);
    end;
  end if;
  return new;
end;
$$;

create trigger trg_mark_sender_chat_read
after insert on public.messages
for each row execute function private.mark_sender_chat_read();

-- Grouping is an images-only affordance: a photo grid reads as one moment, while
-- a pdf and an mp3 sharing a bubble have neither a shared meaning nor a shared
-- renderer. Enforced on the table rather than only inside the send RPC, because
-- service_role writes never pass through that RPC.
create function private.enforce_message_attachment_shape()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from (select distinct message_id from new_rows) touched
    cross join lateral (
      select
        count(*) as total,
        count(*) filter (where mime.kind <> 'image') as non_image_count
      from public.message_attachments a
      join public.mime_types mime on mime.content_type = a.content_type
      where a.message_id = touched.message_id
    ) shape
    where shape.total > private.max_message_attachments()
      or (shape.total > 1 and shape.non_image_count > 0)
  ) then
    raise exception 'a message carries at most % attachments, and only images may share one', private.max_message_attachments();
  end if;

  return null;
end;
$$;

create trigger trg_enforce_message_attachment_shape
after insert on public.message_attachments
referencing new table as new_rows
for each statement execute function private.enforce_message_attachment_shape();

revoke execute on function private.validate_message_parent() from public, anon, authenticated, service_role;
revoke execute on function private.mark_message_edited() from public, anon, authenticated, service_role;
revoke execute on function private.stamp_message_pinned_by() from public, anon, authenticated, service_role;
revoke execute on function private.mark_message_reaction_updated() from public, anon, authenticated, service_role;
revoke execute on function private.validate_chat_read_state() from public, anon, authenticated, service_role;
revoke execute on function private.add_conversation_creator_member() from public, anon, authenticated, service_role;
revoke execute on function private.mark_sender_chat_read() from public, anon, authenticated, service_role;
revoke execute on function private.enforce_message_attachment_shape() from public, anon, authenticated, service_role;
revoke execute on function private.mark_chat_notification_settings_updated() from public, anon, authenticated, service_role;

alter table public.conversations enable row level security;
alter table public.direct_conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.message_attachment_mime_types enable row level security;
alter table public.message_attachments enable row level security;
alter table public.message_reactions enable row level security;
alter table public.chat_read_states enable row level security;
alter table public.chat_notification_settings enable row level security;
create policy conversations_select on public.conversations for select to authenticated using (private.is_conversation_member(id));
create policy conversations_insert on public.conversations for insert to authenticated with check (type='group' and created_by=private.current_profile_id() and private.is_accepted_user());
create policy direct_conversations_select on public.direct_conversations for select to authenticated using (private.is_conversation_member(conversation_id));
create policy conversation_members_select on public.conversation_members for select to authenticated using (private.is_conversation_member(conversation_id));
create policy conversation_members_insert on public.conversation_members for insert to authenticated with check (private.is_conversation_member(conversation_id) and exists(select 1 from public.conversations c where c.id=conversation_id and c.type='group') and exists(select 1 from public.profiles p where p.id=user_id and p.status='accepted' and p.deleted_at is null));
create policy messages_select on public.messages for select to authenticated using ((deleted_at is null or private.has_active_message_reply(id)) and private.is_conversation_member(conversation_id));
create policy messages_insert on public.messages for insert to authenticated with check (sender_id=private.current_profile_id() and content is not null and private.is_valid_message_parent(parent_id,conversation_id) and private.is_conversation_member(conversation_id));
create policy messages_update on public.messages for update to authenticated using (deleted_at is null and sender_id=private.current_profile_id() and created_at>=now()-interval '15 minutes' and private.is_conversation_member(conversation_id)) with check (deleted_at is null and sender_id=private.current_profile_id() and content is not null and created_at>=now()-interval '15 minutes' and private.is_conversation_member(conversation_id));
-- Pinning is open to any conversation member (not just the sender), unlike
-- content edits above. private.mark_message_edited() independently guards
-- content against this broader row-level visibility.
create policy messages_pin_update on public.messages for update to authenticated using (deleted_at is null and private.is_conversation_member(conversation_id)) with check (deleted_at is null and private.is_conversation_member(conversation_id));
-- Readable by clients on purpose: the composer builds its accept filter, its size
-- guard and its renderer choice from these rows instead of hardcoding a copy.
create policy message_attachment_mime_types_select on public.message_attachment_mime_types for select to authenticated using (private.is_accepted_user());
create policy message_attachments_select on public.message_attachments for select to authenticated using (private.can_access_message(message_id));
create policy message_reactions_select on public.message_reactions for select to authenticated using (private.can_access_message(message_id));
create policy message_reactions_insert on public.message_reactions for insert to authenticated with check (user_id=private.current_profile_id() and private.can_access_message(message_id));
create policy message_reactions_update on public.message_reactions for update to authenticated using (user_id=private.current_profile_id() and private.can_access_message(message_id)) with check (user_id=private.current_profile_id() and private.can_access_message(message_id));
create policy message_reactions_delete on public.message_reactions for delete to authenticated using (user_id=private.current_profile_id() and private.can_access_message(message_id));
create policy chat_read_states_select on public.chat_read_states for select to authenticated using (user_id=private.current_profile_id() and private.is_conversation_member(conversation_id));
create policy chat_read_states_insert on public.chat_read_states for insert to authenticated with check (user_id=private.current_profile_id() and last_read_message_id is not null and private.is_conversation_member(conversation_id));
create policy chat_read_states_update on public.chat_read_states for update to authenticated using (user_id=private.current_profile_id() and private.is_conversation_member(conversation_id)) with check (user_id=private.current_profile_id() and last_read_message_id is not null and private.is_conversation_member(conversation_id));
-- Own row only, and only for a conversation you are in. Unmuting is muted_until
-- back to null, so there is no delete.
create policy chat_notification_settings_select on public.chat_notification_settings for select to authenticated using (user_id=private.current_profile_id() and private.is_conversation_member(conversation_id));
create policy chat_notification_settings_insert on public.chat_notification_settings for insert to authenticated with check (user_id=private.current_profile_id() and private.is_conversation_member(conversation_id));
create policy chat_notification_settings_update on public.chat_notification_settings for update to authenticated using (user_id=private.current_profile_id() and private.is_conversation_member(conversation_id)) with check (user_id=private.current_profile_id() and private.is_conversation_member(conversation_id));

grant select on public.conversations, public.direct_conversations, public.conversation_members, public.messages, public.message_attachment_mime_types, public.message_attachments, public.message_reactions, public.chat_read_states, public.chat_notification_settings to authenticated;
grant insert (type,name,created_by) on public.conversations to authenticated;
grant insert (conversation_id,user_id) on public.conversation_members to authenticated;
grant insert (conversation_id,sender_id,parent_id,content) on public.messages to authenticated;
grant update (content) on public.messages to authenticated;
grant update (pinned_at) on public.messages to authenticated;
grant insert (message_id,user_id,reaction_type_id) on public.message_reactions to authenticated;
grant update (reaction_type_id) on public.message_reactions to authenticated;
grant delete on public.message_reactions to authenticated;
grant insert (conversation_id,user_id,last_read_message_id) on public.chat_read_states to authenticated;
grant update (last_read_message_id) on public.chat_read_states to authenticated;
grant insert (conversation_id,user_id,muted_until,level) on public.chat_notification_settings to authenticated;
grant update (muted_until,level) on public.chat_notification_settings to authenticated;
grant usage, select on sequence public.conversations_id_seq, public.messages_id_seq to authenticated;

grant select, insert, update, delete on public.conversations, public.direct_conversations, public.conversation_members, public.messages, public.message_attachment_mime_types, public.message_attachments, public.message_reactions, public.chat_read_states, public.chat_notification_settings to service_role;
grant usage, select on sequence public.conversations_id_seq, public.messages_id_seq, public.message_attachments_id_seq to service_role;

create function public.create_direct_conversation(p_peer_id bigint)
returns bigint language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true); u1 bigint; u2 bigint; conv_id bigint;
begin
  if p_peer_id = caller_id then raise exception 'cannot open a direct chat with yourself'; end if;
  if not exists(select 1 from public.profiles where id=p_peer_id and status='accepted' and deleted_at is null) then
    raise exception 'peer must be an accepted user';
  end if;
  u1 := least(caller_id,p_peer_id);
  u2 := greatest(caller_id,p_peer_id);
  select dc.conversation_id into conv_id from public.direct_conversations dc where dc.user1_id=u1 and dc.user2_id=u2;
  if conv_id is not null then return conv_id; end if;
  insert into public.conversations(type) values('direct') returning id into conv_id;
  begin
    insert into public.direct_conversations(conversation_id,user1_id,user2_id) values(conv_id,u1,u2);
  exception when unique_violation then
    delete from public.conversations where id=conv_id;
    select dc.conversation_id into conv_id from public.direct_conversations dc where dc.user1_id=u1 and dc.user2_id=u2;
  end;
  return conv_id;
end;
$$;

create function public.list_conversations()
returns table(
  conversation_id bigint,
  type public.conversation_type,
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
  muted_until timestamptz,
  notification_level public.notification_level,
  created_at timestamptz
) language plpgsql stable security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true);
begin
  return query
  with my_conversations as (
    select dc.conversation_id, case when dc.user1_id=caller_id then dc.user2_id else dc.user1_id end as peer_id
    from public.direct_conversations dc
    where caller_id in (dc.user1_id, dc.user2_id)
    union all
    select cm.conversation_id, null::bigint as peer_id
    from public.conversation_members cm
    where cm.user_id=caller_id
  )
  select
    c.id as conversation_id,
    c.type,
    c.name,
    case when c.type='direct' then peer.name else c.name end as display_name,
    upper(left(regexp_replace(coalesce(case when c.type='direct' then peer.name else c.name end,'?'),'\s+','','g'),2)) as display_initials,
    case when c.type='direct' then peer.avatar_url else null end as avatar_url,
    last_message.id as last_message_id,
    last_message.content as last_message_content,
    coalesce(last_message.has_attachment,false) as last_message_has_attachment,
    last_message.sender_id as last_message_sender_id,
    last_sender.name as last_message_sender_name,
    last_message.created_at as last_message_created_at,
    coalesce(unread.unread_count,0) as unread_count,
    case when c.type='direct' then 2::bigint else coalesce(member_counts.member_count,0) end as member_count,
    -- Raw, not `muted_until > now()`: this function is stable, and the caller has
    -- to re-evaluate the deadline as it passes anyway.
    settings.muted_until,
    coalesce(settings.level,'all') as notification_level,
    c.created_at
  from my_conversations mc
  join public.conversations c on c.id=mc.conversation_id
  left join public.profiles peer on peer.id=mc.peer_id
  left join lateral (
    select m.id,m.sender_id,m.content,m.created_at,
      exists(select 1 from public.message_attachments a where a.message_id=m.id) as has_attachment
    from public.messages m
    where m.conversation_id=c.id and m.deleted_at is null
    order by m.id desc
    limit 1
  ) last_message on true
  left join public.profiles last_sender on last_sender.id=last_message.sender_id
  left join public.chat_read_states read_state on read_state.conversation_id=c.id and read_state.user_id=caller_id
  left join public.chat_notification_settings settings on settings.conversation_id=c.id and settings.user_id=caller_id
  left join lateral (
    select count(*)::bigint as unread_count
    from public.messages m
    where m.conversation_id=c.id and m.deleted_at is null and m.sender_id<>caller_id
      and (read_state.last_read_message_id is null or m.id>read_state.last_read_message_id)
  ) unread on true
  left join lateral (
    select count(*)::bigint as member_count from public.conversation_members cm2 where cm2.conversation_id=c.id
  ) member_counts on true
  order by last_message.id desc nulls last, c.created_at desc, c.id desc;
end;
$$;

create function public.get_chat_messages(p_conversation_id bigint,p_before_id bigint default null,p_limit int4 default 50)
returns table(
  message_id bigint,
  conversation_id bigint,
  sender_id bigint,
  sender jsonb,
  parent_message jsonb,
  content text,
  is_edited boolean,
  edited_at timestamptz,
  deleted_at timestamptz,
  pinned_at timestamptz,
  pinned_by jsonb,
  created_at timestamptz,
  attachments jsonb,
  reactions jsonb,
  reads jsonb
) language plpgsql stable security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true);
begin
  if p_conversation_id is null then raise exception 'conversation target required'; end if;
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'limit must be between 1 and 100'; end if;
  if not private.is_conversation_member(p_conversation_id) then raise exception 'conversation membership required'; end if;

  return query
  with page as (
    select m.*
    from public.messages m
    where m.conversation_id=p_conversation_id
      and (m.deleted_at is null or exists(select 1 from public.messages child where child.parent_id=m.id and child.deleted_at is null))
      and (p_before_id is null or m.id<p_before_id)
    order by m.id desc
    limit p_limit
  )
  select
    page.id as message_id,
    page.conversation_id,
    page.sender_id,
    jsonb_build_object('id',sender.id,'name',sender.name,'avatar_url',sender.avatar_url) as sender,
    case when parent.id is null then null else jsonb_build_object('id',parent.id,'sender_id',parent.sender_id,'sender_name',parent_sender.name,'content',parent.content,'created_at',parent.created_at) end as parent_message,
    page.content,
    (page.edited_at is not null) as is_edited,
    page.edited_at,
    page.deleted_at,
    page.pinned_at,
    case when pinner.id is null then null else jsonb_build_object('id',pinner.id,'name',pinner.name) end as pinned_by,
    page.created_at,
    coalesce(attachments.items,'[]'::jsonb) as attachments,
    coalesce(reactions.items,'[]'::jsonb) as reactions,
    coalesce(reads.items,'[]'::jsonb) as reads
  from page
  join public.profiles sender on sender.id=page.sender_id
  left join public.messages parent on parent.id=page.parent_id
  left join public.profiles parent_sender on parent_sender.id=parent.sender_id
  left join public.profiles pinner on pinner.id=page.pinned_by
  left join lateral (
    select jsonb_agg(jsonb_build_object('id',a.id,'storage_bucket',a.storage_bucket,'storage_path',a.storage_path,'file_name',a.file_name,'content_type',a.content_type,'kind',mime.kind,'size_bytes',a.size_bytes,'sort_order',a.sort_order,'width',a.width,'height',a.height,'duration_ms',a.duration_ms,'created_at',a.created_at) order by a.sort_order,a.id) as items
    from public.message_attachments a
    join public.mime_types mime on mime.content_type=a.content_type
    where a.message_id=page.id
  ) attachments on true
  left join lateral (
    select jsonb_agg(jsonb_build_object('user_id',mr.user_id,'user_name',rp.name,'reaction_type_id',rt.id,'reaction_key',rt.key,'reaction_name',rt.name,'reaction_icon',rt.icon,'created_at',mr.created_at,'updated_at',mr.updated_at) order by mr.created_at,mr.user_id) as items
    from public.message_reactions mr join public.reaction_types rt on rt.id=mr.reaction_type_id join public.profiles rp on rp.id=mr.user_id
    where mr.message_id=page.id
  ) reactions on true
  left join lateral (
    select jsonb_agg(jsonb_build_object('user_id',rs.user_id,'user_name',reader.name,'read_at',rs.last_read_at) order by rs.last_read_at,rs.user_id) as items
    from public.chat_read_states rs join public.profiles reader on reader.id=rs.user_id
    where rs.conversation_id=page.conversation_id
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

create function public.search_messages(p_query text,p_conversation_id bigint)
returns table(message_id bigint,content_snippet text,sender_name text,created_at timestamptz)
language plpgsql security invoker set search_path = '' as $$
declare normalized_query text := regexp_replace(lower(btrim(p_query)), '\s+', '', 'g');
begin
  if p_conversation_id is null then raise exception 'conversation target required'; end if;
  if p_query is null or char_length(btrim(p_query)) not between 1 and 200 or normalized_query='' then raise exception 'query must contain 1 to 200 characters'; end if;
  return query select m.id,left(m.content,300),p.name,m.created_at
  from public.messages m join public.profiles p on p.id=m.sender_id
  where m.conversation_id=p_conversation_id
    and m.deleted_at is null
    and m.content is not null
    and regexp_replace(lower(m.content),'\s+','','g') ilike '%'||normalized_query||'%'
  order by m.created_at desc,m.id desc limit 50;
end;
$$;

-- p_attachments is a json array, ordered as the sender arranged them; the array
-- index becomes sort_order. Each element:
--   {storage_path, file_name, content_type, size_bytes, width?, height?, duration_ms?}
--
-- Every element is re-checked against the object actually sitting in storage,
-- because the upload happened client-side and nothing about it is trusted.
create function public.send_message_with_attachments(p_conversation_id bigint,p_attachments jsonb,p_parent_id bigint default null,p_content text default null)
returns bigint language plpgsql security definer set search_path='' as $$
declare caller_id bigint:=private.require_current_profile(true); message_id bigint; expected_prefix text:=p_conversation_id::text||'/'||(select auth.uid())::text||'/'; normalized_content text; attachment_count int4;
begin
  if not private.is_conversation_member(p_conversation_id) then raise exception 'conversation membership required'; end if;
  if not private.is_valid_message_parent(p_parent_id,p_conversation_id) then raise exception 'active parent message in chat required'; end if;
  normalized_content:=nullif(btrim(p_content),'');
  if normalized_content is not null and char_length(normalized_content)>10000 then raise exception 'message content must be 1 to 10000 characters'; end if;

  if p_attachments is null or jsonb_typeof(p_attachments)<>'array' then raise exception 'attachments must be a json array'; end if;
  attachment_count:=jsonb_array_length(p_attachments);
  if attachment_count<1 or attachment_count>private.max_message_attachments() then
    raise exception 'a message carries 1 to % attachments', private.max_message_attachments();
  end if;

  -- A content_type a message does not accept joins to nothing, so
  -- `allowed.content_type is null` is also how a disallowed MIME type is rejected.
  if exists(
    select 1
    from jsonb_array_elements(p_attachments) as item(value)
    left join public.message_attachment_mime_types allowed on allowed.content_type=item.value->>'content_type'
    where allowed.content_type is null
      or item.value->>'storage_path' is null
      or not private.has_uuid_object_suffix(item.value->>'storage_path',expected_prefix)
      or char_length(btrim(coalesce(item.value->>'file_name','')))=0
      or (item.value->>'size_bytes')::int8 is null
      or (item.value->>'size_bytes')::int8<0
      or (item.value->>'size_bytes')::int8>allowed.max_bytes
      or not exists(
        select 1 from storage.objects o
        where o.bucket_id='message-files'
          and o.name=item.value->>'storage_path'
          and o.created_at>=now()-interval '24 hours'
          and o.metadata->>'mimetype'=item.value->>'content_type'
          and (o.metadata->>'size')::int8=(item.value->>'size_bytes')::int8
      )
  ) then raise exception 'invalid message attachment'; end if;

  -- trg_enforce_message_attachment_shape re-checks this on the table. Checked
  -- here too so the caller gets the reason rather than a trigger's error.
  if attachment_count>1 and exists(
    select 1
    from jsonb_array_elements(p_attachments) as item(value)
    join public.mime_types mime on mime.content_type=item.value->>'content_type'
    where mime.kind<>'image'
  ) then raise exception 'only image attachments may share one message'; end if;

  insert into public.messages(conversation_id,sender_id,parent_id,content)
  values(p_conversation_id,caller_id,p_parent_id,normalized_content)
  returning id into message_id;

  insert into public.message_attachments(message_id,storage_bucket,storage_path,file_name,content_type,size_bytes,sort_order,width,height,duration_ms)
  select
    message_id,'message-files',
    item.value->>'storage_path',
    btrim(item.value->>'file_name'),
    item.value->>'content_type',
    (item.value->>'size_bytes')::int8,
    (item.position-1)::int4,
    (item.value->>'width')::int4,
    (item.value->>'height')::int4,
    (item.value->>'duration_ms')::int4
  from jsonb_array_elements(p_attachments) with ordinality as item(value,position);

  return message_id;
end $$;

create function public.remove_group_member(p_conversation_id bigint,p_user_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare caller_id bigint := private.require_current_profile(true);
begin
  if not exists(select 1 from public.conversations where id=p_conversation_id and type='group') then raise exception 'group conversation required'; end if;
  if caller_id<>p_user_id
    and not exists(select 1 from public.conversations where id=p_conversation_id and created_by=caller_id)
    and not exists(select 1 from public.profiles where id=caller_id and role='admin')
    then raise exception 'not allowed to remove member'; end if;
  delete from public.chat_read_states where conversation_id=p_conversation_id and user_id=p_user_id;
  delete from public.chat_notification_settings where conversation_id=p_conversation_id and user_id=p_user_id;
  delete from public.message_reactions mr using public.messages m where mr.message_id=m.id and m.conversation_id=p_conversation_id and mr.user_id=p_user_id;
  delete from public.conversation_members where conversation_id=p_conversation_id and user_id=p_user_id;
end;
$$;

revoke execute on function public.create_direct_conversation(bigint), public.list_conversations(), public.get_chat_messages(bigint,bigint,int4), public.soft_delete_message(bigint), public.search_messages(text,bigint), public.send_message_with_attachments(bigint,jsonb,bigint,text), public.remove_group_member(bigint,bigint) from public, anon, authenticated, service_role;
grant execute on function public.create_direct_conversation(bigint), public.list_conversations(), public.get_chat_messages(bigint,bigint,int4) to authenticated;
grant execute on function public.soft_delete_message(bigint) to authenticated;
grant execute on function public.search_messages(text,bigint) to authenticated;
grant execute on function public.send_message_with_attachments(bigint,jsonb,bigint,text) to authenticated;
grant execute on function public.remove_group_member(bigint,bigint) to authenticated;

create function public.cleanup_conversation(p_conversation_id bigint)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform private.require_service_role();
  if exists(select 1 from public.message_attachments a join public.messages m on m.id=a.message_id where m.conversation_id=p_conversation_id) then
    raise exception 'message attachments must be removed before purging conversation';
  end if;
  delete from public.message_reactions mr using public.messages m where mr.message_id=m.id and m.conversation_id=p_conversation_id;
  delete from public.chat_read_states where conversation_id=p_conversation_id;
  delete from public.chat_notification_settings where conversation_id=p_conversation_id;

  -- Replies nest to any depth and messages.parent_id restricts deletes, so peel
  -- the leaves off until none are left. Deleting replies then roots would only
  -- ever work for a single level.
  loop
    delete from public.messages m
    where m.conversation_id=p_conversation_id
      and not exists(select 1 from public.messages child where child.parent_id=m.id);
    exit when not found;
  end loop;
  delete from public.direct_conversations where conversation_id=p_conversation_id;
  delete from public.conversation_members where conversation_id=p_conversation_id;
  delete from public.conversations where id=p_conversation_id;
end $$;

grant execute on function public.cleanup_conversation(bigint) to service_role;
revoke execute on function public.cleanup_conversation(bigint) from public, anon, authenticated;
