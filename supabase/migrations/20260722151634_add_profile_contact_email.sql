drop function if exists "public"."get_my_profile"();

alter table "public"."profiles" add column "contact_email" text;

alter table "public"."profiles" add constraint "profiles_contact_email_check" CHECK (((contact_email IS NULL) OR ((contact_email = btrim(contact_email)) AND (contact_email ~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'::text)))) not valid;

alter table "public"."profiles" validate constraint "profiles_contact_email_check";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.anonymize_profile(p_profile_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- 탈퇴하면 열쇠고리도 같이 태운다. 남겨둬 봐야 아무도 열 수 없는 blob일 뿐이고
  -- (userKey를 푸는 비밀번호는 애초에 서버에 없다), 상대방 쪽 히스토리는 상대의
  -- 키로 그대로 읽힌다. 재가입하면 새 신원키를 받고, 예전 DM은 영영 안 열린다 --
  -- 종단간 암호화가 뜻하는 바가 그거다.
  delete from public.user_keys where user_id = p_profile_id;

  update public.profiles
  set name = '탈퇴한 사용자',
      role = 'user',
      student_number = null,
      class_no = null,
      cohort = null,
      gender = null,
      track = null,
       department = null,
       phone_number = null,
       contact_email = null,
       avatar_url = null,
      cover_image_url = null,
      birthday = null,
      description = null,
      status = 'withdrawn',
      dorm_room = null,
      is_reenrolled = false,
      status_updated_at = now(),
      status_updated_by = null,
      deleted_at = now()
  where id = p_profile_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_profile()
 RETURNS TABLE(id bigint, name text, role public.app_role, type public.profile_type, student_number character, class_no smallint, cohort smallint, gender public.profile_gender, track public.profile_track, department text, phone_number text, contact_email text, avatar_url text, cover_image_url text, birthday date, description text, status public.profile_status, dorm_room smallint, is_reenrolled boolean, onboarding_completed_at timestamp with time zone, status_updated_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    p.id, p.name, p.role, p.type, p.student_number, p.class_no, p.cohort, p.gender, p.track,
    p.department, p.phone_number, p.contact_email, p.avatar_url, p.cover_image_url, p.birthday, p.description,
    p.status, p.dorm_room, p.is_reenrolled, p.onboarding_completed_at, p.status_updated_at,
    p.created_at, p.updated_at
  from public.profiles p
  where p.auth_user_id = (select auth.uid())
    and p.deleted_at is null
$function$
;

grant select (contact_email) on table public.profiles to authenticated;
grant update (contact_email) on table public.profiles to authenticated;

revoke execute on function public.get_my_profile() from public, anon, service_role;
grant execute on function public.get_my_profile() to authenticated;
