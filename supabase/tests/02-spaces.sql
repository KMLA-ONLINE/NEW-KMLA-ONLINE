-- 공간: 가입 정책과 멤버십 RPC의 존재 계약, 그리고 그룹 이미지 확정.
-- supabase/schemas/02-spaces.sql
--
-- 앞 블록은 카탈로그 검사고, 뒷 블록은 finalize_space_image를 실제로 찌른다. 초대 승인·소유권
-- 이양·manager의 3가지 권한을 동작으로 찌르는 테스트는 아직 없다 -- docs/db/README.md의 "검증" 참고.

begin;

do $$
begin
  -- 'open'은 제거됐다(모든 공간이 멤버십을 요구한다). 'request'가 승인 게이트를 얹는다.
  if (
    select array_agg(e.enumlabel::text order by e.enumsortorder)
    from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'space_join_policy'
  ) <> array['public', 'request', 'invite_only'] then
    raise exception 'space join policy enum contract failed';
  end if;

  if not has_column_privilege('authenticated', 'public.space_members', 'pinned_at', 'UPDATE')
    or to_regprocedure('public.join_space(bigint)') is null
    or to_regprocedure('public.accept_space_invite(text)') is null
    or to_regprocedure('public.create_space_invite(bigint,bigint,timestamp with time zone)') is null
    or to_regprocedure('public.approve_join_request(bigint,bigint)') is null
    or not has_function_privilege('authenticated', 'public.join_space(bigint)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.approve_join_request(bigint,bigint)', 'EXECUTE')
  then
    raise exception 'space membership contract failed';
  end if;

  -- 권한은 두 층이다: can_manage_space는 사람과 규칙을(owner/admin), can_curate_space는
  -- 게시판 정리를(owner/admin/manager) 맡는다. 소유권 이양은 set_space_member_role이 아니라
  -- 별도 RPC인데, 그래야 admin이 owner를 끌어내리는 쿠데타가 구조적으로 막힌다.
  if to_regprocedure('public.set_space_member_role(bigint,bigint,public.member_role)') is null
    or to_regprocedure('public.transfer_space_ownership(bigint,bigint)') is null
    or not has_function_privilege('authenticated', 'public.set_space_member_role(bigint,bigint,public.member_role)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.transfer_space_ownership(bigint,bigint)', 'EXECUTE')
  then
    raise exception 'space role model contract failed';
  end if;

  -- 그룹 이미지는 컬럼 grant로 열지 않는다 -- 열면 올린 적도 없는 경로나 남의 space 경로를 그대로
  -- 박아 넣을 수 있다. image_url을 쓰는 유일한 통로가 finalize_space_image인 것이 그 계약이다.
  if has_column_privilege('authenticated', 'public.spaces', 'image_url', 'UPDATE')
    or has_column_privilege('authenticated', 'public.spaces', 'cover_image_url', 'UPDATE')
    or to_regprocedure('public.finalize_space_image(bigint,text)') is null
    or to_regprocedure('public.clear_space_image(bigint)') is null
    or to_regprocedure('public.finalize_space_cover(bigint,text)') is null
    or to_regprocedure('public.clear_space_cover(bigint)') is null
    or not has_function_privilege('authenticated', 'public.finalize_space_image(bigint,text)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.clear_space_image(bigint)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.finalize_space_cover(bigint,text)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.clear_space_cover(bigint)', 'EXECUTE')
    or has_function_privilege('anon', 'public.finalize_space_image(bigint,text)', 'EXECUTE')
    or has_function_privilege('anon', 'public.finalize_space_cover(bigint,text)', 'EXECUTE')
  then
    raise exception 'space image contract failed';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- finalize_space_image: 관리자만, 그 space의 경로만, 내가 올린 blob만
-- ---------------------------------------------------------------------------
do $$
declare
  user1 uuid := '11111111-1111-4111-8111-f1f1f1f1f1f1';
  user2 uuid := '22222222-2222-4222-8222-f2f2f2f2f2f2';
  profile1 bigint; profile2 bigint;
  space1 bigint; space2 bigint;
  pub1 text; pub2 text;
  image1 text; image2 text; foreign_path text; cover1 text;
  stored text;
begin
  insert into auth.users (id, email) values
    (user1, 'space-image-1@example.com'),
    (user2, 'space-image-2@example.com');
  select id into profile1 from public.profiles where auth_user_id = user1;
  select id into profile2 from public.profiles where auth_user_id = user2;
  update public.profiles set type = 'teacher', status = 'accepted' where id in (profile1, profile2);

  insert into public.spaces (type, name) values ('group', '이미지 공간') returning id, pub_id into space1, pub1;
  insert into public.spaces (type, name) values ('group', '남의 공간') returning id, pub_id into space2, pub2;
  -- space마다 owner가 정확히 1명이어야 한다(trg_validate_space_owner).
  -- user1은 space1의 owner, user2는 space1의 평멤버이자 space2의 owner다.
  insert into public.space_members (space_id, user_id, role) values
    (space1, profile1, 'owner'),
    (space1, profile2, 'member'),
    (space2, profile2, 'owner');

  image1 := pub1 || '/' || gen_random_uuid()::text;
  image2 := pub1 || '/' || gen_random_uuid()::text;
  foreign_path := pub2 || '/' || gen_random_uuid()::text;
  cover1 := pub1 || '/' || gen_random_uuid()::text;

  -- 업로드된 blob 전부 user1이 올린 것으로 둔다(insert 정책은 소유자 권한으로 도는 이 테스트를
  -- 막지 않으므로 직접 넣는다). 커버는 슬롯이 달라 버킷도 다르다.
  insert into storage.objects (bucket_id, name, owner_id, metadata) values
    ('space-images', image1, user1::text, '{"mimetype":"image/png","size":1000}'::jsonb),
    ('space-images', image2, user1::text, '{"mimetype":"image/png","size":1000}'::jsonb),
    ('space-images', foreign_path, user1::text, '{"mimetype":"image/png","size":1000}'::jsonb),
    ('space-covers', cover1, user1::text, '{"mimetype":"image/png","size":1000}'::jsonb);

  perform set_config('request.jwt.claim.sub', user1::text, true);

  perform public.finalize_space_image(space1, image1);
  select image_url into stored from public.spaces where id = space1;
  if stored is distinct from image1 then
    raise exception 'a manager must be able to set the space image';
  end if;

  -- 다른 space의 경로는 못 붙인다. 안 막으면 관리자가 남의 그룹 이미지를 자기 그룹에 걸 수 있고,
  -- 그 blob이 지워지는 순간 두 그룹이 같이 깨진다.
  begin
    perform public.finalize_space_image(space1, foreign_path);
    raise exception 'a space image must live under that space prefix';
  exception when others then
    if sqlerrm not like '%invalid space image object%' then raise; end if;
  end;

  -- 갈아끼우면 이전 blob은 그 순간 고아다. 스윕을 48시간 기다리지 않고 지금 큐에 넣는다.
  perform public.finalize_space_image(space1, image2);
  if not exists (
    select 1 from private.attachment_cleanup_queue
    where storage_bucket = 'space-images' and storage_path = image1 and processed_at is null
  ) then
    raise exception 'replacing the space image must enqueue the previous blob';
  end if;

  -- 커버는 다른 슬롯이고 다른 버킷이다. 아이콘 blob을 커버로 확정하려 하면 막혀야 한다 -- 안 막으면
  -- 한 blob이 두 슬롯에 걸리고, 한쪽을 떼는 순간 청소가 나머지 쪽 사진까지 지운다.
  begin
    perform public.finalize_space_cover(space1, image2);
    raise exception 'a cover must not accept an object from the icon bucket';
  exception when others then
    if sqlerrm not like '%invalid space image object%' then raise; end if;
  end;

  perform public.finalize_space_cover(space1, cover1);
  select cover_image_url into stored from public.spaces where id = space1;
  if stored is distinct from cover1 then
    raise exception 'a manager must be able to set the space cover';
  end if;
  -- 슬롯은 서로를 덮어쓰지 않는다.
  select image_url into stored from public.spaces where id = space1;
  if stored is distinct from image2 then
    raise exception 'setting the cover must not touch the icon';
  end if;

  perform public.clear_space_cover(space1);
  if exists (select 1 from public.spaces where id = space1 and cover_image_url is not null) then
    raise exception 'a manager must be able to clear the space cover';
  end if;
  if not exists (
    select 1 from private.attachment_cleanup_queue
    where storage_bucket = 'space-covers' and storage_path = cover1 and processed_at is null
  ) then
    raise exception 'clearing the space cover must enqueue the blob';
  end if;

  -- 평멤버는 관리자가 아니다(can_manage_space = owner/admin).
  perform set_config('request.jwt.claim.sub', user2::text, true);
  begin
    perform public.finalize_space_image(space1, image2);
    raise exception 'a plain member must not set the space image';
  exception when others then
    if sqlerrm not like '%space manager required%' then raise; end if;
  end;

  -- user2는 space2의 owner라 권한은 통과하지만, foreign_path는 user1이 올린 blob이다. 경로
  -- 접두사가 space라서 소유가 경로에 드러나지 않으므로 owner_id 검사가 유일한 방어다.
  begin
    perform public.finalize_space_image(space2, foreign_path);
    raise exception 'a manager must not finalize a blob uploaded by someone else';
  exception when others then
    if sqlerrm not like '%invalid space image object%' then raise; end if;
  end;

  -- 뗄 수도 있어야 한다. 세우는 길만 있으면 한 번 올린 이미지를 영영 못 뗀다.
  perform set_config('request.jwt.claim.sub', user1::text, true);
  perform public.clear_space_image(space1);
  select image_url into stored from public.spaces where id = space1;
  if stored is not null then
    raise exception 'a manager must be able to clear the space image';
  end if;
  if not exists (
    select 1 from private.attachment_cleanup_queue
    where storage_bucket = 'space-images' and storage_path = image2 and processed_at is null
  ) then
    raise exception 'clearing the space image must enqueue the blob';
  end if;

  perform set_config('request.jwt.claim.sub', user2::text, true);
  begin
    perform public.clear_space_image(space1);
    raise exception 'a plain member must not clear the space image';
  exception when others then
    if sqlerrm not like '%space manager required%' then raise; end if;
  end;
end
$$;

rollback;
