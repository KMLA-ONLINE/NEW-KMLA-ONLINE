-- 앱 관리자와 동아리별 관리자가 실제 RLS에서도 분리되는지 검증한다.

begin;

do $$
declare
  app_admin_auth uuid := 'c1ab0000-0000-4000-8000-000000000001';
  manager_auth uuid := 'c1ab0000-0000-4000-8000-000000000002';
  outsider_auth uuid := 'c1ab0000-0000-4000-8000-000000000003';
  applicant_auth uuid := 'c1ab0000-0000-4000-8000-000000000004';
  app_admin_id bigint;
  manager_id bigint;
  outsider_id bigint;
  applicant_id bigint;
  managed_club_id bigint;
  other_club_id bigint;
  round_id bigint;
  affected integer;
  access_row record;
begin
  insert into auth.users (id, email) values
    (app_admin_auth, 'club-app-admin@example.com'),
    (manager_auth, 'club-manager@example.com'),
    (outsider_auth, 'club-outsider@example.com'),
    (applicant_auth, 'club-applicant@example.com');

  select id into app_admin_id from public.profiles where auth_user_id = app_admin_auth;
  select id into manager_id from public.profiles where auth_user_id = manager_auth;
  select id into outsider_id from public.profiles where auth_user_id = outsider_auth;
  select id into applicant_id from public.profiles where auth_user_id = applicant_auth;

  update public.profiles
  set type = 'teacher',
      status = 'accepted'
  where id in (app_admin_id, manager_id, outsider_id, applicant_id);

  update public.profiles
  set role = 'admin'
  where id = app_admin_id;

  insert into public.clubs (name)
  values ('권한 테스트 담당 동아리')
  returning id into managed_club_id;

  insert into public.clubs (name)
  values ('권한 테스트 다른 동아리')
  returning id into other_club_id;

  insert into public.club_apply_rounds (
    name,
    starts_at,
    ends_at,
    created_by
  )
  values (
    '권한 테스트 모집',
    now() - interval '1 hour',
    now() + interval '1 hour',
    app_admin_id
  )
  returning id into round_id;

  insert into public.club_recruitments (
    round_id,
    club_id,
    enabled
  )
  values
    (round_id, managed_club_id, true),
    (round_id, other_club_id, true);

  insert into public.clubs_apply (
    round_id,
    user_id,
    club_id
  )
  values (
    round_id,
    applicant_id,
    managed_club_id
  );

  -- 앱 관리자는 동아리 관리자를 임명할 수 있다.
  perform set_config(
    'request.jwt.claim.sub',
    app_admin_auth::text,
    true
  );
  set local role authenticated;

  insert into public.club_managers (
    club_id,
    user_id,
    assigned_by
  )
  values (
    managed_club_id,
    manager_id,
    app_admin_id
  );

  reset role;

  -- 동아리 관리자는 자기 동아리만 수정하고 그 동아리 지원자만 볼 수 있다.
  perform set_config(
    'request.jwt.claim.sub',
    manager_auth::text,
    true
  );
  set local role authenticated;

  update public.clubs
  set description = '담당 동아리 수정 성공'
  where id = managed_club_id;
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception
      'club manager could not update managed club';
  end if;

  update public.clubs
  set description = '수정되면 안 됨'
  where id = other_club_id;
  get diagnostics affected = row_count;
  if affected <> 0 then
    raise exception
      'club manager updated another club';
  end if;

  if not exists (
    select 1
    from public.clubs_apply
    where club_id = managed_club_id
      and user_id = applicant_id
  ) then
    raise exception
      'club manager cannot see managed-club applicant';
  end if;

  if exists (
    select 1
    from public.clubs_apply
    where club_id = other_club_id
  ) then
    raise exception
      'club manager can see another club applicants';
  end if;

  select *
  into access_row
  from public.get_my_club_access();

  if access_row.is_app_admin
    or access_row.managed_club_ids
      <> array[managed_club_id]::bigint[]
  then
    raise exception
      'club manager access summary is wrong';
  end if;

  begin
    insert into public.club_managers (
      club_id,
      user_id,
      assigned_by
    )
    values (
      other_club_id,
      outsider_id,
      manager_id
    );
    raise exception
      'club manager assigned another club manager';
  exception
    when insufficient_privilege then null;
  end;

  reset role;

  -- 일반 사용자는 동아리를 수정하거나 남의 지원서를 읽을 수 없다.
  perform set_config(
    'request.jwt.claim.sub',
    outsider_auth::text,
    true
  );
  set local role authenticated;

  update public.clubs
  set description = '수정되면 안 됨'
  where id = managed_club_id;
  get diagnostics affected = row_count;
  if affected <> 0 then
    raise exception
      'ordinary user updated a club';
  end if;

  if exists (
    select 1
    from public.clubs_apply
    where user_id = applicant_id
  ) then
    raise exception
      'ordinary user can see another user application';
  end if;

  reset role;

  -- 앱 관리자는 모든 동아리와 지원서를 관리할 수 있다.
  perform set_config(
    'request.jwt.claim.sub',
    app_admin_auth::text,
    true
  );
  set local role authenticated;

  update public.clubs
  set description = '앱 관리자 수정 성공'
  where id = other_club_id;
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception
      'app admin could not update another club';
  end if;

  if not exists (
    select 1
    from public.clubs_apply
    where user_id = applicant_id
  ) then
    raise exception
      'app admin cannot see club applications';
  end if;

  select *
  into access_row
  from public.get_my_club_access();

  if not access_row.is_app_admin then
    raise exception
      'app admin access summary is wrong';
  end if;

  reset role;
end
$$;

rollback;
