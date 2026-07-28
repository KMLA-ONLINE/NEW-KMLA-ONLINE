drop policy "club_apply_rounds_delete" on "public"."club_apply_rounds";

drop policy "club_recruitments_delete" on "public"."club_recruitments";

drop policy "club_settings_update" on "public"."club_settings";

drop policy "clubs_apply_insert" on "public"."clubs_apply";

alter table "public"."club_apply_rounds" drop constraint "club_apply_rounds_no_overlap";

alter table "public"."club_managers" drop constraint "club_managers_club_id_fkey";

alter table "public"."club_recruitments" drop constraint "club_recruitments_club_id_fkey";

alter table "public"."club_recruitments" drop constraint "club_recruitments_round_id_fkey";

select 1; 
-- drop index if exists "public"."club_apply_rounds_no_overlap";

alter table "public"."club_apply_rounds" add column "type" public.club_type not null default 'major'::public.club_type;

select 1; 
-- CREATE INDEX club_apply_rounds_no_overlap ON public.club_apply_rounds USING gist (type, apply_range);

alter table "public"."clubs_apply" add constraint "clubs_apply_recruitment_fkey" FOREIGN KEY (round_id, club_id) REFERENCES public.club_recruitments(round_id, club_id) ON DELETE RESTRICT not valid;

alter table "public"."clubs_apply" validate constraint "clubs_apply_recruitment_fkey";

alter table "public"."club_apply_rounds" add constraint "club_apply_rounds_no_overlap" EXCLUDE USING gist (type WITH =, apply_range WITH &&);

alter table "public"."club_managers" add constraint "club_managers_club_id_fkey" FOREIGN KEY (club_id) REFERENCES public.clubs(id) ON DELETE RESTRICT not valid;

alter table "public"."club_managers" validate constraint "club_managers_club_id_fkey";

alter table "public"."club_recruitments" add constraint "club_recruitments_club_id_fkey" FOREIGN KEY (club_id) REFERENCES public.clubs(id) ON DELETE RESTRICT not valid;

alter table "public"."club_recruitments" validate constraint "club_recruitments_club_id_fkey";

alter table "public"."club_recruitments" add constraint "club_recruitments_round_id_fkey" FOREIGN KEY (round_id) REFERENCES public.club_apply_rounds(id) ON DELETE RESTRICT not valid;

alter table "public"."club_recruitments" validate constraint "club_recruitments_round_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.guard_club_identity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if (
    new.name is distinct from old.name
    or new.type is distinct from old.type
  )
  and not coalesce(
    private.is_app_admin(),
    false
  )
  then
    raise exception using
      errcode = '42501',
      message = 'only app admins can rename or reclassify clubs';
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.set_club_settings_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  new.updated_by := private.current_profile_id();
  new.updated_at := now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.set_club_updated_at()
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

CREATE OR REPLACE FUNCTION private.validate_club_recruitment_type()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not exists (
    select 1
    from public.club_apply_rounds as round
    join public.clubs as club
      on club.id = new.club_id
    where round.id = new.round_id
      and round.type = club.type
  ) then
    raise exception using
      errcode = '23514',
      message = 'club type does not match recruitment round';
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.manages_club(p_club_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    private.is_accepted_user()
    and exists (
      select 1
      from public.club_managers as manager
      where manager.club_id = p_club_id
        and manager.user_id =
          private.current_profile_id()
    )
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_club_access()
 RETURNS TABLE(profile_id bigint, is_app_admin boolean, managed_club_ids bigint[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    private.current_profile_id(),
    private.is_app_admin(),
    coalesce(
      (
        select array_agg(
          manager.club_id
          order by manager.club_id
        )
        from public.club_managers
          as manager
        where private.is_accepted_user()
          and manager.user_id =
            private.current_profile_id()
      ),
      array[]::bigint[]
    )
$function$
;


  create policy "clubs_insert"
  on "public"."clubs"
  as permissive
  for insert
  to authenticated
with check ((private.is_accepted_user() AND private.is_app_admin()));



  create policy "club_apply_rounds_delete"
  on "public"."club_apply_rounds"
  as permissive
  for delete
  to authenticated
using ((private.is_app_admin() AND (NOT (EXISTS ( SELECT 1
   FROM public.club_recruitments recruitment
  WHERE (recruitment.round_id = club_apply_rounds.id)))) AND (NOT (EXISTS ( SELECT 1
   FROM public.clubs_apply application
  WHERE (application.round_id = club_apply_rounds.id))))));



  create policy "club_recruitments_delete"
  on "public"."club_recruitments"
  as permissive
  for delete
  to authenticated
using (((private.is_app_admin() OR private.manages_club(club_id)) AND (NOT (EXISTS ( SELECT 1
   FROM public.clubs_apply application
  WHERE ((application.round_id = club_recruitments.round_id) AND (application.club_id = club_recruitments.club_id)))))));



  create policy "club_settings_update"
  on "public"."club_settings"
  as permissive
  for update
  to authenticated
using (private.is_app_admin())
with check ((private.is_app_admin() AND singleton AND (updated_by = private.current_profile_id())));



  create policy "clubs_apply_insert"
  on "public"."clubs_apply"
  as permissive
  for insert
  to authenticated
with check ((private.is_accepted_user() AND (user_id = private.current_profile_id()) AND private.is_club_recruiting(round_id, club_id)));


CREATE TRIGGER trg_set_club_recruitments_updated_at BEFORE UPDATE ON public.club_recruitments FOR EACH ROW EXECUTE FUNCTION private.set_club_updated_at();

CREATE TRIGGER trg_validate_club_recruitment_type BEFORE INSERT OR UPDATE OF round_id, club_id ON public.club_recruitments FOR EACH ROW EXECUTE FUNCTION private.validate_club_recruitment_type();

CREATE TRIGGER trg_set_club_settings_audit BEFORE UPDATE OF page_open ON public.club_settings FOR EACH ROW EXECUTE FUNCTION private.set_club_settings_audit();

CREATE TRIGGER trg_guard_club_identity BEFORE UPDATE OF name, type ON public.clubs FOR EACH ROW EXECUTE FUNCTION private.guard_club_identity();

CREATE TRIGGER trg_set_clubs_updated_at BEFORE UPDATE ON public.clubs FOR EACH ROW EXECUTE FUNCTION private.set_club_updated_at();



revoke execute
on function private.set_club_updated_at()
from public, anon, authenticated, service_role;

revoke execute
on function private.set_club_settings_audit()
from public, anon, authenticated, service_role;

revoke execute
on function private.guard_club_identity()
from public, anon, authenticated, service_role;

revoke execute
on function private.validate_club_recruitment_type()
from public, anon, authenticated, service_role;

revoke update (updated_at)
on public.clubs
from authenticated;

revoke insert (updated_at)
on public.club_recruitments
from authenticated;

revoke update (updated_at)
on public.club_recruitments
from authenticated;

revoke update (
  updated_by,
  updated_at
)
on public.club_settings
from authenticated;

grant insert (
  name,
  description,
  card_description,
  emoji,
  image_url,
  meeting,
  location,
  type
)
on public.clubs
to authenticated;

grant update (
  name,
  type
)
on public.clubs
to authenticated;

grant insert (type)
on public.club_apply_rounds
to authenticated;

grant update (type)
on public.club_apply_rounds
to authenticated;

grant usage, select
on sequence public.clubs_id_seq
to authenticated;
