drop function if exists "public"."finalize_message_attachment"(p_message_id bigint, p_storage_path text, p_file_name text, p_content_type text, p_size_bytes bigint, p_sort_order integer, p_width integer, p_height integer);

drop function if exists "public"."mark_chat_read"(p_room_id bigint, p_last_read_message_id bigint);

drop function if exists "public"."set_message_reaction"(p_message_id bigint, p_reaction_type_id bigint);

drop function if exists "public"."update_message"(p_message_id bigint, p_content text);

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.mark_message_reaction_updated()
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

revoke execute on function private.mark_message_reaction_updated() from public, anon, authenticated, service_role;

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
    new.is_edited := true;
    new.edited_at := now();
  end if;
  return new;
end;
$function$
;

grant delete on table "public"."message_reactions" to "authenticated";

grant insert (message_id,user_id,reaction_type_id) on table "public"."message_reactions" to "authenticated";

grant update (reaction_type_id) on table "public"."message_reactions" to "authenticated";

grant update (content) on table "public"."messages" to "authenticated";

grant insert (room_id,user_id,last_read_message_id) on table "public"."chat_room_read_states" to "authenticated";

grant update (last_read_message_id) on table "public"."chat_room_read_states" to "authenticated";

grant usage, select on sequence "public"."message_reactions_id_seq" to "authenticated";


  create policy "chat_room_read_states_insert"
  on "public"."chat_room_read_states"
  as permissive
  for insert
  to authenticated
with check (((user_id = private.current_profile_id()) AND (last_read_message_id IS NOT NULL) AND private.is_room_member(room_id)));



  create policy "chat_room_read_states_update"
  on "public"."chat_room_read_states"
  as permissive
  for update
  to authenticated
using (((user_id = private.current_profile_id()) AND private.is_room_member(room_id)))
with check (((user_id = private.current_profile_id()) AND (last_read_message_id IS NOT NULL) AND private.is_room_member(room_id)));



  create policy "message_reactions_delete"
  on "public"."message_reactions"
  as permissive
  for delete
  to authenticated
using (((user_id = private.current_profile_id()) AND private.can_access_message(message_id)));



  create policy "message_reactions_insert"
  on "public"."message_reactions"
  as permissive
  for insert
  to authenticated
with check (((user_id = private.current_profile_id()) AND private.can_access_message(message_id)));



  create policy "message_reactions_update"
  on "public"."message_reactions"
  as permissive
  for update
  to authenticated
using (((user_id = private.current_profile_id()) AND private.can_access_message(message_id)))
with check (((user_id = private.current_profile_id()) AND private.can_access_message(message_id)));



  create policy "messages_update"
  on "public"."messages"
  as permissive
  for update
  to authenticated
using (((deleted_at IS NULL) AND (sender_id = private.current_profile_id()) AND (created_at >= (now() - '00:15:00'::interval)) AND private.is_room_member(room_id)))
with check (((deleted_at IS NULL) AND (sender_id = private.current_profile_id()) AND (content IS NOT NULL) AND (created_at >= (now() - '00:15:00'::interval)) AND private.is_room_member(room_id)));


CREATE TRIGGER trg_mark_message_reaction_updated BEFORE UPDATE OF reaction_type_id ON public.message_reactions FOR EACH ROW EXECUTE FUNCTION private.mark_message_reaction_updated();

