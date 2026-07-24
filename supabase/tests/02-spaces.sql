-- 공간: 가입 정책, 멤버십, 운영 권한과 삭제 수명주기 계약.
-- supabase/schemas/02-spaces.sql

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

  if (
    select array_agg(e.enumlabel::text order by e.enumsortorder)
    from pg_enum e join pg_type t on t.oid=e.enumtypid
    where t.typname='space_anonymity_policy'
  ) <> array['disabled','optional','required'] then
    raise exception 'space anonymity policy enum contract failed';
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

  -- 공간의 생애주기. 만드는 문은 authenticated에게, 지우는 문은 service_role에게만 열려 있다.
  if not has_function_privilege('authenticated', 'public.create_space(public.space_type,text,text,text,public.space_join_policy,public.space_post_policy,public.space_anonymity_policy)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.set_space_join_policy(bigint,public.space_join_policy)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.finalize_space_image(bigint,text)', 'EXECUTE')
    or has_function_privilege('anon', 'public.create_space(public.space_type,text,text,text,public.space_join_policy,public.space_post_policy,public.space_anonymity_policy)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.soft_delete_space(bigint)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.purge_due_spaces(int4)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.purge_due_spaces(int4)', 'EXECUTE')
  then
    raise exception 'space lifecycle contract failed';
  end if;

  -- 공간 아이콘·커버 URL은 임의 경로 주입을 막기 위해 컬럼 grant로 열지 않는다. 검증된
  -- storage object만 finalize RPC가 연결하고, clear RPC만 끊는다.
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
    or has_function_privilege('anon', 'public.clear_space_image(bigint)', 'EXECUTE')
    or has_function_privilege('anon', 'public.finalize_space_cover(bigint,text)', 'EXECUTE')
    or has_function_privilege('anon', 'public.clear_space_cover(bigint)', 'EXECUTE')
  then
    raise exception 'space image contract failed';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- finalize/clear space image: 관리자만, 해당 space 경로의 새 이미지 MIME만
-- ---------------------------------------------------------------------------

do $$
declare
  manager_user uuid := '11111111-1111-4111-8111-f1f1f1f1f1f1';
  outsider_user uuid := '22222222-2222-4222-8222-f2f2f2f2f2f2';
  manager_id bigint;
  outsider_id bigint;
  space_id bigint;
  other_space_id bigint;
  space_pub_id text;
  other_space_pub_id text;
  image_path text;
  cover_path text;
  other_path text;
  stale_path text;
  non_image_path text;
begin
  insert into auth.users (id, email) values
    (manager_user, 'space-image-manager@example.com'),
    (outsider_user, 'space-image-outsider@example.com');
  select id into manager_id from public.profiles where auth_user_id=manager_user;
  select id into outsider_id from public.profiles where auth_user_id=outsider_user;
  update public.profiles set type='teacher',status='accepted' where id in (manager_id,outsider_id);

  insert into public.spaces (type,name) values ('group','이미지 공간') returning id,pub_id into space_id,space_pub_id;
  insert into public.spaces (type,name) values ('group','다른 이미지 공간') returning id,pub_id into other_space_id,other_space_pub_id;
  insert into public.space_members (space_id,user_id,role) values
    (space_id,manager_id,'owner'),
    (other_space_id,manager_id,'owner');

  image_path:=space_pub_id||'/'||gen_random_uuid()::text;
  cover_path:=space_pub_id||'/'||gen_random_uuid()::text;
  other_path:=other_space_pub_id||'/'||gen_random_uuid()::text;
  stale_path:=space_pub_id||'/'||gen_random_uuid()::text;
  non_image_path:=space_pub_id||'/'||gen_random_uuid()::text;
  insert into storage.objects (bucket_id,name,owner_id,created_at,metadata) values
    ('space-images',image_path,manager_user::text,now(),'{"mimetype":"image/png","size":1000}'::jsonb),
    ('space-covers',cover_path,manager_user::text,now(),'{"mimetype":"image/webp","size":1000}'::jsonb),
    ('space-images',other_path,manager_user::text,now(),'{"mimetype":"image/jpeg","size":1000}'::jsonb),
    ('space-images',stale_path,manager_user::text,now()-interval '25 hours','{"mimetype":"image/png","size":1000}'::jsonb),
    ('space-covers',non_image_path,manager_user::text,now(),'{"mimetype":"application/pdf","size":1000}'::jsonb);

  perform set_config('request.jwt.claim.sub',manager_user::text,true);
  perform public.finalize_space_image(space_id,image_path);
  perform public.finalize_space_cover(space_id,cover_path);
  if (select image_url from public.spaces where id=space_id) is distinct from image_path
    or (select cover_image_url from public.spaces where id=space_id) is distinct from cover_path then
    raise exception 'a manager must set independent space image slots';
  end if;

  begin
    perform public.finalize_space_image(space_id,other_path);
    raise exception 'a space image must live under that space prefix';
  exception when others then
    if sqlerrm not like '%invalid space image object%' then raise; end if;
  end;
  begin
    perform public.finalize_space_image(space_id,stale_path);
    raise exception 'a stale space image must be rejected';
  exception when others then
    if sqlerrm not like '%invalid space image object%' then raise; end if;
  end;
  begin
    perform public.finalize_space_cover(space_id,non_image_path);
    raise exception 'a non-image space cover must be rejected';
  exception when others then
    if sqlerrm not like '%invalid space cover object%' then raise; end if;
  end;
  begin
    perform public.finalize_space_cover(space_id,image_path);
    raise exception 'a cover must not accept an icon bucket object';
  exception when others then
    if sqlerrm not like '%invalid space cover object%' then raise; end if;
  end;

  perform public.clear_space_image(space_id);
  perform public.clear_space_image(space_id);
  perform public.clear_space_cover(space_id);
  perform public.clear_space_cover(space_id);
  if (select image_url from public.spaces where id=space_id) is not null
    or (select cover_image_url from public.spaces where id=space_id) is not null then
    raise exception 'a manager must be able to clear both space image slots idempotently';
  end if;

  perform set_config('request.jwt.claim.sub',outsider_user::text,true);
  begin
    perform public.finalize_space_cover(space_id,cover_path);
    raise exception 'a non-member must not set the space cover';
  exception when others then
    if sqlerrm not like '%space manager required%' then raise; end if;
  end;
  begin
    perform public.clear_space_image(space_id);
    raise exception 'a non-member must not clear the space image';
  exception when others then
    if sqlerrm not like '%space manager required%' then raise; end if;
  end;
end
$$;

-- ---------------------------------------------------------------------------
-- 공간 생성·가입 정책·영구 삭제
-- ---------------------------------------------------------------------------

do $$
declare
  admin_user uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  founder_user uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  joiner_user uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  admin_id bigint;
  founder_id bigint;
  joiner_id bigint;
  community_id bigint;
  group_id bigint;
  doomed_id bigint;
  root_post bigint;
  root_comment bigint;
  auto_pub_id text;
  cleanup record;
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values
    (admin_user, 'space-admin@example.com', '{"name":"Space Admin"}'::jsonb),
    (founder_user, 'space-founder@example.com', '{"name":"Space Founder"}'::jsonb),
    (joiner_user, 'space-joiner@example.com', '{"name":"Space Joiner"}'::jsonb);

  select id into admin_id from public.profiles where auth_user_id = admin_user;
  select id into founder_id from public.profiles where auth_user_id = founder_user;
  select id into joiner_id from public.profiles where auth_user_id = joiner_user;
  update public.profiles set type = 'teacher', status = 'accepted'
  where id in (admin_id, founder_id);
  update public.profiles set type = 'alumni', status = 'accepted' where id = joiner_id;
  perform public.bootstrap_first_app_admin(admin_id);

  -- 일반 사용자는 community만 만든다. group은 학교 조직을 옮긴 것이라 이름이 곧 권위다.
  perform set_config('request.jwt.claim.sub', founder_user::text, true);
  begin
    perform public.create_space('group', '학생회');
    raise exception 'a non-admin must not create an official group';
  exception when others then
    if sqlerrm <> 'app admin required' then raise; end if;
  end;

  community_id := public.create_space('community', '  중고 장터  ', null, null, 'request');

  -- 만든 사람은 owner이고 member_count는 1에서 시작한다. 비공식 그룹의 새 멤버는 멘션만 받는다.
  if not exists(
    select 1 from public.space_members
    where space_id = community_id and user_id = founder_id and role = 'owner'
      and notification_setting = 'mentions'
  ) or (select member_count from public.spaces where id = community_id) <> 1 then
    raise exception 'space creator must be the owner of a 1-member space';
  end if;

  -- pub_id를 안 넘기면 컬럼 default(랜덤 12자)가 그대로 남는다. 이름은 btrim된다.
  select pub_id into auto_pub_id from public.spaces where id = community_id;
  if length(auto_pub_id) <> 12
    or (select name from public.spaces where id = community_id) <> '중고 장터'
  then
    raise exception 'space defaults failed';
  end if;

  perform set_config('request.jwt.claim.sub', admin_user::text, true);
  group_id := public.create_space('group', '학생회', '자치 활동', 'student-council');
  if (select pub_id from public.spaces where id = group_id) <> 'student-council'
    or (select notification_setting from public.space_members where space_id=group_id and user_id=admin_id) <> 'all'
  then
    raise exception 'official space creation defaults failed';
  end if;

  begin
    perform public.create_space('community', '중고 장터 2', null, 'student-council');
    raise exception 'a taken pub id must be rejected';
  exception when others then
    if sqlerrm <> 'pub id already taken' then raise; end if;
  end;

  -- -------------------------------------------------------------------------
  -- 가입 정책 전환은 대기 요청을 넘어가지 못한다
  -- -------------------------------------------------------------------------

  perform set_config('request.jwt.claim.sub', joiner_user::text, true);
  if public.join_space(group_id) <> 'joined'
    or (select notification_setting from public.space_members where space_id=group_id and user_id=joiner_id) <> 'all'
  then
    raise exception 'an official space member must start with all notifications';
  end if;

  if public.join_space(community_id) <> 'requested' then
    raise exception 'a request-policy space must queue the join';
  end if;

  begin
    perform public.set_space_join_policy(community_id, 'public');
    raise exception 'a non-manager must not change the join policy';
  exception when others then
    if sqlerrm <> 'space manager required' then raise; end if;
  end;

  -- request에서 벗어나는 순간 대기 요청은 아무도 승인할 수 없는 유령이 된다. 서버가 대신
  -- 일괄 처리해 주지 않는다 -- 그건 관리자가 내릴 판단이지 정책 전환의 부수 효과일 수 없다.
  perform set_config('request.jwt.claim.sub', founder_user::text, true);
  begin
    perform public.set_space_join_policy(community_id, 'public');
    raise exception 'a pending join request must block the policy change';
  exception when others then
    if sqlerrm <> 'resolve pending join requests first' then raise; end if;
  end;

  -- 같은 값으로 바꾸는 것은 전환이 아니라서 대기 요청이 있어도 통과한다.
  perform public.set_space_join_policy(community_id, 'request');

  perform public.approve_join_request(community_id, joiner_id);
  if (select notification_setting from public.space_members where space_id=community_id and user_id=joiner_id) <> 'mentions' then
    raise exception 'a community member must start with mention notifications';
  end if;
  perform public.set_space_join_policy(community_id, 'public');
  if (select join_policy from public.spaces where id = community_id) <> 'public' then
    raise exception 'join policy change failed once the queue was empty';
  end if;

  -- -------------------------------------------------------------------------
  -- soft delete -> 7일 -> 영구 삭제
  -- -------------------------------------------------------------------------

  doomed_id := public.create_space('community', '없어질 공간');
  insert into public.posts (space_id, author_id, title, content)
  values (doomed_id, founder_id, '글', '본문')
  returning id into root_post;
  insert into public.comments (post_id, author_id, content)
  values (root_post, founder_id, '댓글')
  returning id into root_comment;
  -- 대댓글. comments.parent_id가 on delete restrict라 부모와 자식을 한 DELETE에 담을 수 없다 --
  -- purge_space가 잎부터 벗겨 내려가지 않으면 여기서 걸린다.
  insert into public.comments (post_id, author_id, parent_id, content)
  values (root_post, founder_id, root_comment, '대댓글');

  perform public.soft_delete_space(doomed_id);
  -- 유예 기간이 지나지 않았으면 손대지 않는다.
  select * into cleanup from public.purge_due_spaces();
  if cleanup.purged <> 0 or not exists(select 1 from public.spaces where id = doomed_id) then
    raise exception 'a space inside its grace period must survive';
  end if;

  update public.spaces set deleted_at = now() - interval '8 days' where id = doomed_id;

  -- 첨부가 남아 있으면 blob이 아직 Storage에 살아 있다는 뜻이다. 여기서 밀면 큐가 가리키던
  -- 행이 먼저 사라져 파일이 영영 고아로 남는다.
  insert into public.post_attachments (post_id, storage_bucket, storage_path, file_name, content_type)
  values (root_post, 'post-files', 'x/1', 'x.png', (select content_type from public.post_attachment_mime_types order by content_type limit 1));

  select * into cleanup from public.purge_due_spaces();
  if cleanup.skipped <> 1 or cleanup.purged <> 0
    or not exists(select 1 from public.spaces where id = doomed_id)
  then
    raise exception 'a space with live blobs must be skipped, not purged';
  end if;

  -- storage-maintenance가 blob을 지우면 complete_storage_cleanup이 이 행을 걷어간다.
  delete from public.post_attachments where post_id = root_post;

  -- 아이콘과 커버도 blob 참조다. 커버만 남은 공간을 밀어 버리면 cleanup queue가 참조를
  -- 잃어 blob이 고아가 되므로, image_url과 똑같이 다음 실행까지 건너뛴다.
  update public.spaces set cover_image_url='doomed-space-cover' where id=doomed_id;
  select * into cleanup from public.purge_due_spaces();
  if cleanup.skipped <> 1 or cleanup.purged <> 0
    or not exists(select 1 from public.spaces where id=doomed_id)
  then
    raise exception 'a space with a live cover blob must be skipped, not purged';
  end if;
  update public.spaces set cover_image_url=null where id=doomed_id;

  select * into cleanup from public.purge_due_spaces();
  if cleanup.purged <> 1 or cleanup.skipped <> 0 then
    raise exception 'a due space with no live blobs must be purged';
  end if;
  if exists(select 1 from public.spaces where id = doomed_id)
    or exists(select 1 from public.posts where space_id = doomed_id)
    or exists(select 1 from public.comments where post_id = root_post)
    or exists(select 1 from public.space_members where space_id = doomed_id)
  then
    raise exception 'purge left rows behind';
  end if;

  -- 살아 있는 공간은 건드리지 않는다.
  if not exists(select 1 from public.spaces where id = community_id) then
    raise exception 'purge must not touch live spaces';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- owner 불변식 (deferred 트리거)
--
-- trg_validate_space_owner는 `deferrable initially deferred`라 **COMMIT 시점에** 발화한다.
-- 그런데 이 저장소의 테스트는 전부 rollback으로 끝난다 -- 즉 이 트리거는 여태 단 한 번도 돈 적이
-- 없다. 같은 코드가 rollback으로 끝나면 통과하고 commit으로 끝나면 거부된다.
--
-- 그래서 `set constraints ... immediate`로 강제로 당겨서 발화시킨다. 커밋하지 않고도 트리거를
-- 돌리는 유일한 방법이다.
--
-- 끝나면 반드시 deferred로 되돌려야 한다. immediate로 두면 transfer_space_ownership이 깨진다 --
-- 그 함수는 기존 owner를 **먼저** 내리고 새 owner를 세우므로 두 UPDATE 사이에 owner가 0명인
-- 순간이 있고, deferred라서 그게 허용되는 것이다.
-- ---------------------------------------------------------------------------

do $$
declare
  founder uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  founder_id bigint;
  orphan_id bigint;
begin
  insert into auth.users (id, email) values (founder, 'owner-invariant@example.com');
  select id into founder_id from public.profiles where auth_user_id = founder;
  update public.profiles set type = 'teacher', status = 'accepted' where id = founder_id;
  perform set_config('request.jwt.claim.sub', founder::text, true);

  -- owner 없이 멤버만 있는 공간은 존재할 수 없다.
  begin
    insert into public.spaces (type, name) values ('community', 'owner 없는 공간')
    returning id into orphan_id;
    insert into public.space_members (space_id, user_id, role)
    values (orphan_id, founder_id, 'member');

    set constraints public.trg_validate_space_owner immediate;
    raise exception 'a space with no owner must be rejected';
  exception when others then
    if sqlerrm <> 'active space must have exactly one owner' then raise; end if;
  end;
  set constraints public.trg_validate_space_owner deferred;

  -- owner가 둘인 공간도 존재할 수 없다. 부분 유니크 인덱스(space_members_one_owner_key)가 먼저
  -- 걸리므로 여기서 나오는 문구는 트리거의 것이 아니다 -- 두 그물이 겹쳐 있다는 것이 요점이다.
  declare
    other uuid := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    other_id bigint;
    two_owner_id bigint;
  begin
    insert into auth.users (id, email) values (other, 'owner-invariant-2@example.com');
    select id into other_id from public.profiles where auth_user_id = other;
    update public.profiles set type = 'teacher', status = 'accepted' where id = other_id;

    two_owner_id := public.create_space('community', 'owner 둘인 공간');
    begin
      insert into public.space_members (space_id, user_id, role)
      values (two_owner_id, other_id, 'owner');
      raise exception 'a space must not accept a second owner';
    exception when unique_violation then
      null;
    end;

    -- 소유권 이양은 그 유니크 인덱스를 지나가야 한다. 기존 owner를 **먼저** 내리기 때문에
    -- 통과하는 것이고, 그 사이 owner가 0명인 순간은 deferred 트리거가 커밋 시점에 본다.
    -- 여기서 immediate로 당겨 그 최종 상태(정확히 1명)를 실제로 확인한다.
    insert into public.space_members (space_id, user_id, role)
    values (two_owner_id, other_id, 'admin');
    update public.spaces set member_count = 2 where id = two_owner_id;
    perform public.transfer_space_ownership(two_owner_id, other_id);

    set constraints public.trg_validate_space_owner immediate;
    set constraints public.trg_validate_space_owner deferred;

    if (select role from public.space_members where space_id = two_owner_id and user_id = other_id) <> 'owner'
      or (select role from public.space_members where space_id = two_owner_id and user_id = founder_id) <> 'admin'
    then
      raise exception 'ownership transfer must swap the two roles';
    end if;
  end;
end
$$;

rollback;
