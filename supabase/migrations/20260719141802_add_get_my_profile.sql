set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_my_profile()
 RETURNS TABLE(id bigint, name text, role public.app_role, type public.profile_type, student_number character, class_no smallint, cohort smallint, gender public.profile_gender, track public.profile_track, department text, phone_number text, avatar_url text, cover_image_url text, birthday date, description text, status public.profile_status, dorm_room smallint, is_reenrolled boolean, onboarding_completed_at timestamp with time zone, status_updated_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    p.id, p.name, p.role, p.type, p.student_number, p.class_no, p.cohort, p.gender, p.track,
    p.department, p.phone_number, p.avatar_url, p.cover_image_url, p.birthday, p.description,
    p.status, p.dorm_room, p.is_reenrolled, p.onboarding_completed_at, p.status_updated_at,
    p.created_at, p.updated_at
  from public.profiles p
  where p.auth_user_id = (select auth.uid())
    and p.deleted_at is null
$function$
;

-- db diff는 함수 grant를 한 줄도 내보내지 않는다. 새 함수는 ACL이 비어 있으면 암묵적으로
-- EXECUTE TO PUBLIC이므로, 손으로 회수하지 않으면 anon에게도 열린 채 배포된다.
revoke execute on function public.get_my_profile() from public, anon, service_role;
grant execute on function public.get_my_profile() to authenticated;

