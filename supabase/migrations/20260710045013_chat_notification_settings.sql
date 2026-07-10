drop function if exists "public"."list_conversations"();


  create table "public"."chat_notification_settings" (
    "conversation_id" bigint not null,
    "user_id" bigint not null,
    "muted_until" timestamp with time zone,
    "level" public.notification_level not null default 'all'::public.notification_level,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone
      );


alter table "public"."chat_notification_settings" enable row level security;

CREATE UNIQUE INDEX chat_notification_settings_pkey ON public.chat_notification_settings USING btree (conversation_id, user_id);

CREATE INDEX idx_chat_notification_settings_user ON public.chat_notification_settings USING btree (user_id, conversation_id);

alter table "public"."chat_notification_settings" add constraint "chat_notification_settings_pkey" PRIMARY KEY using index "chat_notification_settings_pkey";

alter table "public"."chat_notification_settings" add constraint "chat_notification_settings_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE RESTRICT not valid;

alter table "public"."chat_notification_settings" validate constraint "chat_notification_settings_conversation_id_fkey";

alter table "public"."chat_notification_settings" add constraint "chat_notification_settings_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE RESTRICT not valid;

alter table "public"."chat_notification_settings" validate constraint "chat_notification_settings_user_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.mark_chat_notification_settings_updated()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  new.updated_at := now();
  return new;
end;
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
end $function$
;

CREATE OR REPLACE FUNCTION public.list_conversations()
 RETURNS TABLE(conversation_id bigint, type public.conversation_type, name text, display_name text, display_initials text, avatar_url text, last_message_id bigint, last_message_content text, last_message_has_attachment boolean, last_message_sender_id bigint, last_message_sender_name text, last_message_created_at timestamp with time zone, unread_count bigint, member_count bigint, muted_until timestamp with time zone, notification_level public.notification_level, created_at timestamp with time zone)
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
  delete from public.chat_notification_settings where conversation_id=p_conversation_id and user_id=p_user_id;
  delete from public.message_reactions mr using public.messages m where mr.message_id=m.id and m.conversation_id=p_conversation_id and mr.user_id=p_user_id;
  delete from public.conversation_members where conversation_id=p_conversation_id and user_id=p_user_id;
end;
$function$
;

grant select on table "public"."chat_notification_settings" to "authenticated";

grant delete on table "public"."chat_notification_settings" to "service_role";

grant insert on table "public"."chat_notification_settings" to "service_role";

grant select on table "public"."chat_notification_settings" to "service_role";

grant update on table "public"."chat_notification_settings" to "service_role";


  create policy "chat_notification_settings_insert"
  on "public"."chat_notification_settings"
  as permissive
  for insert
  to authenticated
with check (((user_id = private.current_profile_id()) AND private.is_conversation_member(conversation_id)));



  create policy "chat_notification_settings_select"
  on "public"."chat_notification_settings"
  as permissive
  for select
  to authenticated
using (((user_id = private.current_profile_id()) AND private.is_conversation_member(conversation_id)));



  create policy "chat_notification_settings_update"
  on "public"."chat_notification_settings"
  as permissive
  for update
  to authenticated
using (((user_id = private.current_profile_id()) AND private.is_conversation_member(conversation_id)))
with check (((user_id = private.current_profile_id()) AND private.is_conversation_member(conversation_id)));


CREATE TRIGGER trg_mark_chat_notification_settings_updated BEFORE UPDATE OF muted_until, level ON public.chat_notification_settings FOR EACH ROW EXECUTE FUNCTION private.mark_chat_notification_settings_updated();

-- The diff tool emits table-level grants only, and misses execute privileges
-- entirely. A caller upserts its own row, so it needs insert and update on the
-- columns it may set, and nothing more.
grant insert (conversation_id,user_id,muted_until,level) on public.chat_notification_settings to authenticated;
grant update (muted_until,level) on public.chat_notification_settings to authenticated;

revoke execute on function private.mark_chat_notification_settings_updated() from public, anon, authenticated, service_role;

-- list_conversations gained two return columns, which forced a drop and recreate,
-- and that took its execute grant with it.
revoke execute on function public.list_conversations() from public, anon, authenticated, service_role;
grant execute on function public.list_conversations() to authenticated;


