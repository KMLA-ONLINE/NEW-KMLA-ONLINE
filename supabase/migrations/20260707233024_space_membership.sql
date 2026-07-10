create sequence "public"."space_invites_id_seq";

drop policy "posts_insert" on "public"."posts";

drop policy "posts_select" on "public"."posts";

drop policy "posts_update" on "public"."posts";

drop policy "spaces_select" on "public"."spaces";

alter table "public"."spaces" drop constraint "spaces_pub_id_key";

alter table "public"."spaces" alter column "join_policy" drop default;

alter type "public"."space_join_policy" rename to "space_join_policy__old_version_to_be_dropped";

create type "public"."space_join_policy" as enum ('open', 'public', 'invite_only');


  create table "public"."space_invites" (
    "id" bigint not null default nextval('public.space_invites_id_seq'::regclass),
    "space_id" bigint not null,
    "token" text not null,
    "created_by" bigint,
    "max_uses" integer,
    "use_count" integer not null default 0,
    "expires_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."space_invites" enable row level security;

alter table "public"."spaces" alter column join_policy type "public"."space_join_policy" using join_policy::text::"public"."space_join_policy";

drop type "public"."space_join_policy__old_version_to_be_dropped";

alter table "public"."space_members" add column "pinned_at" timestamp with time zone;

alter table "public"."spaces" alter column "join_policy" set default 'public'::public.space_join_policy;

drop policy "space_images_insert" on "storage"."objects";

alter table "public"."spaces" alter column "pub_id" drop default;

alter table "public"."spaces" alter column "pub_id" set data type text using "pub_id"::text;

alter table "public"."spaces" alter column "pub_id" set default "left"(replace((gen_random_uuid())::text, '-'::text, ''::text), 12);

alter sequence "public"."space_invites_id_seq" owned by "public"."space_invites"."id";

CREATE INDEX idx_space_invites_space ON public.space_invites USING btree (space_id, created_at DESC);

CREATE INDEX idx_space_members_user_pinned ON public.space_members USING btree (user_id, pinned_at DESC) WHERE (pinned_at IS NOT NULL);

CREATE UNIQUE INDEX space_invites_pkey ON public.space_invites USING btree (id);

CREATE UNIQUE INDEX space_invites_token_key ON public.space_invites USING btree (token);

CREATE UNIQUE INDEX spaces_pub_id_key ON public.spaces USING btree (pub_id);

alter table "public"."spaces" add constraint "spaces_pub_id_key" UNIQUE using index "spaces_pub_id_key";

alter table "public"."space_invites" add constraint "space_invites_pkey" PRIMARY KEY using index "space_invites_pkey";

alter table "public"."space_invites" add constraint "space_invites_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."space_invites" validate constraint "space_invites_created_by_fkey";

alter table "public"."space_invites" add constraint "space_invites_max_uses_check" CHECK (((max_uses IS NULL) OR (max_uses > 0))) not valid;

alter table "public"."space_invites" validate constraint "space_invites_max_uses_check";

alter table "public"."space_invites" add constraint "space_invites_space_id_fkey" FOREIGN KEY (space_id) REFERENCES public.spaces(id) ON DELETE RESTRICT not valid;

alter table "public"."space_invites" validate constraint "space_invites_space_id_fkey";

alter table "public"."space_invites" add constraint "space_invites_token_check" CHECK (((char_length(token) >= 16) AND (char_length(token) <= 128))) not valid;

alter table "public"."space_invites" validate constraint "space_invites_token_check";

alter table "public"."space_invites" add constraint "space_invites_token_key" UNIQUE using index "space_invites_token_key";

alter table "public"."space_invites" add constraint "space_invites_use_count_check" CHECK (((use_count >= 0) AND ((max_uses IS NULL) OR (use_count <= max_uses)))) not valid;

alter table "public"."space_invites" validate constraint "space_invites_use_count_check";

alter table "public"."spaces" add constraint "spaces_pub_id_check" CHECK ((((char_length(pub_id) >= 3) AND (char_length(pub_id) <= 50)) AND (pub_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text))) not valid;

alter table "public"."spaces" validate constraint "spaces_pub_id_check";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.can_participate_space(p_space_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists(
    select 1 from public.spaces s
    where s.id=p_space_id and s.deleted_at is null and (
      private.is_space_member(s.id)
      or (
        s.join_policy='open'
        and private.is_accepted_user()
        and not exists(select 1 from public.space_members b where b.space_id=s.id and b.user_id=private.current_profile_id() and b.banned_at is not null)
      )
    )
  )
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
    or (inv.max_uses is not null and inv.use_count>=inv.max_uses)
  then raise exception 'invalid or expired invite'; end if;
  if not exists(select 1 from public.spaces where id=inv.space_id and deleted_at is null) then raise exception 'space not found'; end if;
  if exists(select 1 from public.space_members where space_id=inv.space_id and user_id=caller_id and banned_at is not null) then raise exception 'banned from this space'; end if;
  if exists(select 1 from public.space_members where space_id=inv.space_id and user_id=caller_id) then return inv.space_id; end if;
  insert into public.space_members(space_id,user_id,role) values(inv.space_id,caller_id,'member');
  update public.spaces set member_count=member_count+1 where id=inv.space_id;
  update public.space_invites set use_count=use_count+1 where id=inv.id;
  return inv.space_id;
end;
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
  if exists(select 1 from public.spaces where id=p_space_id and join_policy='open') then raise exception 'open spaces do not use invites'; end if;
  if p_max_uses is not null and p_max_uses <= 0 then raise exception 'max_uses must be positive'; end if;
  new_token := encode(extensions.gen_random_bytes(24),'hex');
  insert into public.space_invites(space_id,token,created_by,max_uses,expires_at)
  values(p_space_id,new_token,caller_id,p_max_uses,p_expires_at);
  return new_token;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.join_space(p_space_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller_id bigint := private.require_current_profile(true);
begin
  if not exists(select 1 from public.spaces where id=p_space_id and deleted_at is null) then raise exception 'space not found'; end if;
  if exists(select 1 from public.spaces where id=p_space_id and join_policy='invite_only') then raise exception 'invite required to join this space'; end if;
  if exists(select 1 from public.space_members where space_id=p_space_id and user_id=caller_id and banned_at is not null) then raise exception 'banned from this space'; end if;
  insert into public.space_members(space_id,user_id,role) values(p_space_id,caller_id,'member') on conflict do nothing;
  if found then update public.spaces set member_count=member_count+1 where id=p_space_id; end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.leave_space(p_space_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller_id bigint := private.require_current_profile(true);
begin
  if exists(select 1 from public.space_members where space_id=p_space_id and user_id=caller_id and role='owner') then
    raise exception 'transfer ownership before leaving';
  end if;
  delete from public.space_members where space_id=p_space_id and user_id=caller_id;
  if found then update public.spaces set member_count=greatest(member_count-1,0) where id=p_space_id; end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.revoke_space_invite(p_invite_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller_id bigint := private.require_current_profile(true); target_space bigint;
begin
  select space_id into target_space from public.space_invites where id=p_invite_id for update;
  if target_space is null then raise exception 'invite not found'; end if;
  if not private.can_manage_space(target_space) then raise exception 'space manager required'; end if;
  update public.space_invites set revoked_at=now() where id=p_invite_id and revoked_at is null;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.can_access_post(p_post_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists(select 1 from public.posts p where p.id=p_post_id and p.deleted_at is null and private.can_participate_space(p.space_id))
$function$
;

grant select on table "public"."space_invites" to "authenticated";

grant delete on table "public"."space_invites" to "service_role";

grant insert on table "public"."space_invites" to "service_role";

grant select on table "public"."space_invites" to "service_role";

grant update on table "public"."space_invites" to "service_role";


  create policy "space_invites_select"
  on "public"."space_invites"
  as permissive
  for select
  to authenticated
using (private.can_manage_space(space_id));



  create policy "posts_insert"
  on "public"."posts"
  as permissive
  for insert
  to authenticated
with check (((author_id = private.current_profile_id()) AND private.can_participate_space(space_id)));



  create policy "posts_select"
  on "public"."posts"
  as permissive
  for select
  to authenticated
using (((deleted_at IS NULL) AND private.can_participate_space(space_id)));



  create policy "posts_update"
  on "public"."posts"
  as permissive
  for update
  to authenticated
using (((deleted_at IS NULL) AND (author_id = private.current_profile_id()) AND private.can_participate_space(space_id)))
with check (((deleted_at IS NULL) AND (author_id = private.current_profile_id()) AND private.can_participate_space(space_id)));



  create policy "spaces_select"
  on "public"."spaces"
  as permissive
  for select
  to authenticated
using (((deleted_at IS NULL) AND (((join_policy = ANY (ARRAY['open'::public.space_join_policy, 'public'::public.space_join_policy])) AND ( SELECT private.is_accepted_user() AS is_accepted_user)) OR private.is_space_member(id))));


  create policy "space_images_insert"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'space-images'::text) AND (EXISTS ( SELECT 1
   FROM public.spaces s
  WHERE ((s.pub_id = split_part(objects.name, '/'::text, 1)) AND (s.deleted_at IS NULL) AND private.can_manage_space(s.id) AND private.has_uuid_object_suffix(objects.name, (s.pub_id || '/'::text)))))));




-- Grants migra does not emit for new columns/sequences/functions.
grant update (notification_setting,pinned_at) on public.space_members to authenticated;
grant usage, select on sequence public.space_invites_id_seq to service_role;

revoke execute on function public.join_space(bigint), public.leave_space(bigint), public.create_space_invite(bigint,int4,timestamptz), public.accept_space_invite(text), public.revoke_space_invite(bigint) from public, anon, authenticated, service_role;
grant execute on function public.join_space(bigint), public.leave_space(bigint), public.create_space_invite(bigint,int4,timestamptz), public.accept_space_invite(text), public.revoke_space_invite(bigint) to authenticated;
