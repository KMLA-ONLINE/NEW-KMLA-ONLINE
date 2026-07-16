set check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.has_active_profile()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from private.profile_auth_map as p
    where p.auth_user_id = (select auth.uid())
      and p.deleted_at is null
  )
$function$
;

drop policy "avatars_insert" on "storage"."objects";

drop policy "profile_covers_insert" on "storage"."objects";


  create policy "avatars_insert"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'avatars'::text) AND private.has_active_profile() AND private.has_uuid_object_suffix(name, ((( SELECT auth.uid() AS uid))::text || '/'::text))));



  create policy "profile_covers_insert"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'profile-covers'::text) AND private.has_active_profile() AND private.has_uuid_object_suffix(name, ((( SELECT auth.uid() AS uid))::text || '/'::text))));

revoke execute on function private.has_active_profile() from public, anon, authenticated, service_role;
grant execute on function private.has_active_profile() to authenticated;



