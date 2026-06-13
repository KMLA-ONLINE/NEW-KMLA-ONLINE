create table public.chat_rooms (
  id bigserial primary key,
  name text null,
  is_group boolean not null default false,
  created_by bigint null references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.direct_chat_pairs (
  room_id bigint primary key references public.chat_rooms (id) on delete restrict,
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
  content text not null,
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

create table public.message_reads (
  message_id bigint not null references public.messages (id) on delete restrict,
  user_id bigint not null references public.profiles (id) on delete restrict,
  read_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create table public.chat_room_read_states (
  room_id bigint not null references public.chat_rooms (id) on delete restrict,
  user_id bigint not null references public.profiles (id) on delete restrict,
  last_read_message_id bigint null references public.messages (id) on delete restrict,
  last_read_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
