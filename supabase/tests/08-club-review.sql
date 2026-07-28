begin;

do $$
declare
  app_admin_auth uuid :=
    'c1ab2000-0000-4000-8000-000000000001';
  manager_auth uuid :=
    'c1ab2000-0000-4000-8000-000000000002';
  pending_auth uuid :=
    'c1ab2000-0000-4000-8000-000000000003';
  applicant_auth uuid :=
    'c1ab2000-0000-4000-8000-000000000004';

  app_admin_id bigint;
  manager_id bigint;
  pending_id bigint;
  applicant_id bigint;

  managed_club_id bigint;
  other_club_id bigint;
  orphan_club_id bigint;
  general_club_id bigint;
  created_club_id bigint;

  major_round_id bigint;
  general_round_id bigint;
  affected integer;
  access_row record;
begin
  if has_column_privilege(
    'authenticated',
    'public.clubs',
    'updated_at',
    'update'
  ) or has_column_privilege(
    'authenticated',
    'public.club_recruitments',
    'updated_at',
    'update'
  ) or has_column_privilege(
    'authenticated',
    'public.club_settings',
    'updated_at',
    'update'
  ) or has_column_privilege(
    'authenticated',
    'public.club_settings',
    'updated_by',
    'update'
  ) then
    raise exception 'club audit columns are client-writable';
  end if;

  if not has_column_privilege(
    'authenticated',
    'public.clubs',
    'name',
    'insert'
  ) or not has_column_privilege(
    'authenticated',
    'public.clubs',
    'name',
    'update'
  ) or not has_column_privilege(
    'authenticated',
    'public.clubs',
    'type',
    'insert'
  ) or not has_column_privilege(
    'authenticated',
    'public.clubs',
    'type',
    'update'
  ) then
    raise exception 'club create or rename grants are missing';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'clubs_apply_recruitment_fkey'
      and confrelid =
        'public.club_recruitments'::regclass
      and confdeltype = 'r'
  ) then
    raise exception 'clubs_apply recruitment FK is missing';
  end if;

  if exists (
    select 1
    from pg_constraint
    where conname in (
      'club_managers_club_id_fkey',
      'club_recruitments_round_id_fkey',
      'club_recruitments_club_id_fkey',
      'clubs_apply_round_id_fkey',
      'clubs_apply_club_id_fkey',
      'clubs_apply_recruitment_fkey'
    )
      and confdeltype <> 'r'
  ) then
    raise exception 'club child rows do not use restrict delete rules';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'club_apply_rounds_no_overlap'
      and pg_get_constraintdef(oid)
        ilike '%type WITH =%'
  ) then
    raise exception 'club round exclusion is not scoped by type';
  end if;

  insert into auth.users (id, email)
  values
    (app_admin_auth, 'club-review-admin@example.com'),
    (manager_auth, 'club-review-manager@example.com'),
    (pending_auth, 'club-review-pending@example.com'),
    (applicant_auth, 'club-review-applicant@example.com');

  select id into app_admin_id
  from public.profiles
  where auth_user_id = app_admin_auth;

  select id into manager_id
  from public.profiles
  where auth_user_id = manager_auth;

  select id into pending_id
  from public.profiles
  where auth_user_id = pending_auth;

  select id into applicant_id
  from public.profiles
  where auth_user_id = applicant_auth;

  update public.profiles
  set type = 'teacher',
      status = 'accepted'
  where id in (
    app_admin_id,
    manager_id,
    applicant_id
  );

  update public.profiles
  set type = 'teacher',
      status = 'pending'
  where id = pending_id;

  update public.profiles
  set role = 'admin'
  where id = app_admin_id;

  insert into public.clubs (name, type)
  values ('리뷰 담당 수동', 'major')
  returning id into managed_club_id;

  insert into public.clubs (name, type)
  values ('리뷰 다른 수동', 'major')
  returning id into other_club_id;

  insert into public.clubs (name, type)
  values ('리뷰 모집 없는 수동', 'major')
  returning id into orphan_club_id;

  insert into public.clubs (name, type)
  values ('리뷰 목동', 'general')
  returning id into general_club_id;

  insert into public.club_apply_rounds (
    name,
    type,
    starts_at,
    ends_at,
    created_by
  )
  values (
    '리뷰 수동 모집',
    'major',
    now() - interval '1 hour',
    now() + interval '1 hour',
    app_admin_id
  )
  returning id into major_round_id;

  insert into public.club_apply_rounds (
    name,
    type,
    starts_at,
    ends_at,
    created_by
  )
  values (
    '리뷰 목동 모집',
    'general',
    now() - interval '1 hour',
    now() + interval '1 hour',
    app_admin_id
  )
  returning id into general_round_id;

  begin
    insert into public.club_apply_rounds (
      name,
      type,
      starts_at,
      ends_at,
      created_by
    )
    values (
      '겹치는 수동 모집',
      'major',
      now(),
      now() + interval '30 minutes',
      app_admin_id
    );

    raise exception 'overlapping major round was inserted';
  exception
    when exclusion_violation then null;
  end;

  insert into public.club_recruitments (
    round_id,
    club_id,
    enabled
  )
  values
    (major_round_id, managed_club_id, true),
    (major_round_id, other_club_id, true),
    (general_round_id, general_club_id, true);

  begin
    insert into public.club_recruitments (
      round_id,
      club_id,
      enabled
    )
    values (
      general_round_id,
      orphan_club_id,
      true
    );

    raise exception 'recruitment accepted a mismatched club type';
  exception
    when check_violation then null;
  end;

  begin
    insert into public.clubs_apply (
      round_id,
      user_id,
      club_id
    )
    values (
      major_round_id,
      applicant_id,
      orphan_club_id
    );

    raise exception 'application without recruitment was inserted';
  exception
    when foreign_key_violation then null;
  end;

  insert into public.clubs_apply (
    round_id,
    user_id,
    club_id
  )
  values (
    major_round_id,
    applicant_id,
    managed_club_id
  );

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

  insert into public.clubs (
    name,
    type
  )
  values (
    '앱 관리자 생성 동아리',
    'major'
  )
  returning id into created_club_id;

  update public.clubs
  set name = '앱 관리자 수정 동아리',
      type = 'general'
  where id = created_club_id;

  if not exists (
    select 1
    from public.clubs
    where id = created_club_id
      and updated_at is not null
  ) then
    raise exception 'clubs.updated_at was not set';
  end if;

  update public.club_settings
  set page_open = false
  where singleton;

  if not exists (
    select 1
    from public.club_settings
    where singleton
      and updated_by = app_admin_id
      and updated_at is not null
  ) then
    raise exception 'club_settings audit fields were not set';
  end if;

  update public.club_settings
  set page_open = true
  where singleton;

  delete from public.club_recruitments
  where round_id = major_round_id
    and club_id = managed_club_id;

  get diagnostics affected = row_count;

  if affected <> 0 then
    raise exception
      'recruitment with applications was deleted';
  end if;

  delete from public.club_apply_rounds
  where id = major_round_id;

  get diagnostics affected = row_count;

  if affected <> 0 then
    raise exception
      'round with recruitments was deleted';
  end if;

  reset role;

  perform set_config(
    'request.jwt.claim.sub',
    manager_auth::text,
    true
  );
  set local role authenticated;

  update public.club_recruitments
  set announcement = '담당 관리자가 수정한 공고'
  where round_id = major_round_id
    and club_id = managed_club_id;

  if not exists (
    select 1
    from public.club_recruitments
    where round_id = major_round_id
      and club_id = managed_club_id
      and updated_at is not null
  ) then
    raise exception 'club_recruitments.updated_at was not set';
  end if;

  begin
    update public.clubs
    set name = '관리자가 바꾸면 안 되는 이름'
    where id = managed_club_id;

    raise exception 'club manager renamed a club';
  exception
    when insufficient_privilege then null;
  end;

  reset role;

  update public.profiles
  set deleted_at = now()
  where id = manager_id;

  perform set_config(
    'request.jwt.claim.sub',
    manager_auth::text,
    true
  );
  set local role authenticated;

  update public.club_recruitments
  set announcement = '수정되면 안 되는 공고'
  where round_id = major_round_id
    and club_id = managed_club_id;

  get diagnostics affected = row_count;

  if affected <> 0 then
    raise exception 'deleted manager updated a recruitment';
  end if;

  delete from public.clubs_apply
  where round_id = major_round_id
    and club_id = managed_club_id;

  get diagnostics affected = row_count;

  if affected <> 0 then
    raise exception 'deleted manager deleted an application';
  end if;

  select *
  into access_row
  from public.get_my_club_access();

  if coalesce(
    cardinality(access_row.managed_club_ids),
    0
  ) <> 0 then
    raise exception 'deleted manager still has club access';
  end if;

  begin
    insert into public.clubs_apply (
      round_id,
      user_id,
      club_id
    )
    values (
      major_round_id,
      manager_id,
      other_club_id
    );

    raise exception 'deleted user inserted an application';
  exception
    when insufficient_privilege then null;
  end;

  reset role;

  perform set_config(
    'request.jwt.claim.sub',
    pending_auth::text,
    true
  );
  set local role authenticated;

  begin
    insert into public.clubs_apply (
      round_id,
      user_id,
      club_id
    )
    values (
      major_round_id,
      pending_id,
      other_club_id
    );

    raise exception 'pending user inserted an application';
  exception
    when insufficient_privilege then null;
  end;

  reset role;

  perform set_config(
    'request.jwt.claim.sub',
    applicant_auth::text,
    true
  );
  set local role authenticated;

  insert into public.clubs_apply (
    round_id,
    user_id,
    club_id
  )
  values (
    major_round_id,
    applicant_id,
    other_club_id
  );

  reset role;
end
$$;

rollback;
