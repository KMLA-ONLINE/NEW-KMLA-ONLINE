-- 신원: auth.users -> profiles 트리거, 프로필 생애주기, 그리고 암호학적 열쇠고리.
-- supabase/schemas/01-identity.sql

begin;

do $$
declare
  user1 uuid := '11111111-1111-4111-8111-111111111111';
  user2 uuid := '22222222-2222-4222-8222-222222222222';
  profile1 bigint;
  profile2 bigint;
  -- 진짜 X25519 점일 필요가 없다. 스키마가 보는 것은 길이뿐이고, 실제 암복호 왕복은
  -- app/lib/crypto/e2ee.integration.test.ts가 진짜 키로 증명한다.
  pubkey1 bytea := decode(repeat('a1', 32), 'hex');
  pubkey2 bytea := decode(repeat('b2', 32), 'hex');
  pubkey_new bytea := decode(repeat('c3', 32), 'hex');
  sealed bytea := decode(repeat('dd', 60), 'hex');
  resealed bytea := decode(repeat('ee', 60), 'hex');
  vault record;
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values
    (user1, 'identity-check-1@example.com', '{"name":"Identity Check 1"}'::jsonb),
    (user2, 'identity-check-2@example.com', '{"name":"Identity Check 2"}'::jsonb);

  select id into profile1 from public.profiles where auth_user_id = user1;
  select id into profile2 from public.profiles where auth_user_id = user2;
  if profile1 is null or profile2 is null then
    raise exception 'auth user profile trigger failed';
  end if;

  update public.profiles
  set type = 'teacher', track = 'domestic', status = 'accepted'
  where id in (profile1, profile2);

  perform set_config('request.jwt.claim.sub', user1::text, true);
  if private.require_current_profile(true) <> profile1 then
    raise exception 'auth context lookup failed';
  end if;

  perform public.bootstrap_first_app_admin(profile1);
  if not exists (select 1 from public.profiles where id = profile1 and role = 'admin') then
    raise exception 'first app admin bootstrap failed';
  end if;

  -- -------------------------------------------------------------------------
  -- 열쇠고리 (docs/e2ee.md)
  -- -------------------------------------------------------------------------

  perform public.create_user_keys(encode(pubkey1,'base64'), encode(sealed,'base64'), encode(sealed,'base64'));
  perform set_config('request.jwt.claim.sub', user2::text, true);
  perform public.create_user_keys(encode(pubkey2,'base64'), encode(sealed,'base64'), encode(sealed,'base64'));
  perform set_config('request.jwt.claim.sub', user1::text, true);

  -- 열쇠고리를 덮어쓰면 그 사람의 DM 히스토리가 통째로 죽는다. 비밀번호가 틀려 금고가
  -- 안 열리는 클라이언트가 "그럼 새로 만들지" 하고 넘어가는 것을 막는 것이 이 실패다.
  begin
    perform public.create_user_keys(encode(pubkey1,'base64'), encode(sealed,'base64'), encode(sealed,'base64'));
    raise exception 'a second key vault should have been rejected';
  exception when others then
    if sqlerrm <> 'key vault already exists' then raise; end if;
  end;

  -- 봉인된 blob은 select grant에서 회수돼 있다. 열려 있으면 같은 학교 아무나 반 친구들의
  -- wrapped_user_key를 긁어갈 수 있는데, 그건 *비밀번호에서 유도된* 키로 봉인돼 있어서
  -- 약한 비밀번호를 오프라인에서 때릴 수 있다. 나가는 것은 공개키뿐이다.
  if not has_column_privilege('authenticated', 'public.user_keys', 'identity_public_key', 'SELECT')
    or has_column_privilege('authenticated', 'public.user_keys', 'wrapped_user_key', 'SELECT')
    or has_column_privilege('authenticated', 'public.user_keys', 'wrapped_identity_secret_key', 'SELECT')
  then
    raise exception 'user_keys must expose only the identity public key';
  end if;

  -- 클라이언트 쓰기 grant가 아예 없다 -- 쓰기 문은 RPC 세 개가 전부다.
  if has_any_column_privilege('authenticated', 'public.user_keys', 'INSERT')
    or has_any_column_privilege('authenticated', 'public.user_keys', 'UPDATE')
    or not has_function_privilege('authenticated', 'public.get_my_key_vault()', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.get_identity_public_keys(bigint[])', 'EXECUTE')
  then
    raise exception 'the key vault must be RPC-only';
  end if;

  -- 봉인된 blob이 나가는 유일한 문이고, 스스로를 호출자 행에 가둔다.
  select * into vault from public.get_my_key_vault();
  if vault.identity_public_key <> encode(pubkey1,'base64')
    or vault.wrapped_user_key <> encode(sealed,'base64')
    or (select count(*) from public.get_my_key_vault()) <> 1
  then
    raise exception 'get_my_key_vault must return exactly the caller row';
  end if;

  -- 상대의 공개키는 읽을 수 있어야 한다 -- 메시지 키를 봉인할 대상이 없으면 DM을 보낼 수 없다.
  if (select identity_public_key from public.get_identity_public_keys(array[profile2])) <> encode(pubkey2,'base64') then
    raise exception 'a peer identity public key must be readable';
  end if;

  -- 비밀번호 변경. userKey는 그대로고 봉인만 새로 한다. **신원키가 움직이지 않는다**는 것이
  -- 이 함수의 요점이다 -- 그래서 메시지를 한 통도 재암호화하지 않는데 히스토리가 살아남는다.
  perform public.reseal_user_keys(encode(resealed,'base64'));
  if not exists (
    select 1 from public.user_keys
    where user_id = profile1
      and identity_public_key = pubkey1
      and wrapped_identity_secret_key = sealed
      and wrapped_user_key = resealed
  ) then
    raise exception 'reseal must not touch the identity key';
  end if;

  -- 비밀번호를 잊었을 때의 최후 수단. 신원키까지 전부 새로 간다.
  perform public.rotate_user_keys(encode(pubkey_new,'base64'), encode(sealed,'base64'), encode(sealed,'base64'));
  if not exists (select 1 from public.user_keys where user_id = profile1 and identity_public_key = pubkey_new) then
    raise exception 'rotate must replace the identity key';
  end if;

  -- 탈퇴하면 열쇠고리도 같이 태운다. 남겨둬 봐야 아무도 열 수 없는 blob이고, 상대방 쪽
  -- 히스토리는 상대의 키로 그대로 읽힌다.
  perform set_config('request.jwt.claim.sub', user2::text, true);
  perform public.withdraw_profile();
  if exists (select 1 from public.user_keys where user_id = profile2) then
    raise exception 'withdrawal must burn the key vault';
  end if;
  if not exists (select 1 from public.profiles where id = profile2 and status = 'withdrawn' and deleted_at is not null) then
    raise exception 'withdrawal must anonymize the profile';
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

  -- 심사에 필요한 필드가 실제로 나온다.
  if (select phone_number from public.list_pending_profiles() where id = a) <> '01011112222'
    or (select cohort from public.list_pending_profiles() where id = a) <> 30
  then
    raise exception 'the queue must carry the fields a reviewer decides on';
  end if;

  -- 오래 기다린 순서. 최신순이면 밀린 사람이 영영 아래에 깔린다.
  -- b(-3h) -> c(-2h) -> a(-1h)이고, id 순서는 a < b < c다.
  select id into queued from public.list_pending_profiles(p_limit => 1);
  if queued <> b then raise exception 'the review queue must be oldest-first'; end if;
  select id into queued from public.list_pending_profiles(p_after_id => b, p_limit => 1);
  if queued <> c then raise exception 'the cursor must walk the queue in submit order'; end if;
  select id into queued from public.list_pending_profiles(p_after_id => c, p_limit => 1);
  if queued <> a then raise exception 'the cursor must walk the queue in submit order'; end if;

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

  -- 방금 b를 승인했으니 b는 더 이상 pending이 아니다. 그래도 b를 커서로 쓴 다음 페이지는 나와야
  -- 한다 -- 한 페이지의 마지막 사람을 승인하고 "더 보기"를 누르는 것이 정확히 이 모양이고,
  -- 커서가 pending을 요구하면 그 순간 남은 큐가 통째로 사라진다.
  select id into queued from public.list_pending_profiles(p_after_id => b, p_limit => 1);
  if queued <> a then raise exception 'reviewing a profile must not invalidate it as a cursor'; end if;

  -- 단건은 배치를 감싸기만 한다. 규칙이 한 곳에 살고, 실패 문구는 그대로다.
  perform public.review_profile(a, 'rejected');
  if not exists (select 1 from public.profiles where id = a and status = 'rejected') then
    raise exception 'review_profile must reject through the batch';
  end if;
  begin
    perform public.review_profile(a, 'accepted');
    raise exception 'a reviewed profile must not be reviewable again';
  exception when others then
    if sqlerrm <> 'pending profile not found' then raise; end if;
  end;

  -- 거절은 차단이 아니다. submit_onboarding이 'rejected'에서 다시 들어오고, 그 사람은 큐로 돌아온다.
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
  -- 두 번 불러도 같은 결과다. 그리고 새 관리자는 이제 스스로 큐를 연다.
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

  -- 내려간 사람은 큐도 닫힌다.
  perform set_config('request.jwt.claim.sub', admin_user::text, true);
  begin
    perform public.count_pending_profiles();
    raise exception 'a demoted admin must lose the queue';
  exception when others then
    if sqlerrm <> 'app admin required' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', outsider::text, true);

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

rollback;
