drop function if exists "public"."get_chat_messages"(p_conversation_id bigint, p_before_id bigint, p_limit integer);

alter table "public"."messages" add column "pinned_at" timestamp with time zone;

alter table "public"."messages" add column "pinned_by" bigint;

CREATE INDEX idx_messages_pinned ON public.messages USING btree (conversation_id, pinned_at DESC) WHERE ((pinned_at IS NOT NULL) AND (deleted_at IS NULL));

alter table "public"."messages" add constraint "messages_pinned_by_fkey" FOREIGN KEY (pinned_by) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."messages" validate constraint "messages_pinned_by_fkey";

alter table "public"."messages" add constraint "messages_pinned_state_check" CHECK (((pinned_at IS NOT NULL) OR (pinned_by IS NULL))) not valid;

alter table "public"."messages" validate constraint "messages_pinned_state_check";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.stamp_message_pinned_by()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.pinned_at is null then
    new.pinned_by := null;
  else
    new.pinned_by := private.current_profile_id();
  end if;
  return new;
end;
$function$
;

revoke execute on function private.stamp_message_pinned_by() from public, anon, authenticated, service_role;

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
$function$
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

-- get_chat_messages was dropped above (return type changed), which resets
-- its privileges to the create-time default (PUBLIC has execute). Restore
-- the intended grant.
revoke execute on function public.get_chat_messages(bigint,bigint,int4) from public, anon, authenticated, service_role;
grant execute on function public.get_chat_messages(bigint,bigint,int4) to authenticated;

grant update (pinned_at) on public.messages to authenticated;

  create policy "messages_pin_update"
  on "public"."messages"
  as permissive
  for update
  to authenticated
using (((deleted_at IS NULL) AND private.is_conversation_member(conversation_id)))
with check (((deleted_at IS NULL) AND private.is_conversation_member(conversation_id)));


CREATE TRIGGER trg_stamp_message_pinned_by BEFORE UPDATE OF pinned_at ON public.messages FOR EACH ROW EXECUTE FUNCTION private.stamp_message_pinned_by();


