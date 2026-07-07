create type "public"."conversation_type" as enum ('direct', 'group');

create sequence "public"."conversations_id_seq";

drop policy "avatars_insert" on "storage"."objects";
drop policy "message_files_insert" on "storage"."objects";
drop policy "message_files_select" on "storage"."objects";
drop policy "post_files_insert" on "storage"."objects";
drop policy "profile_covers_insert" on "storage"."objects";
drop policy "space_images_insert" on "storage"."objects";

drop trigger if exists "trg_add_chat_room_creator_member" on "public"."chat_rooms";

drop trigger if exists "trg_validate_chat_read_state" on "public"."chat_read_states";

drop trigger if exists "trg_validate_message_parent" on "public"."messages";

drop policy "chat_room_members_insert" on "public"."chat_room_members";

drop policy "chat_room_members_select" on "public"."chat_room_members";

drop policy "chat_rooms_insert" on "public"."chat_rooms";

drop policy "chat_rooms_select" on "public"."chat_rooms";

drop policy "direct_chats_insert" on "public"."direct_chats";

drop policy "direct_chats_select" on "public"."direct_chats";

drop policy "chat_read_states_insert" on "public"."chat_read_states";

drop policy "chat_read_states_select" on "public"."chat_read_states";

drop policy "chat_read_states_update" on "public"."chat_read_states";

drop policy "messages_insert" on "public"."messages";

drop policy "messages_select" on "public"."messages";

drop policy "messages_update" on "public"."messages";

revoke select on table "public"."chat_room_members" from "authenticated";

revoke delete on table "public"."chat_room_members" from "service_role";

revoke insert on table "public"."chat_room_members" from "service_role";

revoke select on table "public"."chat_room_members" from "service_role";

revoke update on table "public"."chat_room_members" from "service_role";

revoke select on table "public"."chat_rooms" from "authenticated";

revoke delete on table "public"."chat_rooms" from "service_role";

revoke insert on table "public"."chat_rooms" from "service_role";

revoke select on table "public"."chat_rooms" from "service_role";

revoke update on table "public"."chat_rooms" from "service_role";

revoke select on table "public"."direct_chats" from "authenticated";

revoke delete on table "public"."direct_chats" from "service_role";

revoke insert on table "public"."direct_chats" from "service_role";

revoke select on table "public"."direct_chats" from "service_role";

revoke update on table "public"."direct_chats" from "service_role";

alter table "public"."chat_read_states" drop constraint "chat_read_states_chat_room_id_fkey";

alter table "public"."chat_read_states" drop constraint "chat_read_states_direct_chat_id_fkey";

alter table "public"."chat_read_states" drop constraint "chat_read_states_target_check";

alter table "public"."chat_room_members" drop constraint "chat_room_members_chat_room_id_fkey";

alter table "public"."chat_room_members" drop constraint "chat_room_members_user_id_fkey";

alter table "public"."chat_rooms" drop constraint "chat_rooms_created_by_fkey";

alter table "public"."chat_rooms" drop constraint "chat_rooms_name_check";

alter table "public"."comment_reactions" drop constraint "comment_reactions_comment_user_key";

alter table "public"."direct_chats" drop constraint "direct_chats_user1_id_fkey";

alter table "public"."direct_chats" drop constraint "direct_chats_user2_id_fkey";

alter table "public"."direct_chats" drop constraint "direct_chats_users_check";

alter table "public"."direct_chats" drop constraint "direct_chats_users_key";

alter table "public"."message_reactions" drop constraint "message_reactions_message_user_key";

alter table "public"."messages" drop constraint "messages_chat_room_id_fkey";

alter table "public"."messages" drop constraint "messages_direct_chat_id_fkey";

alter table "public"."messages" drop constraint "messages_edit_state_check";

alter table "public"."messages" drop constraint "messages_target_check";

alter table "public"."post_reactions" drop constraint "post_reactions_post_user_key";

alter table "public"."posts" drop constraint "posts_pin_state_check";

drop function if exists "private"."add_chat_room_creator_member"();

drop function if exists "private"."is_direct_chat_member"(p_direct_chat_id bigint);

drop function if exists "private"."is_room_member"(p_chat_room_id bigint);

drop function if exists "private"."is_valid_message_parent"(p_parent_id bigint, p_direct_chat_id bigint, p_chat_room_id bigint);

drop function if exists "public"."cleanup_direct_chat"(p_direct_chat_id bigint);

drop function if exists "public"."get_chat_messages"(p_direct_chat_id bigint, p_chat_room_id bigint, p_before_id bigint, p_limit integer);

drop function if exists "public"."list_chat_rooms"();

drop function if exists "public"."remove_group_member"(p_chat_room_id bigint, p_user_id bigint);

drop function if exists "public"."search_messages"(p_query text, p_direct_chat_id bigint, p_chat_room_id bigint);

drop function if exists "public"."send_direct_message_with_attachment"(p_direct_chat_id bigint, p_storage_path text, p_file_name text, p_content_type text, p_size_bytes bigint, p_parent_id bigint, p_content text, p_width integer, p_height integer);

drop function if exists "public"."send_room_message_with_attachment"(p_chat_room_id bigint, p_storage_path text, p_file_name text, p_content_type text, p_size_bytes bigint, p_parent_id bigint, p_content text, p_width integer, p_height integer);

alter table "public"."chat_room_members" drop constraint "chat_room_members_pkey";

alter table "public"."chat_rooms" drop constraint "chat_rooms_pkey";

alter table "public"."direct_chats" drop constraint "direct_chats_pkey";

alter table "public"."chat_read_states" drop constraint "chat_read_states_pkey";

alter table "public"."comment_reactions" drop constraint "comment_reactions_pkey";

alter table "public"."message_reactions" drop constraint "message_reactions_pkey";

alter table "public"."post_reactions" drop constraint "post_reactions_pkey";

drop index if exists "public"."chat_read_states_direct_user_key";

drop index if exists "public"."chat_read_states_room_user_key";

drop index if exists "public"."chat_room_members_pkey";

drop index if exists "public"."chat_rooms_pkey";

drop index if exists "public"."comment_reactions_comment_user_key";

drop index if exists "public"."direct_chats_pkey";

drop index if exists "public"."direct_chats_users_key";

drop index if exists "public"."idx_chat_room_members_user_joined_at";

drop index if exists "public"."idx_chat_room_members_user_room";

drop index if exists "public"."idx_direct_chats_user1_created_at";

drop index if exists "public"."idx_direct_chats_user2_created_at";

drop index if exists "public"."idx_messages_active_chat_room_id";

drop index if exists "public"."idx_messages_active_direct_chat_id";

drop index if exists "public"."message_reactions_message_user_key";

drop index if exists "public"."post_reactions_post_user_key";

drop index if exists "public"."chat_read_states_pkey";

drop index if exists "public"."comment_reactions_pkey";

drop index if exists "public"."idx_posts_pinned";

drop index if exists "public"."message_reactions_pkey";

drop index if exists "public"."post_reactions_pkey";

drop table "public"."chat_room_members";

drop table "public"."chat_rooms";

drop table "public"."direct_chats";


  create table "public"."conversation_members" (
    "conversation_id" bigint not null,
    "user_id" bigint not null,
    "joined_at" timestamp with time zone not null default now()
      );


alter table "public"."conversation_members" enable row level security;


  create table "public"."conversations" (
    "id" bigint not null default nextval('public.conversations_id_seq'::regclass),
    "type" public.conversation_type not null,
    "name" text,
    "created_by" bigint,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."conversations" enable row level security;


  create table "public"."direct_conversations" (
    "conversation_id" bigint not null,
    "user1_id" bigint not null,
    "user2_id" bigint not null
      );


alter table "public"."direct_conversations" enable row level security;

alter table "public"."chat_read_states" drop column "chat_room_id";

alter table "public"."chat_read_states" drop column "created_at";

alter table "public"."chat_read_states" drop column "direct_chat_id";

alter table "public"."chat_read_states" drop column "id";

alter table "public"."chat_read_states" add column "conversation_id" bigint not null;

alter table "public"."comment_reactions" drop column "id";

alter table "public"."message_reactions" drop column "id";

alter table "public"."messages" drop column "chat_room_id";

alter table "public"."messages" drop column "direct_chat_id";

alter table "public"."messages" drop column "is_edited";

alter table "public"."messages" add column "conversation_id" bigint not null;

alter table "public"."post_reactions" drop column "id";

alter table "public"."posts" drop column "is_pinned";

alter sequence "public"."conversations_id_seq" owned by "public"."conversations"."id";

drop sequence if exists "public"."chat_read_states_id_seq";

drop sequence if exists "public"."chat_rooms_id_seq";

drop sequence if exists "public"."comment_reactions_id_seq";

drop sequence if exists "public"."direct_chats_id_seq";

drop sequence if exists "public"."message_reactions_id_seq";

drop sequence if exists "public"."post_reactions_id_seq";

CREATE UNIQUE INDEX conversation_members_pkey ON public.conversation_members USING btree (conversation_id, user_id);

CREATE UNIQUE INDEX conversations_pkey ON public.conversations USING btree (id);

CREATE UNIQUE INDEX direct_conversations_pkey ON public.direct_conversations USING btree (conversation_id);

CREATE UNIQUE INDEX direct_conversations_users_key ON public.direct_conversations USING btree (user1_id, user2_id);

CREATE INDEX idx_conversation_members_user ON public.conversation_members USING btree (user_id, conversation_id);

CREATE INDEX idx_direct_conversations_user1 ON public.direct_conversations USING btree (user1_id);

CREATE INDEX idx_direct_conversations_user2 ON public.direct_conversations USING btree (user2_id);

CREATE INDEX idx_messages_active_conversation_id ON public.messages USING btree (conversation_id, id DESC) WHERE (deleted_at IS NULL);

CREATE UNIQUE INDEX chat_read_states_pkey ON public.chat_read_states USING btree (conversation_id, user_id);

CREATE UNIQUE INDEX comment_reactions_pkey ON public.comment_reactions USING btree (comment_id, user_id);

CREATE INDEX idx_posts_pinned ON public.posts USING btree (space_id, pinned_at DESC) WHERE ((pinned_at IS NOT NULL) AND (deleted_at IS NULL));

CREATE UNIQUE INDEX message_reactions_pkey ON public.message_reactions USING btree (message_id, user_id);

CREATE UNIQUE INDEX post_reactions_pkey ON public.post_reactions USING btree (post_id, user_id);

alter table "public"."conversation_members" add constraint "conversation_members_pkey" PRIMARY KEY using index "conversation_members_pkey";

alter table "public"."conversations" add constraint "conversations_pkey" PRIMARY KEY using index "conversations_pkey";

alter table "public"."direct_conversations" add constraint "direct_conversations_pkey" PRIMARY KEY using index "direct_conversations_pkey";

alter table "public"."chat_read_states" add constraint "chat_read_states_pkey" PRIMARY KEY using index "chat_read_states_pkey";

alter table "public"."comment_reactions" add constraint "comment_reactions_pkey" PRIMARY KEY using index "comment_reactions_pkey";

alter table "public"."message_reactions" add constraint "message_reactions_pkey" PRIMARY KEY using index "message_reactions_pkey";

alter table "public"."post_reactions" add constraint "post_reactions_pkey" PRIMARY KEY using index "post_reactions_pkey";

alter table "public"."chat_read_states" add constraint "chat_read_states_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE RESTRICT not valid;

alter table "public"."chat_read_states" validate constraint "chat_read_states_conversation_id_fkey";

alter table "public"."conversation_members" add constraint "conversation_members_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE RESTRICT not valid;

alter table "public"."conversation_members" validate constraint "conversation_members_conversation_id_fkey";

alter table "public"."conversation_members" add constraint "conversation_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE RESTRICT not valid;

alter table "public"."conversation_members" validate constraint "conversation_members_user_id_fkey";

alter table "public"."conversations" add constraint "conversations_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."conversations" validate constraint "conversations_created_by_fkey";

alter table "public"."conversations" add constraint "conversations_shape_check" CHECK ((((type = 'group'::public.conversation_type) AND (name IS NOT NULL) AND ((char_length(btrim(name)) >= 1) AND (char_length(btrim(name)) <= 100))) OR ((type = 'direct'::public.conversation_type) AND (name IS NULL)))) not valid;

alter table "public"."conversations" validate constraint "conversations_shape_check";

alter table "public"."direct_conversations" add constraint "direct_conversations_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE RESTRICT not valid;

alter table "public"."direct_conversations" validate constraint "direct_conversations_conversation_id_fkey";

alter table "public"."direct_conversations" add constraint "direct_conversations_user1_id_fkey" FOREIGN KEY (user1_id) REFERENCES public.profiles(id) ON DELETE RESTRICT not valid;

alter table "public"."direct_conversations" validate constraint "direct_conversations_user1_id_fkey";

alter table "public"."direct_conversations" add constraint "direct_conversations_user2_id_fkey" FOREIGN KEY (user2_id) REFERENCES public.profiles(id) ON DELETE RESTRICT not valid;

alter table "public"."direct_conversations" validate constraint "direct_conversations_user2_id_fkey";

alter table "public"."direct_conversations" add constraint "direct_conversations_users_check" CHECK ((user1_id < user2_id)) not valid;

alter table "public"."direct_conversations" validate constraint "direct_conversations_users_check";

alter table "public"."direct_conversations" add constraint "direct_conversations_users_key" UNIQUE using index "direct_conversations_users_key";

alter table "public"."messages" add constraint "messages_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE RESTRICT not valid;

alter table "public"."messages" validate constraint "messages_conversation_id_fkey";

alter table "public"."posts" add constraint "posts_pin_state_check" CHECK (((pinned_at IS NOT NULL) OR (pinned_by IS NULL))) not valid;

alter table "public"."posts" validate constraint "posts_pin_state_check";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.add_conversation_creator_member()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.type = 'group' and new.created_by is not null then
    insert into public.conversation_members(conversation_id,user_id)
    values(new.id,new.created_by)
    on conflict do nothing;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.anonymize_profile(p_profile_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  update public.profiles
  set name = '탈퇴한 사용자',
      role = 'user',
      student_number = null,
      class_no = null,
      cohort = null,
      gender = null,
      track = null,
      department = null,
      phone_number = null,
      avatar_url = null,
      cover_image_url = null,
      birthday = null,
      description = null,
      status = 'withdrawn',
      dorm_room = null,
      is_reenrolled = false,
      status_updated_at = now(),
      status_updated_by = null,
      deleted_at = now()
  where id = p_profile_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.has_uuid_object_suffix(p_name text, p_prefix text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select p_name ~ ('^' || p_prefix || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
$function$
;

CREATE OR REPLACE FUNCTION private.is_allowed_message_mime(p_content_type text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select p_content_type in (
    'image/jpeg','image/png','image/webp','application/pdf','text/plain','text/markdown','text/csv','application/rtf',
    'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/x-hwp','application/x-hwpx','application/haansofthwp','application/haansofthwpx',
    'application/vnd.hancom.hwp','application/vnd.hancom.hwpx',
    'application/vnd.oasis.opendocument.text','application/vnd.oasis.opendocument.spreadsheet','application/vnd.oasis.opendocument.presentation'
  )
$function$
;

CREATE OR REPLACE FUNCTION private.is_conversation_member(p_conversation_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION private.is_valid_message_parent(p_parent_id bigint, p_conversation_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p_parent_id is null or exists(
    select 1 from public.messages m
    where m.id=p_parent_id
      and m.parent_id is null
      and m.deleted_at is null
      and m.conversation_id=p_conversation_id
  )
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_conversation(p_conversation_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.require_service_role();
  if exists(select 1 from public.message_attachments a join public.messages m on m.id=a.message_id where m.conversation_id=p_conversation_id) then
    raise exception 'message attachments must be removed before purging conversation';
  end if;
  delete from public.message_reactions mr using public.messages m where mr.message_id=m.id and m.conversation_id=p_conversation_id;
  delete from public.chat_read_states where conversation_id=p_conversation_id;
  delete from public.messages where conversation_id=p_conversation_id and parent_id is not null;
  delete from public.messages where conversation_id=p_conversation_id;
  delete from public.direct_conversations where conversation_id=p_conversation_id;
  delete from public.conversation_members where conversation_id=p_conversation_id;
  delete from public.conversations where id=p_conversation_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.create_direct_conversation(p_peer_id bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_chat_messages(p_conversation_id bigint, p_before_id bigint DEFAULT NULL::bigint, p_limit integer DEFAULT 50)
 RETURNS TABLE(message_id bigint, conversation_id bigint, sender_id bigint, sender jsonb, parent_message jsonb, content text, is_edited boolean, edited_at timestamp with time zone, deleted_at timestamp with time zone, created_at timestamp with time zone, attachments jsonb, reactions jsonb, reads jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.list_conversations()
 RETURNS TABLE(conversation_id bigint, type public.conversation_type, name text, display_name text, display_initials text, avatar_url text, last_message_id bigint, last_message_content text, last_message_has_attachment boolean, last_message_sender_id bigint, last_message_sender_name text, last_message_created_at timestamp with time zone, unread_count bigint, member_count bigint, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.remove_group_member(p_conversation_id bigint, p_user_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller_id bigint := private.require_current_profile(true);
begin
  if not exists(select 1 from public.conversations where id=p_conversation_id and type='group') then raise exception 'group conversation required'; end if;
  if caller_id<>p_user_id
    and not exists(select 1 from public.conversations where id=p_conversation_id and created_by=caller_id)
    and not exists(select 1 from public.profiles where id=caller_id and role='admin')
    then raise exception 'not allowed to remove member'; end if;
  delete from public.chat_read_states where conversation_id=p_conversation_id and user_id=p_user_id;
  delete from public.message_reactions mr using public.messages m where mr.message_id=m.id and m.conversation_id=p_conversation_id and mr.user_id=p_user_id;
  delete from public.conversation_members where conversation_id=p_conversation_id and user_id=p_user_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.search_messages(p_query text, p_conversation_id bigint)
 RETURNS TABLE(message_id bigint, content_snippet text, sender_name text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.send_message_with_attachment(p_conversation_id bigint, p_storage_path text, p_file_name text, p_content_type text, p_size_bytes bigint, p_parent_id bigint DEFAULT NULL::bigint, p_content text DEFAULT NULL::text, p_width integer DEFAULT NULL::integer, p_height integer DEFAULT NULL::integer)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller_id bigint:=private.require_current_profile(true); message_id bigint; expected_prefix text:=p_conversation_id::text||'/'||(select auth.uid())::text||'/'; normalized_content text;
begin
  if not private.is_conversation_member(p_conversation_id) then raise exception 'conversation membership required'; end if;
  if not private.is_valid_message_parent(p_parent_id,p_conversation_id) then raise exception 'active parent message in chat required'; end if;
  normalized_content:=nullif(btrim(p_content),'');
  if normalized_content is not null and char_length(normalized_content)>10000 then raise exception 'message content must be 1 to 10000 characters'; end if;
  if p_storage_path is null or not private.has_uuid_object_suffix(p_storage_path,expected_prefix)
    or not private.is_allowed_message_mime(p_content_type) or p_size_bytes>25000000
    or not exists(select 1 from storage.objects where bucket_id='message-files' and name=p_storage_path and created_at>=now()-interval '24 hours' and metadata->>'mimetype'=p_content_type and (metadata->>'size')::int8=p_size_bytes)
  then raise exception 'invalid message attachment'; end if;

  insert into public.messages(conversation_id,sender_id,parent_id,content)
  values(p_conversation_id,caller_id,p_parent_id,normalized_content)
  returning id into message_id;

  insert into public.message_attachments(message_id,storage_bucket,storage_path,file_name,content_type,size_bytes,sort_order,width,height)
  values(message_id,'message-files',p_storage_path,p_file_name,p_content_type,p_size_bytes,0,p_width,p_height);

  return message_id;
end $function$
;

CREATE OR REPLACE FUNCTION private.can_access_message(p_message_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists(
    select 1 from public.messages m
    where m.id=p_message_id
      and m.deleted_at is null
      and private.is_conversation_member(m.conversation_id)
  )
$function$
;

CREATE OR REPLACE FUNCTION private.handle_auth_user_deleted()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  perform private.anonymize_profile(profile_id);

  return old;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.mark_message_edited()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.content is not null then
    new.content := nullif(btrim(new.content), '');
  end if;
  if old.deleted_at is null and new.deleted_at is null and new.content is distinct from old.content then
    new.edited_at := now();
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.mark_sender_chat_read()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION private.validate_chat_read_state()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION private.validate_message_parent()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.is_valid_message_parent(new.parent_id,new.conversation_id) then
    raise exception 'message parent must be an active top-level message in the same chat';
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.finalize_avatar(p_storage_path text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller_id bigint:=private.require_current_profile(false); expected_prefix text:=(select auth.uid())::text||'/';
begin
  if not private.has_uuid_object_suffix(p_storage_path,expected_prefix)
    or not exists(select 1 from storage.objects where bucket_id='avatars' and name=p_storage_path and created_at>=now()-interval '24 hours' and coalesce(metadata->>'mimetype','') in ('image/jpeg','image/png','image/webp'))
    then raise exception 'invalid avatar object'; end if;
  update public.profiles set avatar_url=p_storage_path where id=caller_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.finalize_cover_image(p_storage_path text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller_id bigint:=private.require_current_profile(false); expected_prefix text:=(select auth.uid())::text||'/';
begin
  if not private.has_uuid_object_suffix(p_storage_path,expected_prefix)
    or not exists(select 1 from storage.objects where bucket_id='profile-covers' and name=p_storage_path and created_at>=now()-interval '24 hours' and coalesce(metadata->>'mimetype','') in ('image/jpeg','image/png','image/webp'))
    then raise exception 'invalid cover image object'; end if;
  update public.profiles set cover_image_url=p_storage_path where id=caller_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.withdraw_profile()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller_id bigint := private.require_current_profile(true);
begin
  perform 1 from public.profiles where id=caller_id for update;
  if exists(select 1 from public.profiles where id=caller_id and role='admin') or exists(select 1 from public.space_members sm join public.spaces s on s.id=sm.space_id where sm.user_id=caller_id and sm.role='owner' and s.deleted_at is null)
    then raise exception 'transfer owner/admin responsibilities first'; end if;
  perform private.anonymize_profile(caller_id);
end;
$function$
;

grant select on table "public"."conversation_members" to "authenticated";

grant delete on table "public"."conversation_members" to "service_role";

grant insert on table "public"."conversation_members" to "service_role";

grant select on table "public"."conversation_members" to "service_role";

grant update on table "public"."conversation_members" to "service_role";

grant select on table "public"."conversations" to "authenticated";

grant delete on table "public"."conversations" to "service_role";

grant insert on table "public"."conversations" to "service_role";

grant select on table "public"."conversations" to "service_role";

grant update on table "public"."conversations" to "service_role";

grant select on table "public"."direct_conversations" to "authenticated";

grant delete on table "public"."direct_conversations" to "service_role";

grant insert on table "public"."direct_conversations" to "service_role";

grant select on table "public"."direct_conversations" to "service_role";

grant update on table "public"."direct_conversations" to "service_role";


  create policy "conversation_members_insert"
  on "public"."conversation_members"
  as permissive
  for insert
  to authenticated
with check ((private.is_conversation_member(conversation_id) AND (EXISTS ( SELECT 1
   FROM public.conversations c
  WHERE ((c.id = conversation_members.conversation_id) AND (c.type = 'group'::public.conversation_type)))) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = conversation_members.user_id) AND (p.status = 'accepted'::public.profile_status) AND (p.deleted_at IS NULL))))));



  create policy "conversation_members_select"
  on "public"."conversation_members"
  as permissive
  for select
  to authenticated
using (private.is_conversation_member(conversation_id));



  create policy "conversations_insert"
  on "public"."conversations"
  as permissive
  for insert
  to authenticated
with check (((type = 'group'::public.conversation_type) AND (created_by = private.current_profile_id()) AND private.is_accepted_user()));



  create policy "conversations_select"
  on "public"."conversations"
  as permissive
  for select
  to authenticated
using (private.is_conversation_member(id));



  create policy "direct_conversations_select"
  on "public"."direct_conversations"
  as permissive
  for select
  to authenticated
using (private.is_conversation_member(conversation_id));



  create policy "chat_read_states_insert"
  on "public"."chat_read_states"
  as permissive
  for insert
  to authenticated
with check (((user_id = private.current_profile_id()) AND (last_read_message_id IS NOT NULL) AND private.is_conversation_member(conversation_id)));



  create policy "chat_read_states_select"
  on "public"."chat_read_states"
  as permissive
  for select
  to authenticated
using (((user_id = private.current_profile_id()) AND private.is_conversation_member(conversation_id)));



  create policy "chat_read_states_update"
  on "public"."chat_read_states"
  as permissive
  for update
  to authenticated
using (((user_id = private.current_profile_id()) AND private.is_conversation_member(conversation_id)))
with check (((user_id = private.current_profile_id()) AND (last_read_message_id IS NOT NULL) AND private.is_conversation_member(conversation_id)));



  create policy "messages_insert"
  on "public"."messages"
  as permissive
  for insert
  to authenticated
with check (((sender_id = private.current_profile_id()) AND (content IS NOT NULL) AND private.is_valid_message_parent(parent_id, conversation_id) AND private.is_conversation_member(conversation_id)));



  create policy "messages_select"
  on "public"."messages"
  as permissive
  for select
  to authenticated
using ((((deleted_at IS NULL) OR private.has_active_message_reply(id)) AND private.is_conversation_member(conversation_id)));



  create policy "messages_update"
  on "public"."messages"
  as permissive
  for update
  to authenticated
using (((deleted_at IS NULL) AND (sender_id = private.current_profile_id()) AND (created_at >= (now() - '00:15:00'::interval)) AND private.is_conversation_member(conversation_id)))
with check (((deleted_at IS NULL) AND (sender_id = private.current_profile_id()) AND (content IS NOT NULL) AND (created_at >= (now() - '00:15:00'::interval)) AND private.is_conversation_member(conversation_id)));


CREATE TRIGGER trg_add_conversation_creator_member AFTER INSERT ON public.conversations FOR EACH ROW EXECUTE FUNCTION private.add_conversation_creator_member();

CREATE TRIGGER trg_validate_chat_read_state BEFORE INSERT OR UPDATE OF conversation_id, last_read_message_id ON public.chat_read_states FOR EACH ROW EXECUTE FUNCTION private.validate_chat_read_state();

CREATE TRIGGER trg_validate_message_parent BEFORE INSERT OR UPDATE OF conversation_id, parent_id ON public.messages FOR EACH ROW EXECUTE FUNCTION private.validate_message_parent();


  create policy "avatars_insert"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'avatars'::text) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.auth_user_id = ( SELECT auth.uid() AS uid)) AND (p.deleted_at IS NULL)))) AND private.has_uuid_object_suffix(name, ((( SELECT auth.uid() AS uid))::text || '/'::text))));



  create policy "message_files_insert"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'message-files'::text) AND (split_part(name, '/'::text, 2) = (( SELECT auth.uid() AS uid))::text) AND (EXISTS ( SELECT 1
   FROM public.conversations c
  WHERE (((c.id)::text = split_part(objects.name, '/'::text, 1)) AND private.is_conversation_member(c.id) AND private.has_uuid_object_suffix(objects.name, ((((c.id)::text || '/'::text) || (( SELECT auth.uid() AS uid))::text) || '/'::text)))))));



  create policy "message_files_select"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = 'message-files'::text) AND ((EXISTS ( SELECT 1
   FROM public.message_attachments a
  WHERE ((a.storage_path = objects.name) AND private.can_access_message(a.message_id)))) OR ((split_part(name, '/'::text, 2) = (( SELECT auth.uid() AS uid))::text) AND (EXISTS ( SELECT 1
   FROM public.conversations c
  WHERE (((c.id)::text = split_part(objects.name, '/'::text, 1)) AND private.is_conversation_member(c.id) AND private.has_uuid_object_suffix(objects.name, ((((c.id)::text || '/'::text) || (( SELECT auth.uid() AS uid))::text) || '/'::text)))))))));



  create policy "post_files_insert"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'post-files'::text) AND (split_part(name, '/'::text, 2) = (( SELECT auth.uid() AS uid))::text) AND (EXISTS ( SELECT 1
   FROM public.posts p
  WHERE (((p.pub_id)::text = split_part(objects.name, '/'::text, 1)) AND (p.author_id = private.current_profile_id()) AND (p.deleted_at IS NULL) AND private.can_access_post(p.id) AND private.has_uuid_object_suffix(objects.name, ((((p.pub_id)::text || '/'::text) || (( SELECT auth.uid() AS uid))::text) || '/'::text)))))));



  create policy "profile_covers_insert"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'profile-covers'::text) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.auth_user_id = ( SELECT auth.uid() AS uid)) AND (p.deleted_at IS NULL)))) AND private.has_uuid_object_suffix(name, ((( SELECT auth.uid() AS uid))::text || '/'::text))));



  create policy "space_images_insert"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'space-images'::text) AND (EXISTS ( SELECT 1
   FROM public.spaces s
  WHERE (((s.pub_id)::text = split_part(objects.name, '/'::text, 1)) AND (s.deleted_at IS NULL) AND private.can_manage_space(s.id) AND private.has_uuid_object_suffix(objects.name, ((s.pub_id)::text || '/'::text)))))));





-- Column- and sequence-level grants for the new conversation objects
-- (migra does not reliably emit these for newly created tables/columns).
grant select on public.conversations, public.direct_conversations, public.conversation_members, public.messages, public.message_attachments, public.message_reactions, public.chat_read_states to authenticated;
grant insert (type,name,created_by) on public.conversations to authenticated;
grant insert (conversation_id,user_id) on public.conversation_members to authenticated;
grant insert (conversation_id,sender_id,parent_id,content) on public.messages to authenticated;
grant update (content) on public.messages to authenticated;
grant insert (message_id,user_id,reaction_type_id) on public.message_reactions to authenticated;
grant update (reaction_type_id) on public.message_reactions to authenticated;
grant delete on public.message_reactions to authenticated;
grant insert (conversation_id,user_id,last_read_message_id) on public.chat_read_states to authenticated;
grant update (last_read_message_id) on public.chat_read_states to authenticated;
grant usage, select on sequence public.conversations_id_seq, public.messages_id_seq to authenticated;

grant select, insert, update, delete on public.conversations, public.direct_conversations, public.conversation_members, public.messages, public.message_attachments, public.message_reactions, public.chat_read_states to service_role;
grant usage, select on sequence public.conversations_id_seq, public.messages_id_seq, public.message_attachments_id_seq to service_role;

-- Strip default PUBLIC execute from the newly created chat RPCs (migra emits the grants but not the revokes).
revoke execute on function public.create_direct_conversation(bigint), public.list_conversations(), public.get_chat_messages(bigint,bigint,int4), public.soft_delete_message(bigint), public.search_messages(text,bigint), public.send_message_with_attachment(bigint,text,text,text,int8,bigint,text,int4,int4), public.remove_group_member(bigint,bigint), public.cleanup_conversation(bigint) from public, anon, authenticated, service_role;
grant execute on function public.create_direct_conversation(bigint), public.list_conversations(), public.get_chat_messages(bigint,bigint,int4), public.soft_delete_message(bigint), public.search_messages(text,bigint), public.send_message_with_attachment(bigint,text,text,text,int8,bigint,text,int4,int4), public.remove_group_member(bigint,bigint) to authenticated;
grant execute on function public.cleanup_conversation(bigint) to service_role;
