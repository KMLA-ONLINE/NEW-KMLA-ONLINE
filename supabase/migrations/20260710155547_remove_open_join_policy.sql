-- Removes the 'open' join policy (participate without joining). Every space now
-- requires membership to read or post, so member_count means the same thing for
-- all of them, and can_participate_space collapses to is_space_member.
--
-- Postgres cannot drop an enum value in place, so the type is recreated. Any
-- existing 'open' space is remapped to 'public' (searchable, instant self-join) --
-- the closest surviving policy -- rather than left to fail the cast.
--
-- The approval-required join ('request') is a separate feature: it needs a pending
-- membership state and an approve/reject RPC, so its enum value arrives with it.

drop policy "spaces_select" on "public"."spaces";

alter table "public"."spaces" alter column "join_policy" drop default;

alter type "public"."space_join_policy" rename to "space_join_policy__old_version_to_be_dropped";

create type "public"."space_join_policy" as enum ('public', 'invite_only');

alter table "public"."spaces" alter column join_policy type "public"."space_join_policy"
  using (case when join_policy::text = 'open' then 'public' else join_policy::text end)::"public"."space_join_policy";

alter table "public"."spaces" alter column "join_policy" set default 'public'::public.space_join_policy;

drop type "public"."space_join_policy__old_version_to_be_dropped";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.can_participate_space(p_space_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.is_space_member(p_space_id)
$function$
;

CREATE OR REPLACE FUNCTION public.create_space_invite(p_space_id bigint, p_max_uses integer DEFAULT NULL::integer, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller_id bigint := private.require_current_profile(true); new_token text;
begin
  if not private.can_manage_space(p_space_id) then raise exception 'space manager required'; end if;
  if p_max_uses is not null and p_max_uses <= 0 then raise exception 'max_uses must be positive'; end if;
  new_token := encode(extensions.gen_random_bytes(24),'hex');
  insert into public.space_invites(space_id,token,created_by,max_uses,expires_at)
  values(p_space_id,new_token,caller_id,p_max_uses,p_expires_at);
  return new_token;
end;
$function$
;


  create policy "spaces_select"
  on "public"."spaces"
  as permissive
  for select
  to authenticated
using (((deleted_at IS NULL) AND (((join_policy = 'public'::public.space_join_policy) AND ( SELECT private.is_accepted_user() AS is_accepted_user)) OR private.is_space_member(id))));



