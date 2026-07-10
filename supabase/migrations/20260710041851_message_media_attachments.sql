create type "public"."attachment_kind" as enum ('image', 'audio', 'video', 'file');

drop function if exists "private"."is_allowed_message_mime"(p_content_type text);

drop function if exists "public"."request_attachment_removal"(p_attachment_kind text, p_attachment_id bigint);

drop function if exists "public"."send_message_with_attachment"(p_conversation_id bigint, p_storage_path text, p_file_name text, p_content_type text, p_size_bytes bigint, p_parent_id bigint, p_content text, p_width integer, p_height integer);


  create table "public"."message_attachment_mime_types" (
    "content_type" text not null,
    "max_bytes" bigint not null,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."message_attachment_mime_types" enable row level security;


  create table "public"."mime_types" (
    "content_type" text not null,
    "kind" public.attachment_kind not null,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."mime_types" enable row level security;

alter table "public"."message_attachments" add column "duration_ms" integer;

CREATE UNIQUE INDEX message_attachment_mime_types_pkey ON public.message_attachment_mime_types USING btree (content_type);

CREATE UNIQUE INDEX mime_types_pkey ON public.mime_types USING btree (content_type);

alter table "public"."message_attachment_mime_types" add constraint "message_attachment_mime_types_pkey" PRIMARY KEY using index "message_attachment_mime_types_pkey";

alter table "public"."mime_types" add constraint "mime_types_pkey" PRIMARY KEY using index "mime_types_pkey";

alter table "public"."message_attachment_mime_types" add constraint "message_attachment_mime_types_content_type_check" CHECK (((char_length(btrim(content_type)) >= 1) AND (char_length(btrim(content_type)) <= 255))) not valid;

alter table "public"."message_attachment_mime_types" validate constraint "message_attachment_mime_types_content_type_check";

alter table "public"."message_attachment_mime_types" add constraint "message_attachment_mime_types_content_type_fkey" FOREIGN KEY (content_type) REFERENCES public.mime_types(content_type) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."message_attachment_mime_types" validate constraint "message_attachment_mime_types_content_type_fkey";

alter table "public"."message_attachment_mime_types" add constraint "message_attachment_mime_types_max_bytes_check" CHECK ((max_bytes > 0)) not valid;

alter table "public"."message_attachment_mime_types" validate constraint "message_attachment_mime_types_max_bytes_check";

-- Registry rows are seed data, so the diff tool cannot see them. They have to
-- land before the foreign key below, or validating it would reject every
-- attachment already sitting in message_attachments.
--
-- public.mime_types answers "what is this type" once, for every surface.
-- image/svg+xml appears nowhere: an SVG can carry script, and an attachment's
-- download link opens it directly rather than inside an <img>.
insert into public.mime_types (content_type, kind)
values
  ('image/jpeg', 'image'),
  ('image/png', 'image'),
  ('image/webp', 'image'),

  ('audio/mpeg', 'audio'),
  ('audio/mp4', 'audio'),
  ('audio/x-m4a', 'audio'),
  ('audio/aac', 'audio'),
  ('audio/wav', 'audio'),
  ('audio/x-wav', 'audio'),
  ('audio/ogg', 'audio'),
  ('audio/webm', 'audio'),

  ('video/mp4', 'video'),
  ('video/webm', 'video'),
  ('video/quicktime', 'video'),

  ('application/pdf', 'file'),
  ('text/plain', 'file'),
  ('text/markdown', 'file'),
  ('text/csv', 'file'),
  ('application/rtf', 'file'),
  ('application/msword', 'file'),
  ('application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'file'),
  ('application/vnd.ms-excel', 'file'),
  ('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'file'),
  ('application/vnd.ms-powerpoint', 'file'),
  ('application/vnd.openxmlformats-officedocument.presentationml.presentation', 'file'),
  ('application/x-hwp', 'file'),
  ('application/x-hwpx', 'file'),
  ('application/haansofthwp', 'file'),
  ('application/haansofthwpx', 'file'),
  ('application/vnd.hancom.hwp', 'file'),
  ('application/vnd.hancom.hwpx', 'file'),
  ('application/vnd.oasis.opendocument.text', 'file'),
  ('application/vnd.oasis.opendocument.spreadsheet', 'file'),
  ('application/vnd.oasis.opendocument.presentation', 'file');

-- What a message accepts, and how large it may be. Per-surface, derived from the
-- classification above so the two cannot disagree about what a type is.
insert into public.message_attachment_mime_types (content_type, max_bytes)
select
  mime.content_type,
  case mime.kind
    when 'image' then 10000000
    when 'video' then 100000000
    else 25000000
  end
from public.mime_types mime;

alter table "public"."message_attachments" add constraint "message_attachments_content_type_fkey" FOREIGN KEY (content_type) REFERENCES public.message_attachment_mime_types(content_type) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."message_attachments" validate constraint "message_attachments_content_type_fkey";

alter table "public"."message_attachments" add constraint "message_attachments_duration_check" CHECK (((duration_ms IS NULL) OR (duration_ms >= 0))) not valid;

alter table "public"."message_attachments" validate constraint "message_attachments_duration_check";

alter table "public"."mime_types" add constraint "mime_types_content_type_check" CHECK (((char_length(btrim(content_type)) >= 1) AND (char_length(btrim(content_type)) <= 255))) not valid;

alter table "public"."mime_types" validate constraint "mime_types_content_type_check";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.enforce_message_attachment_shape()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION private.max_message_attachments()
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$ select 10 $function$
;

CREATE OR REPLACE FUNCTION public.request_attachment_removal(p_owner_type text, p_attachment_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller_id bigint:=private.require_current_profile(true); bucket text; path text; target_message_id bigint;
begin
  if p_owner_type='post' then
    select a.storage_bucket,a.storage_path into bucket,path from public.post_attachments a join public.posts p on p.id=a.post_id where a.id=p_attachment_id and p.author_id=caller_id and p.deleted_at is null;
  elsif p_owner_type='message' then
    select a.storage_bucket,a.storage_path,a.message_id into bucket,path,target_message_id from public.message_attachments a join public.messages m on m.id=a.message_id where a.id=p_attachment_id and m.sender_id=caller_id and m.deleted_at is null and private.can_access_message(m.id);
  else raise exception 'attachment owner type must be post or message'; end if;
  if path is null then raise exception 'attachment not found or not owned'; end if;

  insert into private.attachment_cleanup_queue(storage_bucket,storage_path,requested_by) values(bucket,path,caller_id)
  on conflict(storage_bucket,storage_path) do update
  set available_at=least(private.attachment_cleanup_queue.available_at,excluded.available_at),
      processed_at=null,
      last_error=null;

  if p_owner_type='post' then
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

CREATE OR REPLACE FUNCTION public.send_message_with_attachments(p_conversation_id bigint, p_attachments jsonb, p_parent_id bigint DEFAULT NULL::bigint, p_content text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public.get_chat_messages(p_conversation_id bigint, p_before_id bigint DEFAULT NULL::bigint, p_limit integer DEFAULT 50)
 RETURNS TABLE(message_id bigint, conversation_id bigint, sender_id bigint, sender jsonb, parent_message jsonb, content text, is_edited boolean, edited_at timestamp with time zone, deleted_at timestamp with time zone, pinned_at timestamp with time zone, pinned_by jsonb, created_at timestamp with time zone, attachments jsonb, reactions jsonb, reads jsonb)
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
$function$
;

grant select on table "public"."message_attachment_mime_types" to "authenticated";

grant delete on table "public"."message_attachment_mime_types" to "service_role";

grant insert on table "public"."message_attachment_mime_types" to "service_role";

grant select on table "public"."message_attachment_mime_types" to "service_role";

grant update on table "public"."message_attachment_mime_types" to "service_role";

grant select on table "public"."mime_types" to "authenticated";

grant delete on table "public"."mime_types" to "service_role";

grant insert on table "public"."mime_types" to "service_role";

grant select on table "public"."mime_types" to "service_role";

grant update on table "public"."mime_types" to "service_role";


  create policy "message_attachment_mime_types_select"
  on "public"."message_attachment_mime_types"
  as permissive
  for select
  to authenticated
using (private.is_accepted_user());



  create policy "mime_types_select"
  on "public"."mime_types"
  as permissive
  for select
  to authenticated
using (true);


CREATE TRIGGER trg_enforce_message_attachment_shape AFTER INSERT ON public.message_attachments REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION private.enforce_message_attachment_shape();

-- The diff tool does not track execute privileges, and default privileges revoke
-- execute from every role. Without these, the new RPC is uncallable.
revoke execute on function private.max_message_attachments() from public, anon, authenticated, service_role;
revoke execute on function private.enforce_message_attachment_shape() from public, anon, authenticated, service_role;
revoke execute on function public.send_message_with_attachments(bigint,jsonb,bigint,text) from public, anon, authenticated, service_role;
grant execute on function public.send_message_with_attachments(bigint,jsonb,bigint,text) to authenticated;

-- request_attachment_removal was dropped and recreated purely to rename its first
-- parameter, which took its grant with it.
revoke execute on function public.request_attachment_removal(text,bigint) from public, anon, service_role;
grant execute on function public.request_attachment_removal(text,bigint) to authenticated;

-- Storage's own allowlist is now derived rather than being a second hand-kept
-- copy. file_size_limit is the largest kind (video); the per-kind ceilings are
-- enforced by send_message_with_attachments.
update storage.buckets
set allowed_mime_types = (
      select array_agg(content_type order by content_type)
      from public.message_attachment_mime_types
    ),
    file_size_limit = (select max(max_bytes) from public.message_attachment_mime_types)
where id = 'message-files';


