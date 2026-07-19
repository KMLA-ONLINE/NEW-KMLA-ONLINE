-- 게시글·댓글. supabase/schemas/03-content.sql
--
-- 익명 은닉의 토대(author_id를 컬럼 grant에서 회수), 카테고리 격리, 존재 오라클 봉쇄, 작성 시
-- 트리밍을 실제로 찌른다. 이 파일이 없어서 그동안 이 불변식들이 무방비였다 -- 03-content.sql에서
-- 관련 한 줄을 지워도 아무 테스트가 안 깨졌다.

begin;

do $$
declare
  user1 uuid := '11111111-1111-4111-8111-aaaaaaaaaaaa';
  user2 uuid := '22222222-2222-4222-8222-bbbbbbbbbbbb';
  user3 uuid := '33333333-3333-4333-8333-cccccccccccc';
  user4 uuid := '44444444-4444-4222-8222-dddddddddddd';
  profile1 bigint; profile2 bigint; profile3 bigint; profile4 bigint;
  feed_space_a bigint; feed_space_b bigint; feed_nonmember_space bigint; feed_banned_space bigint;
  feed_post_a bigint; feed_post_b bigint; feed_post_c bigint; feed_cursor bigint;
  feed_ids bigint[]; feed_next_ids bigint[]; feed_space jsonb;
  space1 bigint; other_space bigint;
  cat1 bigint; other_cat bigint;
  anon_pub uuid; real_pub uuid;
  anon_id bigint; real_id bigint;
  result_author jsonb;
  result_is_mine boolean;
  like_id bigint; my_react bigint;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (user1, 'post-check-1@example.com', '{"name":"Post Check 1"}'::jsonb),
    (user2, 'post-check-2@example.com', '{"name":"Post Check 2"}'::jsonb),
    (user3, 'post-check-3@example.com', '{"name":"Post Check 3"}'::jsonb),
    (user4, 'post-check-4@example.com', '{"name":"Post Check 4"}'::jsonb);
  select id into profile1 from public.profiles where auth_user_id = user1;
  select id into profile2 from public.profiles where auth_user_id = user2;
  select id into profile3 from public.profiles where auth_user_id = user3;
  select id into profile4 from public.profiles where auth_user_id = user4;
  update public.profiles set type='teacher', track='domestic', status='accepted'
  where id in (profile1, profile2, profile3, profile4);

  -- space1: user1 owner, user2 member. other_space: user3 owner (= space1 비멤버).
  insert into public.spaces (type, name) values ('group','테스트 공간') returning id into space1;
  insert into public.spaces (type, name) values ('group','다른 공간') returning id into other_space;
  insert into public.space_members (space_id, user_id, role) values
    (space1, profile1, 'owner'), (space1, profile2, 'member'),
    (other_space, profile3, 'owner');
  insert into public.space_categories (space_id, name, sort_order) values (space1,'공지',0) returning id into cat1;
  insert into public.space_categories (space_id, name, sort_order) values (other_space,'잡담',0) returning id into other_cat;

  perform set_config('request.jwt.claim.sub', user1::text, true);

  -- -------------------------------------------------------------------------
  -- 익명 은닉의 토대: author_id는 클라이언트 컬럼 grant에서 회수돼 있어야 한다
  -- -------------------------------------------------------------------------
  -- is_anonymous는 표시 플래그일 뿐 RLS가 author_id를 가려주지 않는다. 테이블 전체 select를 주면
  -- `select author_id from posts where is_anonymous`로 익명 작성자 명단이 그대로 나온다.
  if has_column_privilege('authenticated','public.posts','author_id','SELECT')
    or has_column_privilege('authenticated','public.posts','deleted_by','SELECT')
    or has_column_privilege('authenticated','public.posts','pinned_by','SELECT')
    or has_column_privilege('authenticated','public.comments','author_id','SELECT')
    or has_column_privilege('authenticated','public.comments','deleted_by','SELECT')
  then
    raise exception 'author_id/moderator columns must not be client-readable (anonymity depends on it)';
  end if;

  -- 쓰기 grant도 컬럼 단위여야 한다. 테이블 단위면 created_at·deleted_at·is_anonymous까지 열린다.
  if has_column_privilege('authenticated','public.posts','created_at','INSERT')
    or has_column_privilege('authenticated','public.posts','deleted_at','UPDATE')
    or has_column_privilege('authenticated','public.posts','is_anonymous','UPDATE')
  then
    raise exception 'posts client write grants must not include created_at/deleted_at/is_anonymous';
  end if;

  -- -------------------------------------------------------------------------
  -- 익명 글: 읽기 RPC가 author를 null로 지운다 (작성자 본인에게도)
  -- -------------------------------------------------------------------------
  real_pub := public.create_post_with_attachments(space1,'실명 글','실명 본문','[]'::jsonb,null,false);
  anon_pub := public.create_post_with_attachments(space1,'익명 글','익명 본문','[]'::jsonb,null,true);
  select post_id into real_id from public.get_post(real_pub);
  select post_id into anon_id from public.get_post(anon_pub);

  select author, is_mine into result_author, result_is_mine from public.get_post(anon_pub);
  if result_author is not null then raise exception 'anonymous post must not expose author, even to its writer'; end if;
  if result_is_mine is not true then raise exception 'is_mine must be true for own anonymous post'; end if;

  select author into result_author from public.get_post(real_pub);
  if result_author is null or (result_author->>'id')::bigint <> profile1 then
    raise exception 'named post must expose its author';
  end if;

  -- 다른 멤버가 봐도 익명 author는 null, is_mine은 false.
  perform set_config('request.jwt.claim.sub', user2::text, true);
  select author, is_mine into result_author, result_is_mine from public.get_post(anon_pub);
  if result_author is not null then raise exception 'anonymous author must not leak to other members'; end if;
  if result_is_mine is not false then raise exception 'is_mine must be false for another user post'; end if;
  perform set_config('request.jwt.claim.sub', user1::text, true);

  -- -------------------------------------------------------------------------
  -- 트리밍: 작성 시 앞뒤 공백 제거 (수정 때만 트리밍되던 비대칭 봉쇄)
  -- -------------------------------------------------------------------------
  real_pub := public.create_post_with_attachments(space1,'   앞뒤 공백   ','   본문 공백   ','[]'::jsonb,null,false);
  if exists(select 1 from public.posts p where p.pub_id=real_pub and (p.title <> '앞뒤 공백' or p.content <> '본문 공백')) then
    raise exception 'create must trim title and content';
  end if;

  -- -------------------------------------------------------------------------
  -- 카테고리 격리: 다른 space의 카테고리로 글을 쓸 수 없다 (trg_validate_post_category)
  -- -------------------------------------------------------------------------
  begin
    perform public.create_post_with_attachments(space1,'교차','본문','[]'::jsonb,other_cat,false);
    raise exception 'a post must not accept a category from another space';
  exception when others then
    if sqlerrm not like '%category must belong to the same space%' then raise; end if;
  end;

  -- -------------------------------------------------------------------------
  -- 존재 오라클: 비멤버의 삭제 시도는 "없는 글"과 똑같이 조용히 끝난다
  -- -------------------------------------------------------------------------
  -- user3은 space1 비멤버다. 남의 글을 지우려 할 때 예외를 던지면 "그 id의 글이 존재하고 내가
  -- 권한이 없다"가 새어, 비공개 space의 글 존재를 id로 스캔할 수 있다. 조용히 리턴해야 한다.
  perform set_config('request.jwt.claim.sub', user3::text, true);
  perform public.soft_delete_post(anon_id);  -- 예외 없이 끝나야 한다
  perform set_config('request.jwt.claim.sub', user1::text, true);
  if exists(select 1 from public.posts where id=anon_id and deleted_at is not null) then
    raise exception 'a non-member must not be able to delete another space post';
  end if;

  perform public.soft_delete_post(anon_id);  -- 작성자 본인은 지울 수 있다
  if not exists(select 1 from public.posts where id=anon_id and deleted_at is not null) then
    raise exception 'the author must be able to soft-delete their own post';
  end if;

  -- -------------------------------------------------------------------------
  -- 반응 요약: my_reaction_id가 호출자의 반응을 반영한다 (복붙에서 함수로 뺀 뒤에도)
  -- -------------------------------------------------------------------------
  select id into like_id from public.reaction_types where key='like';
  insert into public.post_reactions (post_id, user_id, reaction_type_id) values (real_id, profile1, like_id);
  select my_reaction_id into my_react from public.get_post((select pub_id from public.posts where id=real_id));
  if my_react is distinct from like_id then raise exception 'my_reaction_id must reflect the caller reaction'; end if;
  -- -------------------------------------------------------------------------
  -- 홈 피드: 멤버인 여러 space를 최신순으로 합치고, 비멤버·차단 멤버 space는 제외한다
  -- -------------------------------------------------------------------------
  insert into public.spaces (type,name) values ('group','피드 A') returning id into feed_space_a;
  insert into public.spaces (type,name) values ('community','피드 B') returning id into feed_space_b;
  insert into public.spaces (type,name) values ('group','피드 비멤버') returning id into feed_nonmember_space;
  insert into public.spaces (type,name) values ('group','피드 차단') returning id into feed_banned_space;
  -- space마다 owner가 정확히 1명이어야 한다(trg_validate_space_owner). 이 트리거는 deferred라
  -- rollback으로 끝나는 테스트에선 owner를 빼먹어도 조용히 넘어가지만, 그러면 존재할 수 없는
  -- 상태(주인 없는 space)를 두고 피드를 검증하는 셈이 된다.
  insert into public.space_members (space_id,user_id,role,banned_at) values
    (feed_space_a,profile4,'owner',null),
    (feed_space_b,profile1,'owner',null),
    (feed_space_b,profile4,'member',null),
    (feed_nonmember_space,profile2,'owner',null),
    (feed_banned_space,profile1,'owner',null),
    (feed_banned_space,profile4,'member',now());
  insert into public.posts (space_id,author_id,title,content,is_anonymous,created_at) values
    (feed_space_a,profile4,'피드 첫 글','본문',true,'2026-01-03 10:00:00+00') returning id into feed_post_a;
  insert into public.posts (space_id,author_id,title,content,is_anonymous,created_at) values
    (feed_space_b,profile4,'피드 둘째 글','본문',false,'2026-01-02 10:00:00+00') returning id into feed_post_b;
  insert into public.posts (space_id,author_id,title,content,is_anonymous,created_at) values
    (feed_space_a,profile4,'피드 셋째 글','본문',false,'2026-01-01 10:00:00+00') returning id into feed_post_c;
  insert into public.posts (space_id,author_id,title,content,is_anonymous,created_at) values
    (feed_nonmember_space,profile2,'비멤버 글','본문',false,'2026-01-04 10:00:00+00'),
    (feed_banned_space,profile4,'차단 글','본문',false,'2026-01-05 10:00:00+00');

  perform set_config('request.jwt.claim.sub', user4::text, true);
  select array_agg(post_id order by created_at desc, post_id desc)
  into feed_ids from public.list_feed_posts(null,2);
  if feed_ids is distinct from array[feed_post_a,feed_post_b] then
    raise exception 'feed must merge member spaces in created_at desc order and exclude inaccessible spaces';
  end if;
  select author, is_mine, space into result_author, result_is_mine, feed_space
  from public.list_feed_posts(null,2) where post_id=feed_post_a;
  if result_author is not null or result_is_mine is not true then
    raise exception 'own anonymous feed post must hide author but retain is_mine';
  end if;
  if feed_space->>'name' <> '피드 A' or feed_space->>'type' <> 'group' or feed_space->>'pub_id' is null then
    raise exception 'feed space tag must contain name, type, and pub_id';
  end if;
  feed_cursor := feed_ids[2];
  select array_agg(post_id order by created_at desc, post_id desc)
  into feed_next_ids from public.list_feed_posts(feed_cursor,20);
  if feed_next_ids is distinct from array[feed_post_c] then
    raise exception 'feed keyset page must continue without overlap';
  end if;

  -- -------------------------------------------------------------------------
  -- 상한은 null도 막아야 한다: `limit null`은 상한이 없다는 뜻이다
  -- -------------------------------------------------------------------------
  -- p_limit=null이면 `p_limit < 1`이 참이 아니라 null이라 가드를 지나가고, `limit null`은 전부를
  -- 뜻한다. 즉 호출 한 번으로 접근 가능한 글/댓글을 통째로 가져갈 수 있다. 페이지네이션이 있는
  -- 읽기 RPC는 전부 이걸 막아야 한다.
  begin
    perform public.list_feed_posts(null, null);
    raise exception 'list_feed_posts must reject a null limit';
  exception when others then
    if sqlerrm not like '%limit must be 1 to 50%' then raise; end if;
  end;

  begin
    perform public.list_space_posts(feed_space_a, null, null, null);
    raise exception 'list_space_posts must reject a null limit';
  exception when others then
    if sqlerrm not like '%limit must be 1 to 50%' then raise; end if;
  end;

  begin
    perform public.get_post_comments(feed_post_c, null, null);
    raise exception 'get_post_comments must reject a null limit';
  exception when others then
    if sqlerrm not like '%limit must be 1 to 50%' then raise; end if;
  end;
end $$;

do $$
declare
  user1 uuid := '11111111-1111-4111-8111-eeeeeeeeeeee';
  user2 uuid := '22222222-2222-4222-8222-eeeeeeeeeeee';
  profile1 bigint;
  profile2 bigint;
  space1 bigint;
  post1 bigint;
  root_comment bigint;
  child_comment bigint;
  grandchild_comment bigint;
begin
  insert into auth.users (id,email) values
    (user1,'comment-delete-root@example.com'),
    (user2,'comment-delete-child@example.com');
  select id into profile1 from public.profiles where auth_user_id=user1;
  select id into profile2 from public.profiles where auth_user_id=user2;
  update public.profiles set type='teacher',status='accepted' where id in (profile1,profile2);
  insert into public.spaces (type,name) values ('group','comment delete tree') returning id into space1;
  insert into public.space_members (space_id,user_id,role) values
    (space1,profile1,'owner'),(space1,profile2,'member');
  insert into public.posts (space_id,author_id,title,content)
  values (space1,profile1,'comment tree','body') returning id into post1;
  insert into public.comments (post_id,author_id,content)
  values (post1,profile1,'root') returning id into root_comment;
  insert into public.comments (post_id,author_id,parent_id,content)
  values (post1,profile2,root_comment,'child') returning id into child_comment;
  insert into public.comments (post_id,author_id,parent_id,content)
  values (post1,profile1,child_comment,'grandchild') returning id into grandchild_comment;

  perform set_config('request.jwt.claim.sub',user1::text,true);
  perform public.soft_delete_comment(root_comment);
  if exists (
    select 1 from public.comments
    where id in (root_comment,child_comment,grandchild_comment)
      and (deleted_at is null or content is not null)
  ) then
    raise exception 'deleting a root comment must hide its whole subtree';
  end if;

  -- 딸려 간 답글의 deleted_by는 null이어야 한다. caller_id를 찍으면 notify_on_comment_removed가
  -- 답글 작성자 전원에게 comment_removed("모더레이션으로 삭제됨")를 쏜다 -- 스레드가 접혔을 뿐인데.
  -- 알림이 더 가는 것은 화면상 에러가 아니라 아무도 모르고, 받은 사람만 억울하다.
  if exists (
    select 1 from public.comments
    where id in (child_comment,grandchild_comment) and deleted_by is not null
  ) then
    raise exception 'cascaded replies must not carry deleted_by (it fires comment_removed)';
  end if;
  if exists (
    select 1 from public.notifications
    where type='comment_removed' and comment_id in (child_comment,grandchild_comment)
  ) then
    raise exception 'a cascaded reply author was told their comment was moderated';
  end if;

  -- 죽은 서브트리는 되살아나지 않는다. 여기에 답글이 하나라도 꽂히면 has_active_descendant가 조상
  -- 전부를 true로 만들어 방금 지운 트리가 tombstone으로 다시 뜨고, purge는 잎만 걷으므로 그
  -- 조상들은 영영 안 지워진다. trg_validate_comment_parent가 막는데, 그게 없어도 화면엔 에러가
  -- 안 뜬다 -- 스레드가 조용히 돌아올 뿐이다.
  begin
    insert into public.comments (post_id,author_id,parent_id,content)
    values (post1,profile2,child_comment,'zombie');
    raise exception 'replying under a soft-deleted comment must be rejected';
  exception when raise_exception then
    if sqlerrm <> 'comment parent must be an active comment on the same post' then raise; end if;
  end;
  if private.has_active_descendant(root_comment) then
    raise exception 'a deleted comment subtree came back to life';
  end if;

  update public.comments
  set deleted_at=now()-interval '8 days'
  where id in (root_comment,child_comment,grandchild_comment);
  perform set_config('request.jwt.claim.role','service_role',true);
  perform public.purge_deleted_content();
  if exists (select 1 from public.comments where id in (root_comment,child_comment,grandchild_comment)) then
    raise exception 'deleted root comment subtree was not purged after seven days';
  end if;
end $$;

-- 배치보다 깊은 사슬도 한 겹씩 벗겨진다. 배치를 id 배열로 한 번 고정하면 뽑힌 p_limit개가 전부
-- "자식이 배치 밖에 있는" 중간 노드일 수 있고(최상위 댓글 삭제가 서브트리를 통째로 같은
-- deleted_at으로 만드니 큰 트리는 늘 경계에서 잘린다), 그러면 한 행도 못 지운 채 다음 실행이 같은
-- 집합을 다시 골라 영영 안 줄어든다. 아래 5단 사슬의 잎은 언제나 하나뿐이라 그 교착을 정확히 찌른다.
do $$
declare
  user1 uuid := '55555555-5555-4555-8555-eeeeeeeeeeee';
  profile1 bigint;
  space1 bigint;
  post1 bigint;
  chain bigint[] := '{}';
  parent bigint;
  current bigint;
  purged bigint;
begin
  insert into auth.users (id,email) values (user1,'comment-chain-purge@example.com');
  select id into profile1 from public.profiles where auth_user_id=user1;
  update public.profiles set type='teacher',status='accepted' where id=profile1;
  insert into public.spaces (type,name) values ('group','comment chain purge') returning id into space1;
  insert into public.space_members (space_id,user_id,role) values (space1,profile1,'owner');
  insert into public.posts (space_id,author_id,title,content)
  values (space1,profile1,'chain','body') returning id into post1;

  for i in 1..5 loop
    insert into public.comments (post_id,author_id,parent_id,content)
    values (post1,profile1,parent,'depth '||i) returning id into current;
    chain := chain || current;
    parent := current;
  end loop;
  update public.comments set content=null,deleted_at=now()-interval '8 days' where id=any(chain);

  perform set_config('request.jwt.claim.role','service_role',true);

  -- 배치 2 = 잎 하나 벗기고, 새로 생긴 잎 하나 더. 배열 고정 방식이면 여기서 0이 나온다.
  select purged_comments into purged from public.purge_deleted_content(interval '7 days',2);
  if purged <> 2 then
    raise exception 'leaf peeling stalled on a chain deeper than the batch (purged %)', purged;
  end if;

  select purged_comments into purged from public.purge_deleted_content(interval '7 days',100);
  if purged <> 3 or exists (select 1 from public.comments where id=any(chain)) then
    raise exception 'the rest of the deleted chain was not purged (purged %)', purged;
  end if;
end $$;

rollback;
