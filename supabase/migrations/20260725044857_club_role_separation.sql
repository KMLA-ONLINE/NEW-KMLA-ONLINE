drop policy "clubs_apply_insert" on "public"."clubs_apply";

drop policy "clubs_apply_select" on "public"."clubs_apply";

alter table "public"."clubs" drop constraint "clubs_description_check";


  create table "public"."club_managers" (
    "club_id" bigint not null,
    "user_id" bigint not null,
    "assigned_by" bigint,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."club_managers" enable row level security;


  create table "public"."club_recruitments" (
    "round_id" bigint not null,
    "club_id" bigint not null,
    "announcement" text,
    "enabled" boolean not null default false,
    "updated_at" timestamp with time zone
      );


alter table "public"."club_recruitments" enable row level security;


  create table "public"."club_settings" (
    "singleton" boolean not null default true,
    "page_open" boolean not null default true,
    "updated_by" bigint,
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."club_settings" enable row level security;

alter table "public"."clubs" add column "card_description" text;

alter table "public"."clubs" add column "emoji" text not null default '🏫'::text;

alter table "public"."clubs" add column "image_url" text;

alter table "public"."clubs" add column "location" text;

alter table "public"."clubs" add column "meeting" text;

alter table "public"."clubs" add column "updated_at" timestamp with time zone;

CREATE UNIQUE INDEX club_managers_pkey ON public.club_managers USING btree (club_id, user_id);

CREATE UNIQUE INDEX club_recruitments_pkey ON public.club_recruitments USING btree (round_id, club_id);

CREATE UNIQUE INDEX club_settings_pkey ON public.club_settings USING btree (singleton);

CREATE INDEX idx_club_managers_user_id ON public.club_managers USING btree (user_id, club_id);

CREATE INDEX idx_club_recruitments_club ON public.club_recruitments USING btree (club_id, round_id);

alter table "public"."club_managers" add constraint "club_managers_pkey" PRIMARY KEY using index "club_managers_pkey";

alter table "public"."club_recruitments" add constraint "club_recruitments_pkey" PRIMARY KEY using index "club_recruitments_pkey";

alter table "public"."club_settings" add constraint "club_settings_pkey" PRIMARY KEY using index "club_settings_pkey";

alter table "public"."club_managers" add constraint "club_managers_assigned_by_fkey" FOREIGN KEY (assigned_by) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."club_managers" validate constraint "club_managers_assigned_by_fkey";

alter table "public"."club_managers" add constraint "club_managers_club_id_fkey" FOREIGN KEY (club_id) REFERENCES public.clubs(id) ON DELETE CASCADE not valid;

alter table "public"."club_managers" validate constraint "club_managers_club_id_fkey";

alter table "public"."club_managers" add constraint "club_managers_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."club_managers" validate constraint "club_managers_user_id_fkey";

alter table "public"."club_recruitments" add constraint "club_recruitments_announcement_check" CHECK (((announcement IS NULL) OR (char_length(announcement) <= 10000))) not valid;

alter table "public"."club_recruitments" validate constraint "club_recruitments_announcement_check";

alter table "public"."club_recruitments" add constraint "club_recruitments_club_id_fkey" FOREIGN KEY (club_id) REFERENCES public.clubs(id) ON DELETE CASCADE not valid;

alter table "public"."club_recruitments" validate constraint "club_recruitments_club_id_fkey";

alter table "public"."club_recruitments" add constraint "club_recruitments_round_id_fkey" FOREIGN KEY (round_id) REFERENCES public.club_apply_rounds(id) ON DELETE CASCADE not valid;

alter table "public"."club_recruitments" validate constraint "club_recruitments_round_id_fkey";

alter table "public"."club_settings" add constraint "club_settings_singleton_check" CHECK (singleton) not valid;

alter table "public"."club_settings" validate constraint "club_settings_singleton_check";

alter table "public"."club_settings" add constraint "club_settings_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."club_settings" validate constraint "club_settings_updated_by_fkey";

insert into public.club_settings (singleton, page_open)
values (true, true)
on conflict (singleton) do nothing;

alter table "public"."clubs" add constraint "clubs_card_description_check" CHECK (((card_description IS NULL) OR (char_length(card_description) <= 500))) not valid;

alter table "public"."clubs" validate constraint "clubs_card_description_check";

alter table "public"."clubs" add constraint "clubs_emoji_check" CHECK (((char_length(emoji) >= 1) AND (char_length(emoji) <= 32))) not valid;

alter table "public"."clubs" validate constraint "clubs_emoji_check";

alter table "public"."clubs" add constraint "clubs_image_url_check" CHECK (((image_url IS NULL) OR (image_url ~ '^https://'::text))) not valid;

alter table "public"."clubs" validate constraint "clubs_image_url_check";

alter table "public"."clubs" add constraint "clubs_location_check" CHECK (((location IS NULL) OR (char_length(location) <= 200))) not valid;

alter table "public"."clubs" validate constraint "clubs_location_check";

alter table "public"."clubs" add constraint "clubs_meeting_check" CHECK (((meeting IS NULL) OR (char_length(meeting) <= 200))) not valid;

alter table "public"."clubs" validate constraint "clubs_meeting_check";

alter table "public"."clubs" add constraint "clubs_description_check" CHECK (((description IS NULL) OR (char_length(description) <= 10000))) not valid;

alter table "public"."clubs" validate constraint "clubs_description_check";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.is_club_recruiting(p_round_id bigint, p_club_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    exists (
      select 1
      from public.club_settings as settings
      where settings.singleton
        and settings.page_open
    )
    and private.is_club_round_open(
      p_round_id
    )
    and exists (
      select 1
      from public.club_recruitments as recruitment
      where recruitment.round_id =
        p_round_id
        and recruitment.club_id =
          p_club_id
        and recruitment.enabled
    )
$function$
;

CREATE OR REPLACE FUNCTION private.manages_club(p_club_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
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
        where manager.user_id =
          private.current_profile_id()
      ),
      array[]::bigint[]
    )
$function$
;

CREATE OR REPLACE FUNCTION private.is_club_round_open(p_round_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.club_apply_rounds as round
    where round.id = p_round_id
      and now() >= round.starts_at
      and now() < round.ends_at
  )
$function$
;

revoke execute on function private.manages_club(bigint)
from public, anon, service_role;

grant execute on function private.manages_club(bigint)
to authenticated;

revoke execute on function private.is_club_round_open(bigint)
from public, anon, service_role;

grant execute on function private.is_club_round_open(bigint)
to authenticated;

revoke execute on function private.is_club_recruiting(bigint, bigint)
from public, anon, service_role;

grant execute on function private.is_club_recruiting(bigint, bigint)
to authenticated;

revoke execute on function public.get_my_club_access()
from public, anon;

grant execute on function public.get_my_club_access()
to authenticated, service_role;

grant delete on table "public"."club_apply_rounds" to "authenticated";

grant insert ("name", "starts_at", "ends_at", "created_by") on table "public"."club_apply_rounds" to "authenticated";

grant update ("name", "starts_at", "ends_at") on table "public"."club_apply_rounds" to "authenticated";

grant delete on table "public"."club_managers" to "authenticated";

grant insert ("club_id", "user_id", "assigned_by") on table "public"."club_managers" to "authenticated";

grant select on table "public"."club_managers" to "authenticated";

grant delete on table "public"."club_managers" to "service_role";

grant insert on table "public"."club_managers" to "service_role";

grant select on table "public"."club_managers" to "service_role";

grant update on table "public"."club_managers" to "service_role";

grant delete on table "public"."club_recruitments" to "authenticated";

grant insert ("round_id", "club_id", "announcement", "enabled", "updated_at") on table "public"."club_recruitments" to "authenticated";

grant select on table "public"."club_recruitments" to "authenticated";

grant update ("announcement", "enabled", "updated_at") on table "public"."club_recruitments" to "authenticated";

grant delete on table "public"."club_recruitments" to "service_role";

grant insert on table "public"."club_recruitments" to "service_role";

grant select on table "public"."club_recruitments" to "service_role";

grant update on table "public"."club_recruitments" to "service_role";

grant select on table "public"."club_settings" to "authenticated";

grant update ("page_open", "updated_by", "updated_at") on table "public"."club_settings" to "authenticated";

grant update ("description", "card_description", "emoji", "image_url", "meeting", "location", "updated_at") on table "public"."clubs" to "authenticated";

grant delete on table "public"."club_settings" to "service_role";

grant insert on table "public"."club_settings" to "service_role";

grant select on table "public"."club_settings" to "service_role";

grant update on table "public"."club_settings" to "service_role";


  create policy "club_apply_rounds_delete"
  on "public"."club_apply_rounds"
  as permissive
  for delete
  to authenticated
using (private.is_app_admin());



  create policy "club_apply_rounds_insert"
  on "public"."club_apply_rounds"
  as permissive
  for insert
  to authenticated
with check ((private.is_app_admin() AND (created_by = private.current_profile_id())));



  create policy "club_apply_rounds_update"
  on "public"."club_apply_rounds"
  as permissive
  for update
  to authenticated
using (private.is_app_admin())
with check (private.is_app_admin());



  create policy "club_managers_delete"
  on "public"."club_managers"
  as permissive
  for delete
  to authenticated
using (private.is_app_admin());



  create policy "club_managers_insert"
  on "public"."club_managers"
  as permissive
  for insert
  to authenticated
with check ((private.is_app_admin() AND (assigned_by = private.current_profile_id())));



  create policy "club_managers_select"
  on "public"."club_managers"
  as permissive
  for select
  to authenticated
using (private.is_accepted_user());



  create policy "club_recruitments_delete"
  on "public"."club_recruitments"
  as permissive
  for delete
  to authenticated
using ((private.is_app_admin() OR private.manages_club(club_id)));



  create policy "club_recruitments_insert"
  on "public"."club_recruitments"
  as permissive
  for insert
  to authenticated
with check ((private.is_app_admin() OR private.manages_club(club_id)));



  create policy "club_recruitments_select"
  on "public"."club_recruitments"
  as permissive
  for select
  to authenticated
using (private.is_accepted_user());



  create policy "club_recruitments_update"
  on "public"."club_recruitments"
  as permissive
  for update
  to authenticated
using ((private.is_app_admin() OR private.manages_club(club_id)))
with check ((private.is_app_admin() OR private.manages_club(club_id)));



  create policy "club_settings_select"
  on "public"."club_settings"
  as permissive
  for select
  to authenticated
using (private.is_accepted_user());



  create policy "club_settings_update"
  on "public"."club_settings"
  as permissive
  for update
  to authenticated
using (private.is_app_admin())
with check ((private.is_app_admin() AND singleton));



  create policy "clubs_update"
  on "public"."clubs"
  as permissive
  for update
  to authenticated
using ((private.is_accepted_user() AND (private.is_app_admin() OR private.manages_club(id))))
with check ((private.is_accepted_user() AND (private.is_app_admin() OR private.manages_club(id))));



  create policy "clubs_apply_insert"
  on "public"."clubs_apply"
  as permissive
  for insert
  to authenticated
with check (((user_id = private.current_profile_id()) AND private.is_club_recruiting(round_id, club_id)));



  create policy "clubs_apply_select"
  on "public"."clubs_apply"
  as permissive
  for select
  to authenticated
using ((private.is_accepted_user() AND ((user_id = private.current_profile_id()) OR private.is_app_admin() OR private.manages_club(club_id))));

