-- Adds the 'request' join policy: a space you can find and ask to join, but a
-- manager must approve. Pending asks live in the new space_join_requests table
-- rather than space_members, so no existing membership invariant (is_space_member,
-- member_count, one-owner) is touched -- approval moves a row across. Reject and
-- self-cancel are a plain delete gated by RLS (own row or a manager); only approve
-- needs an RPC because it also bumps member_count.
--
-- join_space now returns 'joined' | 'requested' so the caller knows which happened.
-- That return-type change forces a DROP + CREATE (below), and the execute grants
-- for it and approve_join_request are restored by hand -- the diff never emits them.

drop policy "spaces_select" on "public"."spaces";

alter table "public"."spaces" alter column "join_policy" drop default;

alter type "public"."space_join_policy" rename to "space_join_policy__old_version_to_be_dropped";

create type "public"."space_join_policy" as enum ('public', 'request', 'invite_only');


  create table "public"."space_join_requests" (
    "space_id" bigint not null,
    "user_id" bigint not null,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."space_join_requests" enable row level security;

alter table "public"."spaces" alter column join_policy type "public"."space_join_policy" using join_policy::text::"public"."space_join_policy";

alter table "public"."spaces" alter column "join_policy" set default 'public'::public.space_join_policy;

drop type "public"."space_join_policy__old_version_to_be_dropped";

CREATE INDEX idx_space_join_requests_space ON public.space_join_requests USING btree (space_id, created_at);

CREATE UNIQUE INDEX space_join_requests_pkey ON public.space_join_requests USING btree (space_id, user_id);

alter table "public"."space_join_requests" add constraint "space_join_requests_pkey" PRIMARY KEY using index "space_join_requests_pkey";

alter table "public"."space_join_requests" add constraint "space_join_requests_space_id_fkey" FOREIGN KEY (space_id) REFERENCES public.spaces(id) ON DELETE RESTRICT not valid;

alter table "public"."space_join_requests" validate constraint "space_join_requests_space_id_fkey";

alter table "public"."space_join_requests" add constraint "space_join_requests_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE RESTRICT not valid;

alter table "public"."space_join_requests" validate constraint "space_join_requests_user_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.approve_join_request(p_space_id bigint, p_user_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller_id bigint := private.require_current_profile(true);
begin
  if not private.can_manage_space(p_space_id) then raise exception 'space manager required'; end if;
  delete from public.space_join_requests where space_id=p_space_id and user_id=p_user_id;
  if not found then raise exception 'join request not found'; end if;
  -- 요청 후 차단됐거나 탈퇴한 사용자는 요청만 정리하고 승격하지 않는다(member_count 오염 방지).
  if exists(select 1 from public.space_members where space_id=p_space_id and user_id=p_user_id and banned_at is not null) then return; end if;
  if not exists(select 1 from public.profiles where id=p_user_id and status='accepted' and deleted_at is null) then return; end if;
  insert into public.space_members(space_id,user_id,role) values(p_space_id,p_user_id,'member') on conflict do nothing;
  if found then update public.spaces set member_count=member_count+1 where id=p_space_id; end if;
end;
$function$
;

-- Return type changed void -> text, which CREATE OR REPLACE cannot do.
drop function if exists public.join_space(bigint);

CREATE OR REPLACE FUNCTION public.join_space(p_space_id bigint)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller_id bigint := private.require_current_profile(true); space_policy public.space_join_policy;
begin
  select join_policy into space_policy from public.spaces where id=p_space_id and deleted_at is null;
  if space_policy is null then raise exception 'space not found'; end if;
  if space_policy='invite_only' then raise exception 'invite required to join this space'; end if;
  if exists(select 1 from public.space_members where space_id=p_space_id and user_id=caller_id and banned_at is not null) then raise exception 'banned from this space'; end if;
  if exists(select 1 from public.space_members where space_id=p_space_id and user_id=caller_id) then return 'joined'; end if;
  if space_policy='request' then
    insert into public.space_join_requests(space_id,user_id) values(p_space_id,caller_id) on conflict do nothing;
    return 'requested';
  end if;
  insert into public.space_members(space_id,user_id,role) values(p_space_id,caller_id,'member') on conflict do nothing;
  if found then update public.spaces set member_count=member_count+1 where id=p_space_id; end if;
  return 'joined';
end;
$function$
;

grant delete on table "public"."space_join_requests" to "authenticated";

grant select on table "public"."space_join_requests" to "authenticated";

grant delete on table "public"."space_join_requests" to "service_role";

grant insert on table "public"."space_join_requests" to "service_role";

grant select on table "public"."space_join_requests" to "service_role";

grant update on table "public"."space_join_requests" to "service_role";


  create policy "space_join_requests_delete"
  on "public"."space_join_requests"
  as permissive
  for delete
  to authenticated
using (((user_id = private.current_profile_id()) OR private.can_manage_space(space_id)));



  create policy "space_join_requests_select"
  on "public"."space_join_requests"
  as permissive
  for select
  to authenticated
using (((user_id = private.current_profile_id()) OR private.can_manage_space(space_id)));



  create policy "spaces_select"
  on "public"."spaces"
  as permissive
  for select
  to authenticated
using (((deleted_at IS NULL) AND (((join_policy = ANY (ARRAY['public'::public.space_join_policy, 'request'::public.space_join_policy])) AND ( SELECT private.is_accepted_user() AS is_accepted_user)) OR private.is_space_member(id))));

-- Restore the execute grants: join_space was dropped/recreated, approve_join_request is new.
revoke execute on function public.join_space(bigint), public.approve_join_request(bigint,bigint) from public, anon, authenticated, service_role;
grant execute on function public.join_space(bigint), public.approve_join_request(bigint,bigint) to authenticated;



