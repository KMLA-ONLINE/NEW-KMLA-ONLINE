set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.count_pending_profiles()
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.require_app_admin();
  return (select count(*) from public.profiles where status='pending' and deleted_at is null);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.list_pending_profiles(p_after_id bigint DEFAULT NULL::bigint, p_limit integer DEFAULT 20)
 RETURNS TABLE(id bigint, name text, type public.profile_type, student_number character, class_no smallint, cohort smallint, gender public.profile_gender, track public.profile_track, department text, is_reenrolled boolean, phone_number text, birthday date, dorm_room smallint, description text, avatar_url text, onboarding_completed_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  after_completed_at timestamptz;
begin
  -- caller_id를 안 쓰므로 perform이다. 결과를 변수에 받아 두면 쓰지 않는 변수로 보여서, 언젠가
  -- 누가 "죽은 코드"라며 지운다 -- 그 줄이 이 함수의 유일한 권한 가드다.
  perform private.require_app_admin();
  if p_limit is null or p_limit not between 1 and 50 then raise exception 'limit must be between 1 and 50'; end if;

  -- 커서 행이 아직 pending일 것을 요구하면 안 된다. 관리자가 한 페이지의 마지막 사람을 승인한
  -- 직후 다음 페이지를 부르면 그 행은 이미 accepted고, 그러면 남은 큐가 통째로 사라진다.
  -- 필요한 건 그 행의 제출 시각뿐이고, 심사해도 그 값은 그대로 남는다.
  if p_after_id is not null then
    select p.onboarding_completed_at into after_completed_at
    from public.profiles p
    where p.id=p_after_id and p.deleted_at is null;
    if after_completed_at is null then raise exception 'invalid cursor'; end if;
  end if;

  return query
  select
    p.id,
    p.name,
    p.type,
    p.student_number,
    p.class_no,
    p.cohort,
    p.gender,
    p.track,
    p.department,
    p.is_reenrolled,
    p.phone_number,
    p.birthday,
    p.dorm_room,
    p.description,
    p.avatar_url,
    p.onboarding_completed_at
  from public.profiles p
  where p.status='pending'
    and p.deleted_at is null
    and (p_after_id is null or (p.onboarding_completed_at,p.id) > (after_completed_at,p_after_id))
  order by p.onboarding_completed_at, p.id
  limit p_limit;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.review_profiles(p_profile_ids bigint[], p_status public.profile_status)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller_id bigint := private.require_app_admin(); reviewed int4;
begin
  if p_status not in ('accepted','rejected') then raise exception 'invalid review status'; end if;
  if p_profile_ids is null or cardinality(p_profile_ids) not between 1 and 200 then raise exception 'review 1 to 200 profiles at a time'; end if;
  update public.profiles set status=p_status,status_updated_at=now(),status_updated_by=caller_id
  where id=any(p_profile_ids) and status='pending' and deleted_at is null;
  get diagnostics reviewed = row_count;
  return reviewed;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.review_profile(p_profile_id bigint, p_status public.profile_status)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if public.review_profiles(array[p_profile_id],p_status) = 0 then raise exception 'pending profile not found'; end if;
end;
$function$
;

-- db diff는 GRANT/REVOKE를 뱉지 않는다. 새 함수는 EXECUTE가 PUBLIC(=anon 포함)으로 열린 채
-- 태어나므로 직접 닫는다. review_profile은 signature가 그대로라 CREATE OR REPLACE가 기존 ACL을
-- 유지한다 -- 다시 grant하지 않는다.
revoke execute on function public.list_pending_profiles(bigint,int4), public.count_pending_profiles(), public.review_profiles(bigint[],public.profile_status) from public, anon, authenticated, service_role;
grant execute on function public.list_pending_profiles(bigint,int4), public.count_pending_profiles(), public.review_profiles(bigint[],public.profile_status) to authenticated;


