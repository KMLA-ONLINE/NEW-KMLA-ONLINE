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

rollback;
