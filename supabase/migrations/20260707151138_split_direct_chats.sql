drop trigger if exists "trg_validate_direct_chat_member" on "public"."chat_room_members";

drop trigger if exists "trg_validate_chat_read_state" on "public"."chat_room_read_states";

drop trigger if exists "trg_validate_direct_chat_room" on "public"."chat_rooms";

drop trigger if exists "trg_validate_direct_chat_pair" on "public"."direct_chat_pairs";

drop trigger if exists "trg_validate_message_parent" on "public"."messages";

drop policy "chat_room_read_states_insert" on "public"."chat_room_read_states";

drop policy "chat_room_read_states_select" on "public"."chat_room_read_states";

drop policy "chat_room_read_states_update" on "public"."chat_room_read_states";

drop policy "direct_chat_pairs_select" on "public"."direct_chat_pairs";

drop policy "chat_room_members_select" on "public"."chat_room_members";

drop policy "messages_select" on "public"."messages";

drop policy "messages_update" on "public"."messages";

drop policy if exists "chat_rooms_select" on "public"."chat_rooms";

drop policy if exists "message_files_insert" on "storage"."objects";

drop policy if exists "message_files_select" on "storage"."objects";

alter table "public"."chat_room_members" drop constraint "chat_room_members_room_id_fkey";

alter table "public"."chat_room_read_states" drop constraint "chat_room_read_states_last_read_message_id_fkey";

alter table "public"."chat_room_read_states" drop constraint "chat_room_read_states_room_id_fkey";

alter table "public"."chat_room_read_states" drop constraint "chat_room_read_states_user_id_fkey";

alter table "public"."direct_chat_pairs" drop constraint "direct_chat_pairs_room_id_fkey";

alter table "public"."direct_chat_pairs" drop constraint "direct_chat_pairs_user1_id_fkey";

alter table "public"."direct_chat_pairs" drop constraint "direct_chat_pairs_user2_id_fkey";

alter table "public"."direct_chat_pairs" drop constraint "direct_chat_pairs_users_check";

alter table "public"."direct_chat_pairs" drop constraint "direct_chat_pairs_users_key";

alter table "public"."messages" drop constraint "messages_room_id_fkey";

alter table "public"."chat_rooms" drop constraint "chat_rooms_name_check";

drop function if exists "private"."is_room_member"(p_room_id bigint);

drop function if exists "private"."is_valid_message_parent"(p_parent_id bigint, p_room_id bigint);

drop function if exists "private"."validate_direct_chat"();

drop function if exists "private"."validate_direct_chat_room"();

drop function if exists "public"."add_group_member"(p_room_id bigint, p_user_id bigint);

drop function if exists "public"."cleanup_direct_chat_room"(p_room_id bigint);

drop function if exists "public"."create_direct_chat"(p_other_user_id bigint);

drop function if exists "public"."create_group_chat"(p_name text);

drop function if exists "public"."create_group_chat_with_members"(p_name text, p_member_ids bigint[]);

drop function if exists "public"."get_chat_messages"(p_room_id bigint, p_before_id bigint, p_limit integer);

drop function if exists "public"."remove_group_member"(p_room_id bigint, p_user_id bigint);

drop function if exists "public"."search_messages"(p_query text, p_room_id bigint);

drop function if exists "public"."send_message"(p_room_id bigint, p_content text, p_parent_id bigint);

drop function if exists "public"."send_message_with_attachment"(p_room_id bigint, p_storage_path text, p_file_name text, p_content_type text, p_size_bytes bigint, p_parent_id bigint, p_content text, p_width integer, p_height integer);

drop function if exists "public"."list_chat_rooms"();

alter table "public"."chat_room_read_states" drop constraint "chat_room_read_states_pkey";

alter table "public"."direct_chat_pairs" drop constraint "direct_chat_pairs_pkey";

alter table "public"."chat_room_members" drop constraint "chat_room_members_pkey";

drop index if exists "public"."chat_room_read_states_pkey";

drop index if exists "public"."direct_chat_pairs_pkey";

drop index if exists "public"."direct_chat_pairs_users_key";

drop index if exists "public"."idx_chat_room_read_states_user_last_read_at";

drop index if exists "public"."idx_direct_chat_pairs_user1_created_at";

drop index if exists "public"."idx_direct_chat_pairs_user2_created_at";

drop index if exists "public"."idx_messages_active_room_id";

drop index if exists "public"."chat_room_members_pkey";

drop index if exists "public"."idx_chat_room_members_user_room";

create table "public"."direct_chats" (
  "id" bigserial primary key,
  "user1_id" bigint not null references public.profiles(id) on delete restrict,
  "user2_id" bigint not null references public.profiles(id) on delete restrict,
  "created_at" timestamp with time zone not null default now(),
  constraint "direct_chats_users_check" check (user1_id < user2_id),
  constraint "direct_chats_users_key" unique (user1_id, user2_id)
);

alter table "public"."direct_chats" enable row level security;

insert into public.direct_chats(id,user1_id,user2_id,created_at)
select dcp.room_id,dcp.user1_id,dcp.user2_id,cr.created_at
from public.direct_chat_pairs dcp
join public.chat_rooms cr on cr.id=dcp.room_id;

select setval('public.direct_chats_id_seq',coalesce((select max(id) from public.direct_chats),0)+1,false);

alter table "public"."messages" add column "direct_chat_id" bigint;
alter table "public"."messages" add column "chat_room_id" bigint;
update public.messages m
set direct_chat_id=m.room_id
where exists(select 1 from public.direct_chat_pairs dcp where dcp.room_id=m.room_id);
update public.messages m
set chat_room_id=m.room_id
where direct_chat_id is null;
alter table "public"."messages" drop column "room_id";

alter table "public"."chat_room_read_states" rename to "chat_read_states";
alter table "public"."chat_read_states" rename column "room_id" to "chat_room_id";
alter table "public"."chat_read_states" add column "id" bigserial;
alter table "public"."chat_read_states" add column "direct_chat_id" bigint;
alter table "public"."chat_read_states" add column "created_at" timestamp with time zone not null default now();
update public.chat_read_states rs
set direct_chat_id=rs.chat_room_id,
    chat_room_id=null
where exists(select 1 from public.direct_chat_pairs dcp where dcp.room_id=rs.chat_room_id);
alter table "public"."chat_read_states" add constraint "chat_read_states_pkey" primary key (id);

delete from public.chat_room_members crm
using public.direct_chat_pairs dcp
where crm.room_id=dcp.room_id;
alter table "public"."chat_room_members" rename column "room_id" to "chat_room_id";

delete from public.chat_rooms cr
using public.direct_chat_pairs dcp
where cr.id=dcp.room_id;
drop table "public"."direct_chat_pairs";

alter table "public"."chat_rooms" drop column "is_group";
alter table "public"."chat_rooms" alter column "name" set not null;

CREATE UNIQUE INDEX chat_read_states_direct_user_key ON public.chat_read_states USING btree (direct_chat_id, user_id) WHERE (direct_chat_id IS NOT NULL);

CREATE UNIQUE INDEX chat_read_states_room_user_key ON public.chat_read_states USING btree (chat_room_id, user_id) WHERE (chat_room_id IS NOT NULL);

CREATE INDEX idx_chat_read_states_user_last_read_at ON public.chat_read_states USING btree (user_id, last_read_at);

CREATE INDEX idx_direct_chats_user1_created_at ON public.direct_chats USING btree (user1_id, created_at);

CREATE INDEX idx_direct_chats_user2_created_at ON public.direct_chats USING btree (user2_id, created_at);

CREATE INDEX idx_messages_active_chat_room_id ON public.messages USING btree (chat_room_id, id DESC) WHERE ((deleted_at IS NULL) AND (chat_room_id IS NOT NULL));

CREATE INDEX idx_messages_active_direct_chat_id ON public.messages USING btree (direct_chat_id, id DESC) WHERE ((deleted_at IS NULL) AND (direct_chat_id IS NOT NULL));

CREATE UNIQUE INDEX chat_room_members_pkey ON public.chat_room_members USING btree (chat_room_id, user_id);

CREATE INDEX idx_chat_room_members_user_room ON public.chat_room_members USING btree (user_id, chat_room_id);

alter table "public"."chat_room_members" add constraint "chat_room_members_pkey" PRIMARY KEY using index "chat_room_members_pkey";

alter table "public"."chat_read_states" add constraint "chat_read_states_chat_room_id_fkey" FOREIGN KEY (chat_room_id) REFERENCES public.chat_rooms(id) ON DELETE RESTRICT not valid;

alter table "public"."chat_read_states" validate constraint "chat_read_states_chat_room_id_fkey";

alter table "public"."chat_read_states" add constraint "chat_read_states_direct_chat_id_fkey" FOREIGN KEY (direct_chat_id) REFERENCES public.direct_chats(id) ON DELETE RESTRICT not valid;

alter table "public"."chat_read_states" validate constraint "chat_read_states_direct_chat_id_fkey";

alter table "public"."chat_read_states" add constraint "chat_read_states_last_read_message_id_fkey" FOREIGN KEY (last_read_message_id) REFERENCES public.messages(id) ON DELETE RESTRICT not valid;

alter table "public"."chat_read_states" validate constraint "chat_read_states_last_read_message_id_fkey";

alter table "public"."chat_read_states" add constraint "chat_read_states_target_check" CHECK (((direct_chat_id IS NULL) <> (chat_room_id IS NULL))) not valid;

alter table "public"."chat_read_states" validate constraint "chat_read_states_target_check";

alter table "public"."chat_read_states" add constraint "chat_read_states_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE RESTRICT not valid;

alter table "public"."chat_read_states" validate constraint "chat_read_states_user_id_fkey";

alter table "public"."chat_room_members" add constraint "chat_room_members_chat_room_id_fkey" FOREIGN KEY (chat_room_id) REFERENCES public.chat_rooms(id) ON DELETE RESTRICT not valid;

alter table "public"."chat_room_members" validate constraint "chat_room_members_chat_room_id_fkey";

alter table "public"."messages" add constraint "messages_chat_room_id_fkey" FOREIGN KEY (chat_room_id) REFERENCES public.chat_rooms(id) ON DELETE RESTRICT not valid;

alter table "public"."messages" validate constraint "messages_chat_room_id_fkey";

alter table "public"."messages" add constraint "messages_direct_chat_id_fkey" FOREIGN KEY (direct_chat_id) REFERENCES public.direct_chats(id) ON DELETE RESTRICT not valid;

alter table "public"."messages" validate constraint "messages_direct_chat_id_fkey";

alter table "public"."messages" add constraint "messages_target_check" CHECK (((direct_chat_id IS NULL) <> (chat_room_id IS NULL))) not valid;

alter table "public"."messages" validate constraint "messages_target_check";

alter table "public"."chat_rooms" add constraint "chat_rooms_name_check" CHECK (((char_length(btrim(name)) >= 1) AND (char_length(btrim(name)) <= 100))) not valid;

alter table "public"."chat_rooms" validate constraint "chat_rooms_name_check";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.add_chat_room_creator_member()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.created_by is not null then
    insert into public.chat_room_members(chat_room_id,user_id)
    values(new.id,new.created_by)
    on conflict do nothing;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.is_direct_chat_member(p_direct_chat_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.is_accepted_user() and exists(
    select 1 from public.direct_chats dc
    where dc.id=p_direct_chat_id
      and private.current_profile_id() in (dc.user1_id, dc.user2_id)
  )
$function$
;

CREATE OR REPLACE FUNCTION private.is_room_member(p_chat_room_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.is_accepted_user() and exists(select 1 from public.chat_room_members where chat_room_id=p_chat_room_id and user_id=private.current_profile_id())
$function$
;

CREATE OR REPLACE FUNCTION private.is_valid_message_parent(p_parent_id bigint, p_direct_chat_id bigint, p_chat_room_id bigint)
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
      and m.direct_chat_id is not distinct from p_direct_chat_id
      and m.chat_room_id is not distinct from p_chat_room_id
  )
$function$
;

CREATE OR REPLACE FUNCTION private.mark_sender_chat_read()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_direct_chat(p_direct_chat_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public.get_chat_messages(p_direct_chat_id bigint DEFAULT NULL::bigint, p_chat_room_id bigint DEFAULT NULL::bigint, p_before_id bigint DEFAULT NULL::bigint, p_limit integer DEFAULT 50)
 RETURNS TABLE(message_id bigint, direct_chat_id bigint, chat_room_id bigint, sender_id bigint, sender jsonb, parent_message jsonb, content text, is_edited boolean, edited_at timestamp with time zone, deleted_at timestamp with time zone, created_at timestamp with time zone, attachments jsonb, reactions jsonb, reads jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.remove_group_member(p_chat_room_id bigint, p_user_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.search_messages(p_query text, p_direct_chat_id bigint DEFAULT NULL::bigint, p_chat_room_id bigint DEFAULT NULL::bigint)
 RETURNS TABLE(message_id bigint, content_snippet text, sender_name text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.send_direct_message_with_attachment(p_direct_chat_id bigint, p_storage_path text, p_file_name text, p_content_type text, p_size_bytes bigint, p_parent_id bigint DEFAULT NULL::bigint, p_content text DEFAULT NULL::text, p_width integer DEFAULT NULL::integer, p_height integer DEFAULT NULL::integer)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public.send_room_message_with_attachment(p_chat_room_id bigint, p_storage_path text, p_file_name text, p_content_type text, p_size_bytes bigint, p_parent_id bigint DEFAULT NULL::bigint, p_content text DEFAULT NULL::text, p_width integer DEFAULT NULL::integer, p_height integer DEFAULT NULL::integer)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      and (
        (m.direct_chat_id is not null and private.is_direct_chat_member(m.direct_chat_id))
        or (m.chat_room_id is not null and private.is_room_member(m.chat_room_id))
      )
  )
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
$function$
;

CREATE OR REPLACE FUNCTION private.validate_message_parent()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.is_valid_message_parent(new.parent_id,new.direct_chat_id,new.chat_room_id) then
    raise exception 'message parent must be an active top-level message in the same chat';
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.list_chat_rooms()
 RETURNS TABLE(direct_chat_id bigint, chat_room_id bigint, name text, display_name text, display_initials text, avatar_url text, last_message_id bigint, last_message_content text, last_message_has_attachment boolean, last_message_sender_id bigint, last_message_sender_name text, last_message_created_at timestamp with time zone, unread_count bigint, member_count bigint, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.request_attachment_removal(p_attachment_kind text, p_attachment_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller_id bigint:=private.require_current_profile(true); bucket text; path text; target_message_id bigint;
begin
  if p_attachment_kind='post' then
    select a.storage_bucket,a.storage_path into bucket,path from public.post_attachments a join public.posts p on p.id=a.post_id where a.id=p_attachment_id and p.author_id=caller_id and p.deleted_at is null;
  elsif p_attachment_kind='message' then
    select a.storage_bucket,a.storage_path,a.message_id into bucket,path,target_message_id from public.message_attachments a join public.messages m on m.id=a.message_id where a.id=p_attachment_id and m.sender_id=caller_id and m.deleted_at is null and private.can_access_message(m.id);
  else raise exception 'invalid attachment kind'; end if;
  if path is null then raise exception 'attachment not found or not owned'; end if;

  insert into private.attachment_cleanup_queue(storage_bucket,storage_path,requested_by) values(bucket,path,caller_id)
  on conflict(storage_bucket,storage_path) do update
  set available_at=least(private.attachment_cleanup_queue.available_at,excluded.available_at),
      processed_at=null,
      last_error=null;

  if p_attachment_kind='post' then
    delete from public.post_attachments where id=p_attachment_id and storage_path=path;
  else
    delete from public.message_attachments where id=p_attachment_id and storage_path=path;
    delete from public.message_reactions where message_id=target_message_id;

    update public.messages m
    set content=null,deleted_at=now(),deleted_by=caller_id
    where m.id=target_message_id
      and m.deleted_at is null
      and m.content is null
      and not exists(select 1 from public.message_attachments a where a.message_id=m.id);
  end if;
end $function$
;

revoke execute on function private.add_chat_room_creator_member(), private.is_direct_chat_member(bigint), private.is_room_member(bigint), private.is_valid_message_parent(bigint,bigint,bigint), private.mark_sender_chat_read(), private.validate_chat_read_state(), private.validate_message_parent() from public, anon, authenticated, service_role;
grant execute on function private.is_direct_chat_member(bigint), private.is_room_member(bigint), private.can_access_message(bigint), private.is_valid_message_parent(bigint,bigint,bigint), private.has_active_message_reply(bigint) to authenticated;

revoke execute on function public.remove_group_member(bigint,bigint), public.list_chat_rooms(), public.get_chat_messages(bigint,bigint,bigint,int4), public.soft_delete_message(bigint), public.search_messages(text,bigint,bigint), public.send_direct_message_with_attachment(bigint,text,text,text,int8,bigint,text,int4,int4), public.send_room_message_with_attachment(bigint,text,text,text,int8,bigint,text,int4,int4), public.cleanup_direct_chat(bigint) from public, anon, authenticated, service_role;
grant execute on function public.remove_group_member(bigint,bigint), public.list_chat_rooms(), public.get_chat_messages(bigint,bigint,bigint,int4), public.soft_delete_message(bigint), public.search_messages(text,bigint,bigint), public.send_direct_message_with_attachment(bigint,text,text,text,int8,bigint,text,int4,int4), public.send_room_message_with_attachment(bigint,text,text,text,int8,bigint,text,int4,int4) to authenticated;
grant execute on function public.cleanup_direct_chat(bigint) to service_role;

grant select on table "public"."chat_read_states" to "authenticated";

grant insert (direct_chat_id,chat_room_id,user_id,last_read_message_id) on table "public"."chat_read_states" to "authenticated";

grant update (last_read_message_id) on table "public"."chat_read_states" to "authenticated";

grant delete on table "public"."chat_read_states" to "service_role";

grant insert on table "public"."chat_read_states" to "service_role";

grant select on table "public"."chat_read_states" to "service_role";

grant update on table "public"."chat_read_states" to "service_role";

grant select on table "public"."direct_chats" to "authenticated";

grant insert (user1_id,user2_id) on table "public"."direct_chats" to "authenticated";

grant insert (name,created_by) on table "public"."chat_rooms" to "authenticated";

grant insert (chat_room_id,user_id) on table "public"."chat_room_members" to "authenticated";

grant insert (direct_chat_id,chat_room_id,sender_id,parent_id,content) on table "public"."messages" to "authenticated";

grant usage, select on sequence "public"."direct_chats_id_seq", "public"."chat_rooms_id_seq", "public"."messages_id_seq", "public"."chat_read_states_id_seq" to "authenticated";

grant delete on table "public"."direct_chats" to "service_role";

grant insert on table "public"."direct_chats" to "service_role";

grant select on table "public"."direct_chats" to "service_role";

grant update on table "public"."direct_chats" to "service_role";

grant usage, select on sequence "public"."direct_chats_id_seq", "public"."chat_read_states_id_seq" to "service_role";


  create policy "chat_read_states_insert"
  on "public"."chat_read_states"
  as permissive
  for insert
  to authenticated
with check (((user_id = private.current_profile_id()) AND (last_read_message_id IS NOT NULL) AND (((direct_chat_id IS NOT NULL) AND private.is_direct_chat_member(direct_chat_id)) OR ((chat_room_id IS NOT NULL) AND private.is_room_member(chat_room_id)))));



  create policy "chat_read_states_select"
  on "public"."chat_read_states"
  as permissive
  for select
  to authenticated
using (((user_id = private.current_profile_id()) AND (((direct_chat_id IS NOT NULL) AND private.is_direct_chat_member(direct_chat_id)) OR ((chat_room_id IS NOT NULL) AND private.is_room_member(chat_room_id)))));



  create policy "chat_read_states_update"
  on "public"."chat_read_states"
  as permissive
  for update
  to authenticated
using (((user_id = private.current_profile_id()) AND (((direct_chat_id IS NOT NULL) AND private.is_direct_chat_member(direct_chat_id)) OR ((chat_room_id IS NOT NULL) AND private.is_room_member(chat_room_id)))))
with check (((user_id = private.current_profile_id()) AND (last_read_message_id IS NOT NULL) AND (((direct_chat_id IS NOT NULL) AND private.is_direct_chat_member(direct_chat_id)) OR ((chat_room_id IS NOT NULL) AND private.is_room_member(chat_room_id)))));



  create policy "chat_room_members_insert"
  on "public"."chat_room_members"
  as permissive
  for insert
  to authenticated
with check ((private.is_room_member(chat_room_id) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = chat_room_members.user_id) AND (p.status = 'accepted'::public.profile_status) AND (p.deleted_at IS NULL))))));



  create policy "chat_rooms_insert"
  on "public"."chat_rooms"
  as permissive
  for insert
  to authenticated
with check (((created_by = private.current_profile_id()) AND private.is_accepted_user()));



  create policy "chat_rooms_select"
  on "public"."chat_rooms"
  as permissive
  for select
  to authenticated
using (private.is_room_member(id));



  create policy "direct_chats_insert"
  on "public"."direct_chats"
  as permissive
  for insert
  to authenticated
with check ((private.is_accepted_user() AND (user1_id < user2_id) AND ((private.current_profile_id() = user1_id) OR (private.current_profile_id() = user2_id)) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = direct_chats.user1_id) AND (p.status = 'accepted'::public.profile_status) AND (p.deleted_at IS NULL)))) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = direct_chats.user2_id) AND (p.status = 'accepted'::public.profile_status) AND (p.deleted_at IS NULL))))));



  create policy "direct_chats_select"
  on "public"."direct_chats"
  as permissive
  for select
  to authenticated
using (private.is_direct_chat_member(id));



  create policy "messages_insert"
  on "public"."messages"
  as permissive
  for insert
  to authenticated
with check (((sender_id = private.current_profile_id()) AND (content IS NOT NULL) AND private.is_valid_message_parent(parent_id, direct_chat_id, chat_room_id) AND (((direct_chat_id IS NOT NULL) AND private.is_direct_chat_member(direct_chat_id)) OR ((chat_room_id IS NOT NULL) AND private.is_room_member(chat_room_id)))));



  create policy "chat_room_members_select"
  on "public"."chat_room_members"
  as permissive
  for select
  to authenticated
using (private.is_room_member(chat_room_id));



  create policy "messages_select"
  on "public"."messages"
  as permissive
  for select
  to authenticated
using ((((deleted_at IS NULL) OR private.has_active_message_reply(id)) AND (((direct_chat_id IS NOT NULL) AND private.is_direct_chat_member(direct_chat_id)) OR ((chat_room_id IS NOT NULL) AND private.is_room_member(chat_room_id)))));



  create policy "messages_update"
  on "public"."messages"
  as permissive
  for update
  to authenticated
using (((deleted_at IS NULL) AND (sender_id = private.current_profile_id()) AND (created_at >= (now() - '00:15:00'::interval)) AND (((direct_chat_id IS NOT NULL) AND private.is_direct_chat_member(direct_chat_id)) OR ((chat_room_id IS NOT NULL) AND private.is_room_member(chat_room_id)))))
with check (((deleted_at IS NULL) AND (sender_id = private.current_profile_id()) AND (content IS NOT NULL) AND (created_at >= (now() - '00:15:00'::interval)) AND (((direct_chat_id IS NOT NULL) AND private.is_direct_chat_member(direct_chat_id)) OR ((chat_room_id IS NOT NULL) AND private.is_room_member(chat_room_id)))));


CREATE TRIGGER trg_validate_chat_read_state BEFORE INSERT OR UPDATE OF direct_chat_id, chat_room_id, last_read_message_id ON public.chat_read_states FOR EACH ROW EXECUTE FUNCTION private.validate_chat_read_state();

CREATE TRIGGER trg_add_chat_room_creator_member AFTER INSERT ON public.chat_rooms FOR EACH ROW EXECUTE FUNCTION private.add_chat_room_creator_member();

CREATE TRIGGER trg_mark_sender_chat_read AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION private.mark_sender_chat_read();

CREATE TRIGGER trg_validate_message_parent BEFORE INSERT OR UPDATE OF direct_chat_id, chat_room_id, parent_id ON public.messages FOR EACH ROW EXECUTE FUNCTION private.validate_message_parent();

drop policy if exists "message_files_insert" on "storage"."objects";

drop policy if exists "message_files_select" on "storage"."objects";

/* Generated storage policy SQL below was malformed by db diff; replaced after this comment block.

  create policy "message_files_insert"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'message-files'::text) AND (split_part(name, '/'::text, 3) = (( SELECT auth.uid() AS uid))::text) AND ((EXISTS ( SELECT 1
   FROM public.direct_chats dc
  WHERE ((split_part(objects.name, '/'::text, 1) = 'direct'::text) AND ((dc.id)::text = split_part(objects.name, '/'::text, 2)) AND private.is_direct_chat_member(dc.id) AND (objects.name ~ (((('^direct/'::text || (dc.id)::text) || '/'::text) || (( SELECT auth.uid() AS uid))::text) || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12};
::text))))) OR (EXISTS ( SELECT 1
   FROM public.chat_room_members crm
  WHERE ((split_part(objects.name, '/'::text, 1) = 'room'::text) AND ((crm.chat_room_id)::text = split_part(objects.name, '/'::text, 2)) AND private.is_room_member(crm.chat_room_id) AND (objects.name ~ (((('^room/'::text || (crm.chat_room_id)::text) || '/'::text) || (( SELECT auth.uid() AS uid))::text) || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12};
::text))))))));



  create policy "message_files_select"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = 'message-files'::text) AND ((EXISTS ( SELECT 1
   FROM public.message_attachments a
  WHERE ((a.storage_path = objects.name) AND private.can_access_message(a.message_id)))) OR ((split_part(name, '/'::text, 3) = (( SELECT auth.uid() AS uid))::text) AND ((EXISTS ( SELECT 1
   FROM public.direct_chats dc
  WHERE ((split_part(objects.name, '/'::text, 1) = 'direct'::text) AND ((dc.id)::text = split_part(objects.name, '/'::text, 2)) AND private.is_direct_chat_member(dc.id) AND (objects.name ~ (((('^direct/'::text || (dc.id)::text) || '/'::text) || (( SELECT auth.uid() AS uid))::text) || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12};
::text))))) OR (EXISTS ( SELECT 1
   FROM public.chat_room_members crm
  WHERE ((split_part(objects.name, '/'::text, 1) = 'room'::text) AND ((crm.chat_room_id)::text = split_part(objects.name, '/'::text, 2)) AND private.is_room_member(crm.chat_room_id) AND (objects.name ~ (((('^room/'::text || (crm.chat_room_id)::text) || '/'::text) || (( SELECT auth.uid() AS uid))::text) || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12};
::text))))))))));
*/

create policy "message_files_insert"
on "storage"."objects"
as permissive
for insert
to authenticated
with check (
  bucket_id='message-files'
  and split_part(name,'/',3)=(select auth.uid())::text
  and (
    exists(
      select 1 from public.direct_chats dc
      where split_part(objects.name,'/',1)='direct'
        and dc.id::text=split_part(objects.name,'/',2)
        and private.is_direct_chat_member(dc.id)
        and objects.name ~ ('^direct/'||dc.id::text||'/'||(select auth.uid())::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
    )
    or exists(
      select 1 from public.chat_room_members crm
      where split_part(objects.name,'/',1)='room'
        and crm.chat_room_id::text=split_part(objects.name,'/',2)
        and private.is_room_member(crm.chat_room_id)
        and objects.name ~ ('^room/'||crm.chat_room_id::text||'/'||(select auth.uid())::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
    )
  )
);

create policy "message_files_select"
on "storage"."objects"
as permissive
for select
to authenticated
using (
  bucket_id='message-files'
  and (
    exists(select 1 from public.message_attachments a where a.storage_path=objects.name and private.can_access_message(a.message_id))
    or (
      split_part(name,'/',3)=(select auth.uid())::text
      and (
        exists(
          select 1 from public.direct_chats dc
          where split_part(objects.name,'/',1)='direct'
            and dc.id::text=split_part(objects.name,'/',2)
            and private.is_direct_chat_member(dc.id)
            and objects.name ~ ('^direct/'||dc.id::text||'/'||(select auth.uid())::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
        )
        or exists(
          select 1 from public.chat_room_members crm
          where split_part(objects.name,'/',1)='room'
            and crm.chat_room_id::text=split_part(objects.name,'/',2)
            and private.is_room_member(crm.chat_room_id)
            and objects.name ~ ('^room/'||crm.chat_room_id::text||'/'||(select auth.uid())::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
        )
      )
    )
  )
);
