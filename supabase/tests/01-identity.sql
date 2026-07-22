-- 신원: auth.users -> profiles 트리거, 승인·권한, 내 프로필 경계.
-- supabase/schemas/01-identity.sql

begin;

do $$
declare
  admin_user uuid := '11111111-1111-4111-8111-111111111111';
  admin_id bigint;
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values (admin_user, 'identity-admin@example.com', '{"name":"Identity Admin"}'::jsonb);

  select id into admin_id from public.profiles where auth_user_id = admin_user;
  if admin_id is null then
    raise exception 'auth user profile trigger failed';
  end if;

  update public.profiles set type = 'teacher', status = 'accepted' where id = admin_id;
  perform public.bootstrap_first_app_admin(admin_id);
  if not exists (select 1 from public.profiles where id = admin_id and role = 'admin') then
    raise exception 'first app admin bootstrap failed';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 가입 승인 큐
--
-- 앞 블록이 profile1을 app admin으로 만들어 뒀고, 같은 트랜잭션이라 아직 admin이다.
-- ---------------------------------------------------------------------------

do $$
declare
  admin_user uuid := '11111111-1111-4111-8111-111111111111';
  outsider uuid := '66666666-6666-4666-8666-666666666666';
  applicant_a uuid := '33333333-3333-4333-8333-333333333333';
  applicant_b uuid := '44444444-4444-4444-8444-444444444444';
  applicant_c uuid := '55555555-5555-4555-8555-555555555555';
  admin_id bigint;
  outsider_id bigint;
  a bigint;
  b bigint;
  c bigint;
  queued bigint;
  reviewed int4;
begin
  select id into admin_id from public.profiles where auth_user_id = admin_user;

  insert into auth.users (id, email, raw_user_meta_data)
  values
    (outsider, 'queue-outsider@example.com', '{"name":"Queue Outsider"}'::jsonb),
    (applicant_a, 'queue-a@example.com', '{"name":"Queue A"}'::jsonb),
    (applicant_b, 'queue-b@example.com', '{"name":"Queue B"}'::jsonb),
    (applicant_c, 'queue-c@example.com', '{"name":"Queue C"}'::jsonb);

  select id into outsider_id from public.profiles where auth_user_id = outsider;
  update public.profiles set type = 'teacher', status = 'accepted' where id = outsider_id;

  -- 세 명이 온보딩을 낸다. 셋 다 pending.
  perform set_config('request.jwt.claim.sub', applicant_a::text, true);
  perform public.submit_onboarding('신청자 A','student','300301'::char(6),1::int2,30::int2,'male','domestic',null,false,'01011112222','2008-03-01','잘 부탁드립니다',412::int2);
  perform set_config('request.jwt.claim.sub', applicant_b::text, true);
  perform public.submit_onboarding('신청자 B','student','300302'::char(6),2::int2,30::int2,'female','international',null,false,'01033334444','2008-05-02',null,318::int2);
  perform set_config('request.jwt.claim.sub', applicant_c::text, true);
  perform public.submit_onboarding('신청자 C','teacher',null,null,null,null,null,null,false,'01055556666','1985-09-03',null,null);

  select id into a from public.profiles where auth_user_id = applicant_a;
  select id into b from public.profiles where auth_user_id = applicant_b;
  select id into c from public.profiles where auth_user_id = applicant_c;

  -- now()는 트랜잭션 안에서 움직이지 않아 셋의 제출 시각이 같다. 손으로 벌리되 **id 순서와
  -- 반대로** 벌린다: 큐가 id가 아니라 제출 시각으로 정렬한다는 것이 요점이다. 거절당한 사람이
  -- 재제출하면 실제로 이 모양이 된다 -- 낡은 id에 새 제출 시각이 붙는다.
  update public.profiles set onboarding_completed_at = now() - interval '1 hour' where id = a;
  update public.profiles set onboarding_completed_at = now() - interval '3 hours' where id = b;
  update public.profiles set onboarding_completed_at = now() - interval '2 hours' where id = c;

  -- 관리자가 아니면 큐 자체가 안 열린다. 큐를 못 열면 review_profile에 넘길 id도 알 수 없다.
  perform set_config('request.jwt.claim.sub', outsider::text, true);
  begin
    perform public.list_pending_profiles();
    raise exception 'a non-admin must not open the review queue';
  exception when others then
    if sqlerrm <> 'app admin required' then raise; end if;
  end;
  begin
    perform public.review_profiles(array[a], 'accepted');
    raise exception 'a non-admin must not review profiles';
  exception when others then
    if sqlerrm <> 'app admin required' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub', admin_user::text, true);

  -- 큐는 pending만 담는다. 관리자에게도 profiles_select는 그대로라, 이 함수가 pending을 보는
  -- 유일한 창이고 그 창은 pending 밖으로 열리지 않는다.
  if (select count(*) from public.list_pending_profiles()) <> 3
    or public.count_pending_profiles() <> 3
    or exists (select 1 from public.list_pending_profiles() where id in (admin_id, outsider_id))
  then
    raise exception 'the queue must hold exactly the pending profiles';
  end if;

  -- 오래 기다린 순서. 최신순이면 밀린 사람이 영영 아래에 깔린다.
  -- b(-3h) -> c(-2h) -> a(-1h)이고, id 순서는 a < b < c다.
  select id into queued from public.list_pending_profiles(p_limit => 1);
  if queued <> b then raise exception 'the review queue must be oldest-first'; end if;

  -- p_limit이 null이면 `limit null`이 되어 상한이 통째로 사라진다. 03-content/05-chat/06-notifications의
  -- 읽기 RPC가 같은 이유로 `p_limit is null`을 함께 본다.
  begin
    perform public.list_pending_profiles(p_limit => null);
    raise exception 'a null limit must not become an unlimited read';
  exception when others then
    if sqlerrm <> 'limit must be between 1 and 50' then raise; end if;
  end;

  -- pending은 심사 결과가 아니다. 큐에서 사람을 꺼내지 않고 상태만 흔들 수 있으면 안 된다.
  begin
    perform public.review_profiles(array[a], 'pending');
    raise exception 'pending must not be a review outcome';
  exception when others then
    if sqlerrm <> 'invalid review status' then raise; end if;
  end;

  -- 배치 승인. 이미 심사된 사람이 배열에 섞여 있어도 그 사람은 건드리지 않고 세지도 않는다.
  reviewed := public.review_profiles(array[b, c, outsider_id], 'accepted');
  if reviewed <> 2 then raise exception 'a batch review must count only the profiles it moved'; end if;
  if not exists (select 1 from public.profiles where id = b and status = 'accepted' and status_updated_by = admin_id)
    or not exists (select 1 from public.profiles where id = c and status = 'accepted' and status_updated_by = admin_id)
  then
    raise exception 'a batch review must record who reviewed';
  end if;
  if exists (select 1 from public.profiles where id = outsider_id and status_updated_by is not null) then
    raise exception 'a batch review must not touch an already-reviewed profile';
  end if;

  -- 거절은 차단이 아니다. submit_onboarding이 'rejected'에서 다시 들어오고, 그 사람은 큐로 돌아온다.
  perform public.review_profile(a, 'rejected');
  perform set_config('request.jwt.claim.sub', applicant_a::text, true);
  perform public.submit_onboarding('신청자 A','student','300301'::char(6),1::int2,30::int2,'male','domestic',null,false,'01011112222','2008-03-01','다시 제출합니다',412::int2);
  perform set_config('request.jwt.claim.sub', admin_user::text, true);
  if public.count_pending_profiles() <> 1
    or (select id from public.list_pending_profiles()) <> a
  then
    raise exception 'a rejected applicant must be able to reapply';
  end if;

  -- 두 번째 관리자. bootstrap은 admin이 0명일 때만 통해서 이 문이 없으면 승인자가 한 명으로
  -- 굳고, 그 사람이 졸업하는 날 가입 승인이 멈춘다. 대상은 accepted여야 하고, 강등은 없다.
  perform set_config('request.jwt.claim.sub', outsider::text, true);
  begin
    perform public.set_app_admin(outsider_id);
    raise exception 'a non-admin must not appoint an app admin';
  exception when others then
    if sqlerrm <> 'app admin required' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub', admin_user::text, true);
  begin
    perform public.set_app_admin(a);
    raise exception 'a pending profile must not become an app admin';
  exception when others then
    if sqlerrm <> 'accepted profile required' then raise; end if;
  end;

  perform public.set_app_admin(outsider_id);
  perform set_config('request.jwt.claim.sub', outsider::text, true);
  perform public.count_pending_profiles();

  -- 강등. 새 관리자가 첫 관리자를 내릴 수 있다 -- app admin끼리는 대등하다.
  perform public.unset_app_admin(admin_id);
  if exists (select 1 from public.profiles where id = admin_id and role = 'admin') then
    raise exception 'demotion failed';
  end if;

  -- 마지막 한 명은 못 내린다. 0명이 되면 다시 세우는 길이 service_role뿐이라 앱 안에서
  -- 복구할 수 없는 상태가 된다.
  begin
    perform public.unset_app_admin(outsider_id);
    raise exception 'the last app admin must not be demotable';
  exception when others then
    if sqlerrm <> 'the last app admin cannot be demoted' then raise; end if;
  end;

  -- db diff는 GRANT를 뱉지 않는다. 손으로 닫지 않으면 새 함수는 PUBLIC(=anon)에게 열린 채 태어난다.
  if has_function_privilege('anon', 'public.set_app_admin(bigint)', 'EXECUTE')
    or has_function_privilege('anon', 'public.unset_app_admin(bigint)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.set_app_admin(bigint)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.unset_app_admin(bigint)', 'EXECUTE')
    or has_function_privilege('anon', 'public.list_pending_profiles(bigint,int4)', 'EXECUTE')
    or has_function_privilege('anon', 'public.count_pending_profiles()', 'EXECUTE')
    or has_function_privilege('anon', 'public.review_profiles(bigint[],public.profile_status)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.list_pending_profiles(bigint,int4)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.review_profiles(bigint[],public.profile_status)', 'EXECUTE')
  then
    raise exception 'the review queue must be closed to anon and open to authenticated';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 내 profile (get_my_profile)
--
-- 클라이언트가 자기 행을 고르는 유일한 열쇠다. profiles_select는 본인 행을 이미 열어두지만
-- auth_user_id가 컬럼 grant에서 빠져 있어, 이 함수가 없으면 로그인한 사람이 자기 profile.id를
-- 알아낼 방법이 없다.
-- ---------------------------------------------------------------------------

do $$
declare
  owner_user uuid := '77777777-7777-4777-8777-777777777777';
  other_user uuid := '88888888-8888-4888-8888-888888888888';
  owner_id bigint;
  other_id bigint;
  mine record;
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values
    (owner_user, 'my-profile-owner@example.com', '{"name":"My Profile Owner"}'::jsonb),
    (other_user, 'my-profile-other@example.com', '{"name":"My Profile Other"}'::jsonb);

  select id into owner_id from public.profiles where auth_user_id = owner_user;
  select id into other_id from public.profiles where auth_user_id = other_user;

  -- 아직 온보딩 전(status='none')이라도 자기 행은 나와야 한다. 승인 대기 화면을 그리려면
  -- 그 status를 읽어야 하는데, accepted를 요구하면 정확히 그 사람이 못 읽는다.
  perform set_config('request.jwt.claim.sub', owner_user::text, true);
  select * into mine from public.get_my_profile();
  if mine.id <> owner_id or mine.status <> 'none' then
    raise exception 'get_my_profile must return the caller row before onboarding';
  end if;

  perform public.submit_onboarding('내 프로필','student','300777'::char(6),3::int2,30::int2,'male','international','과학기술부',false,'01099998888','2008-07-07','소개글',777::int2);
  -- 상대는 학생이 아니라 선생님으로 둔다. 학생이면 학번·기수 없이 accepted가 될 수 없다
  -- (profiles_student_identity_check).
  update public.profiles set type = 'teacher' where id = other_id;
  update public.profiles
  set status = 'accepted',
      contact_email = case when id = owner_id then 'owner-contact@example.com' else 'other-contact@example.com' end
  where id in (owner_id, other_id);

  -- 정확히 한 행. 학교 전체가 accepted라 profiles_select로는 남의 행도 보이지만, 이 함수는
  -- 호출자 본인으로 잠겨 있어야 한다.
  if (select count(*) from public.get_my_profile()) <> 1 then
    raise exception 'get_my_profile must return exactly one row';
  end if;

  select * into mine from public.get_my_profile();
  if mine.name <> '내 프로필'
    or mine.student_number <> '300777'
    or mine.department <> '과학기술부'
    or mine.track <> 'international'
    or mine.dorm_room <> 777
    or mine.contact_email <> 'owner-contact@example.com'
    or mine.status <> 'accepted'
  then
    raise exception 'get_my_profile must carry the onboarding fields';
  end if;

  -- 다른 사람이 부르면 그 사람의 행이 나온다. 인자가 없으니 남의 행을 요구할 방법 자체가 없다.
  perform set_config('request.jwt.claim.sub', other_user::text, true);
  select * into mine from public.get_my_profile();
  if mine.id <> other_id then
    raise exception 'get_my_profile must follow the caller, not a parameter';
  end if;

  -- 역할마다 화면에 없는 값은 DB에서도 남길 수 없다. 선생님 성별이나 졸업생 반이 직접
  -- UPDATE로 섞이면 나중에 역할을 다시 바꿨을 때 잘못된 학적 정보가 되살아난다.
  begin
    update public.profiles set gender = 'male' where id = other_id;
    raise exception 'a teacher must not carry gender';
  exception when check_violation then
    null;
  end;

  begin
    update public.profiles set type = 'alumni', class_no = 1 where id = other_id;
    raise exception 'an alumnus must not carry a class number';
  exception when check_violation then
    null;
  end;

  -- 탈퇴한 껍데기는 내주지 않는다.
  perform public.withdraw_profile();
  if exists (select 1 from public.get_my_profile()) then
    raise exception 'get_my_profile must not return a withdrawn profile';
  end if;
  if (select contact_email from public.profiles where id = other_id) is not null then
    raise exception 'withdrawal must scrub the contact email';
  end if;

  -- 편집이 실제로 저장되는 필드는 컬럼 grant가 정한다. 화면이 무엇을 그리든 이 열 개가 전부다.
  if not has_column_privilege('authenticated', 'public.profiles', 'contact_email', 'SELECT')
    or not has_function_privilege('authenticated', 'public.get_my_profile()', 'EXECUTE')
    or not has_column_privilege('authenticated', 'public.profiles', 'name', 'UPDATE')
    or not has_column_privilege('authenticated', 'public.profiles', 'gender', 'UPDATE')
    or not has_column_privilege('authenticated', 'public.profiles', 'phone_number', 'UPDATE')
    or not has_column_privilege('authenticated', 'public.profiles', 'contact_email', 'UPDATE')
    or not has_column_privilege('authenticated', 'public.profiles', 'birthday', 'UPDATE')
    or not has_column_privilege('authenticated', 'public.profiles', 'description', 'UPDATE')
    or not has_column_privilege('authenticated', 'public.profiles', 'cohort', 'UPDATE')
    or not has_column_privilege('authenticated', 'public.profiles', 'class_no', 'UPDATE')
    or not has_column_privilege('authenticated', 'public.profiles', 'track', 'UPDATE')
    or not has_column_privilege('authenticated', 'public.profiles', 'department', 'UPDATE')
    or not has_column_privilege('authenticated', 'public.profiles', 'dorm_room', 'UPDATE')
  then
    raise exception 'the profile edit form has no matching update grant';
  end if;

  -- 학번은 심사에서 신원을 대조한 값이고 unique다. 열리면 남의 학번을 선점할 수 있다.
  -- role/status는 권한과 심사 결과라 각자 RPC가 유일한 문이고(set_app_admin, review_profile),
  -- avatar_url/cover_image_url은 업로드된 object를 검증하는 finalize RPC만이 붙일 수 있다.
  if has_column_privilege('authenticated', 'public.profiles', 'student_number', 'UPDATE')
    or has_column_privilege('authenticated', 'public.profiles', 'role', 'UPDATE')
    or has_column_privilege('authenticated', 'public.profiles', 'status', 'UPDATE')
    or has_column_privilege('authenticated', 'public.profiles', 'type', 'UPDATE')
    or has_column_privilege('authenticated', 'public.profiles', 'avatar_url', 'UPDATE')
    or has_column_privilege('authenticated', 'public.profiles', 'cover_image_url', 'UPDATE')
  then
    raise exception 'a profile column that only the school or an RPC may set is client-writable';
  end if;

  -- grant를 넓혀도 무결성은 constraint가 계속 잡는다. 학생이 기수를 비우면 거절돼야 한다 --
  -- 안 그러면 "학번은 있는데 기수가 없는 학생"이 만들어지고, 명부가 그 자리에서 깨진다.
  perform set_config('request.jwt.claim.sub', owner_user::text, true);
  begin
    update public.profiles set cohort = null where id = owner_id;
    raise exception 'a student must not be able to clear their cohort';
  exception when check_violation then
    null;
  end;

  -- 부서는 lookup FK다. 목록에 없는 이름은 들어가지 않는다.
  begin
    update public.profiles set department = '없는부서' where id = owner_id;
    raise exception 'department must stay inside the lookup table';
  exception when foreign_key_violation then
    null;
  end;

  -- db diff는 GRANT를 뱉지 않는다.
  if has_function_privilege('anon', 'public.get_my_profile()', 'EXECUTE')
    or has_function_privilege('service_role', 'public.get_my_profile()', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.get_my_profile()', 'EXECUTE')
  then
    raise exception 'get_my_profile must be open to authenticated only';
  end if;
end
$$;

rollback;
