drop policy "clubs_apply_delete" on "public"."clubs_apply";


  create policy "clubs_apply_delete"
  on "public"."clubs_apply"
  as permissive
  for delete
  to authenticated
using ((private.is_app_admin() OR private.manages_club(club_id)));



