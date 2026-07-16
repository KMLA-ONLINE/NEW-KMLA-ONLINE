
  create table "private"."profile_auth_map" (
    "profile_id" bigint not null,
    "auth_user_id" uuid not null,
    "status" public.profile_status not null,
    "deleted_at" timestamp with time zone
      );


CREATE UNIQUE INDEX profile_auth_map_auth_user_id_key ON private.profile_auth_map USING btree (auth_user_id);

CREATE UNIQUE INDEX profile_auth_map_pkey ON private.profile_auth_map USING btree (profile_id);

alter table "private"."profile_auth_map" add constraint "profile_auth_map_pkey" PRIMARY KEY using index "profile_auth_map_pkey";

alter table "private"."profile_auth_map" add constraint "profile_auth_map_auth_user_id_key" UNIQUE using index "profile_auth_map_auth_user_id_key";

alter table "private"."profile_auth_map" add constraint "profile_auth_map_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "private"."profile_auth_map" validate constraint "profile_auth_map_profile_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.sync_profile_auth_map()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.auth_user_id is null then
    delete from private.profile_auth_map where profile_id = new.id;
  else
    insert into private.profile_auth_map(profile_id, auth_user_id, status, deleted_at)
    values (new.id, new.auth_user_id, new.status, new.deleted_at)
    on conflict (profile_id) do update
    set auth_user_id = excluded.auth_user_id,
        status = excluded.status,
        deleted_at = excluded.deleted_at;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION private.current_profile_id()
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p.profile_id
  from private.profile_auth_map as p
  where p.auth_user_id = (select auth.uid())
$function$
;

CREATE OR REPLACE FUNCTION private.is_accepted_user()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from private.profile_auth_map as p
    where p.auth_user_id = (select auth.uid())
      and p.status = 'accepted'
      and p.deleted_at is null
  )
$function$
;

CREATE TRIGGER sync_profile_auth_map AFTER INSERT OR UPDATE OF auth_user_id, status, deleted_at ON public.profiles FOR EACH ROW EXECUTE FUNCTION private.sync_profile_auth_map();
insert into private.profile_auth_map(profile_id, auth_user_id, status, deleted_at)
select id, auth_user_id, status, deleted_at
from public.profiles
where auth_user_id is not null
on conflict (profile_id) do update
set auth_user_id = excluded.auth_user_id,
    status = excluded.status,
    deleted_at = excluded.deleted_at;

revoke all on table private.profile_auth_map from public, anon, authenticated, service_role;
revoke execute on function private.sync_profile_auth_map() from public, anon, authenticated, service_role;


