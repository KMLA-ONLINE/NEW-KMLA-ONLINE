-- Invites gain a target: target_user_id null = shared link (anyone with the
-- token), set = only that profile may accept. max_uses/use_count go away -- a
-- link is now bounded by expiry and revoke, and a targeted invite is one person
-- by construction. ON DELETE CASCADE (not SET NULL): a targeted invite whose
-- target is deleted must vanish, not silently reopen as a shared link.
--
-- create_space_invite's parameter types changed (int4 -> bigint), so Postgres
-- dropped and recreated it, and the grant did not follow. It is restored by hand
-- at the end -- without it authenticated could not call the RPC at all.

alter table "public"."space_invites" drop constraint "space_invites_max_uses_check";

alter table "public"."space_invites" drop constraint "space_invites_use_count_check";

drop function if exists "public"."create_space_invite"(p_space_id bigint, p_max_uses integer, p_expires_at timestamp with time zone);

alter table "public"."space_invites" drop column "max_uses";

alter table "public"."space_invites" drop column "use_count";

alter table "public"."space_invites" add column "target_user_id" bigint;

alter table "public"."space_invites" add constraint "space_invites_target_user_id_fkey" FOREIGN KEY (target_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."space_invites" validate constraint "space_invites_target_user_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.create_space_invite(p_space_id bigint, p_target_user_id bigint DEFAULT NULL::bigint, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller_id bigint := private.require_current_profile(true); new_token text;
begin
  if not private.can_manage_space(p_space_id) then raise exception 'space manager required'; end if;
  if p_target_user_id is not null and not exists(
    select 1 from public.profiles where id=p_target_user_id and status='accepted' and deleted_at is null
  ) then raise exception 'invite target must be an accepted user'; end if;
  new_token := encode(extensions.gen_random_bytes(24),'hex');
  insert into public.space_invites(space_id,token,target_user_id,created_by,expires_at)
  values(p_space_id,new_token,p_target_user_id,caller_id,p_expires_at);
  return new_token;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.accept_space_invite(p_token text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller_id bigint := private.require_current_profile(true); inv record;
begin
  select * into inv from public.space_invites where token=p_token for update;
  if not found then raise exception 'invalid or expired invite'; end if;
  if inv.revoked_at is not null
    or (inv.expires_at is not null and inv.expires_at<=now())
  then raise exception 'invalid or expired invite'; end if;
  -- 대상 지정 초대는 그 사람만 수락한다. 엉뚱한 사람에게는 초대의 존재 자체를
  -- 숨기려고 여느 무효 초대와 같은 메시지로 거부한다.
  if inv.target_user_id is not null and inv.target_user_id<>caller_id then raise exception 'invalid or expired invite'; end if;
  if not exists(select 1 from public.spaces where id=inv.space_id and deleted_at is null) then raise exception 'space not found'; end if;
  if exists(select 1 from public.space_members where space_id=inv.space_id and user_id=caller_id and banned_at is not null) then raise exception 'banned from this space'; end if;
  if exists(select 1 from public.space_members where space_id=inv.space_id and user_id=caller_id) then return inv.space_id; end if;
  insert into public.space_members(space_id,user_id,role) values(inv.space_id,caller_id,'member');
  update public.spaces set member_count=member_count+1 where id=inv.space_id;
  return inv.space_id;
end;
$function$
;

-- Restore the grant lost when create_space_invite was dropped and recreated.
revoke execute on function public.create_space_invite(bigint,bigint,timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.create_space_invite(bigint,bigint,timestamptz) to authenticated;

