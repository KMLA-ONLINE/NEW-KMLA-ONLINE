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
  feed_post_a bigint; feed_post_b bigint; feed_post_c bigint; feed_cursor bigint; feed_comment bigint;
  feed_ids bigint[]; feed_next_ids bigint[]; feed_space jsonb;
  space1 bigint; other_space bigint;
  cat1 bigint; other_cat bigint;
  anon_pub uuid; real_pub uuid;
  anon_id bigint; real_id bigint;
  result_author jsonb;
  result_is_mine boolean;
  like_id bigint; my_react bigint;
  suspend_target_pub uuid; suspend_target_id bigint;
  result_suspended boolean;
  suspended_until_before timestamptz; suspended_until_after timestamptz;
  suspension_notification_count bigint;
  too_many_attachments jsonb;
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
  update public.profiles set type='teacher', status='accepted'
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
  -- 익명 제한 취소 메뉴는 실제로 정지 중일 때만 떠야 한다: is_author_anonymity_suspended가
  -- get_post/list_space_posts/list_feed_posts에서 정지 전 false -> 정지 후 true -> 취소 후 다시
  -- false로 움직이는지 찌른다. 이 값이 항상 false로 굳으면 관리자가 이미 정지된 사람에게 취소를
  -- 못 쓰고, 항상 true면 정지 안 된 사람에게도 취소 버튼이 떠 무의미한 클릭을 유도한다.
  -- -------------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', user2::text, true);
  suspend_target_pub := public.create_post_with_attachments(space1,'익명 정지 대상','본문','[]'::jsonb,null,true);
  perform set_config('request.jwt.claim.sub', user1::text, true);
  select post_id into suspend_target_id from public.get_post(suspend_target_pub);

  select is_author_anonymity_suspended into result_suspended from public.get_post(suspend_target_pub);
  if result_suspended is not false then
    raise exception 'is_author_anonymity_suspended must be false before any suspension';
  end if;
  select is_author_anonymity_suspended into result_suspended
  from public.list_space_posts(space1,null,null,50) where pub_id=suspend_target_pub;
  if result_suspended is not false then
    raise exception 'list_space_posts must report is_author_anonymity_suspended=false before any suspension';
  end if;

  perform public.suspend_post_author_anonymity(suspend_target_id);

  select suspended_until into suspended_until_before
  from public.space_anonymity_suspensions
  where space_id=space1 and user_id=profile2;
  if suspended_until_before is distinct from now() + interval '7 days' then
    raise exception 'anonymous suspension must last exactly 7 days';
  end if;

  -- 활성 정지를 다시 걸어도 기한을 연장하거나 알림을 중복 생성하지 않는다.
  perform public.suspend_post_author_anonymity(suspend_target_id);
  select suspended_until into suspended_until_after
  from public.space_anonymity_suspensions
  where space_id=space1 and user_id=profile2;
  if suspended_until_after is distinct from suspended_until_before then
    raise exception 're-suspending an active author must not extend the deadline';
  end if;
  select count(*) into suspension_notification_count
  from public.notifications
  where recipient_id=profile2 and type='space_anonymity_suspended';
  if suspension_notification_count <> 1 then
    raise exception 're-suspending an active author must not duplicate notifications';
  end if;

  select is_author_anonymity_suspended into result_suspended from public.get_post(suspend_target_pub);
  if result_suspended is not true then
    raise exception 'get_post must report is_author_anonymity_suspended=true after a suspension';
  end if;
  select is_author_anonymity_suspended into result_suspended
  from public.list_space_posts(space1,null,null,50) where pub_id=suspend_target_pub;
  if result_suspended is not true then
    raise exception 'list_space_posts must report is_author_anonymity_suspended=true after a suspension';
  end if;
  select is_author_anonymity_suspended into result_suspended
  from public.list_feed_posts(null,50) where pub_id=suspend_target_pub;
  if result_suspended is not true then
    raise exception 'list_feed_posts must report is_author_anonymity_suspended=true after a suspension';
  end if;

  -- 관리자가 아닌 멤버에게는 정지 중이어도 항상 false다. 그렇지 않으면 멤버 전원이 익명 글
  -- 목록을 훑어 "지금 정지 중인 사람이 쓴 글"을 공짜로 골라낼 수 있다 -- 위 suspend_anonymity
  -- 주석이 경고하는 "공짜 작성자 지도"와 같은 문제를 목록 read path에 다시 여는 셈이다.
  perform set_config('request.jwt.claim.sub', user2::text, true);
  select is_author_anonymity_suspended into result_suspended from public.get_post(suspend_target_pub);
  if result_suspended is not false then
    raise exception 'is_author_anonymity_suspended must stay false for a non-manager viewer even while suspended';
  end if;
  perform set_config('request.jwt.claim.sub', user1::text, true);

  perform public.undo_post_anonymity_suspension(suspend_target_id);

  if exists(
    select 1 from public.space_anonymity_suspensions
    where space_id=space1 and user_id=profile2
  ) then
    raise exception 'undo must remove the active anonymous suspension';
  end if;

  select is_author_anonymity_suspended into result_suspended from public.get_post(suspend_target_pub);
  if result_suspended is not false then
    raise exception 'is_author_anonymity_suspended must be false again after the suspension is undone';
  end if;

  -- -------------------------------------------------------------------------
  -- 익명 정지 진입점의 실패 이유는 셋으로 갈린다
  -- -------------------------------------------------------------------------
  -- soft_delete_post(아래 "존재 오라클")와 **반대 선택**이다. 여기서는 오라클을 감수하고 실패를
  -- 구분한다 -- 관리자 화면이 "이미 지워진 글입니다"와 "권한이 없습니다"를 다르게 말해야 하기
  -- 때문이다. 네 진입점이 helper 하나(require_anonymous_*_author)를 공유하므로, 한 곳이 옛날처럼
  -- 조회부터 하도록 되돌아가면 나머지 셋도 조용히 따라간다. 그래서 넷을 다 찌른다.
  select post_id into real_id from public.get_post(real_pub);

  -- (1) 없는 콘텐츠
  begin
    perform public.suspend_post_author_anonymity(9223372036854775807);
    raise exception 'suspend must reject a missing post';
  exception when others then
    if sqlerrm <> 'post not found' then raise; end if;
  end;
  begin
    perform public.undo_comment_anonymity_suspension(9223372036854775807);
    raise exception 'undo must reject a missing comment';
  exception when others then
    if sqlerrm <> 'comment not found' then raise; end if;
  end;

  -- (2) 실명 콘텐츠 -- 익명 정지는 익명 콘텐츠에만 적용한다(실명에 열면 작성자 특정 도구가 된다)
  begin
    perform public.suspend_post_author_anonymity(real_id);
    raise exception 'suspend must reject a named post';
  exception when others then
    if sqlerrm <> 'anonymous post required' then raise; end if;
  end;
  begin
    perform public.undo_post_anonymity_suspension(real_id);
    raise exception 'undo must reject a named post';
  exception when others then
    if sqlerrm <> 'anonymous post required' then raise; end if;
  end;

  -- (3) 익명이지만 관리자가 아님. user3은 space1 비멤버다.
  perform set_config('request.jwt.claim.sub', user3::text, true);
  begin
    perform public.suspend_post_author_anonymity(suspend_target_id);
    raise exception 'suspend must reject a non-manager';
  exception when others then
    if sqlerrm <> 'space manager required' then raise; end if;
  end;
  begin
    perform public.undo_post_anonymity_suspension(suspend_target_id);
    raise exception 'undo must reject a non-manager';
  exception when others then
    if sqlerrm <> 'space manager required' then raise; end if;
  end;
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
  -- 첨부 상한은 테이블 트리거가 아니라 create/set RPC의 공용 validator가 강제한다
  -- -------------------------------------------------------------------------
  select jsonb_agg('{}'::jsonb) into too_many_attachments
  from generate_series(1,11);

  begin
    perform public.create_post_with_attachments(
      space1,'첨부 초과','본문',too_many_attachments,null,false
    );
    raise exception 'create must reject more than 10 attachments';
  exception when others then
    if sqlerrm not like '%at most 10 attachments%' then raise; end if;
  end;
  if exists(select 1 from public.posts where space_id=space1 and title='첨부 초과') then
    raise exception 'a rejected attachment list must roll back the new post';
  end if;

  begin
    perform public.set_post_attachments(real_id,too_many_attachments);
    raise exception 'set must reject more than 10 attachments';
  exception when others then
    if sqlerrm not like '%at most 10 attachments%' then raise; end if;
  end;
  if exists(select 1 from public.post_attachments where post_id=real_id) then
    raise exception 'a rejected attachment replacement must leave the existing list unchanged';
  end if;

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

  -- -------------------------------------------------------------------------
  -- 못 푸는 커서는 예외다: 조용한 빈 페이지는 "끝"과 구별되지 않는다
  -- -------------------------------------------------------------------------
  -- 커서 id로 created_at을 못 찾으면 null이 남고, `(created_at, id) < (null, id)`는 false가 아니라
  -- **null**이라 모든 행이 걸러진다. 위 null limit 가드와 같은 3값 논리 함정인데 증상이 정반대다 --
  -- 그쪽은 전부 새고 이쪽은 전부 막힌다. 예외 없이 0행이 나가면 클라이언트가 "끝에 도달"로 읽어,
  -- 커서를 잘못 만드는 버그가 에러도 로그도 없이 "가끔 스크롤이 안 돼요"로만 나타난다.

  -- 없는 id
  begin
    perform public.list_feed_posts(9223372036854775807, 20);
    raise exception 'list_feed_posts must reject an unresolvable cursor';
  exception when others then
    if sqlerrm <> 'cursor post not found' then raise; end if;
  end;

  -- 다른 space의 글을 커서로 주면 남의 타임스탬프로 이 space를 페이징하게 된다
  begin
    perform public.list_space_posts(feed_space_a, null, feed_post_b, 20);
    raise exception 'list_space_posts must reject a cursor from another space';
  exception when others then
    if sqlerrm <> 'cursor post not found in this space' then raise; end if;
  end;

  -- 다른 글의 댓글을 커서로 주는 경우도 같다
  insert into public.comments (post_id,author_id,content)
  values (feed_post_a,profile4,'커서용 댓글') returning id into feed_comment;
  begin
    perform public.get_post_comments(feed_post_c, feed_comment, 20);
    raise exception 'get_post_comments must reject a cursor from another post';
  exception when others then
    if sqlerrm <> 'cursor comment not found in this post' then raise; end if;
  end;

  -- 그리고 멀쩡한 커서는 계속 멀쩡해야 한다(가드가 정상 경로를 막으면 안 된다).
  -- feed_post_a(01-03)와 feed_post_c(01-01)는 둘 다 feed_space_a에 있다.
  select array_agg(post_id order by created_at desc, post_id desc)
  into feed_next_ids from public.list_space_posts(feed_space_a, null, feed_post_a, 20);
  if feed_next_ids is distinct from array[feed_post_c] then
    raise exception 'a valid same-space cursor must still page normally';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3단계 익명 정책, 운영진 귀속, required 우회 차단
-- ---------------------------------------------------------------------------
do $$
declare
  owner_user uuid := '81111111-1111-4111-8111-aaaaaaaaaaaa';
  manager_user uuid := '82222222-2222-4222-8222-bbbbbbbbbbbb';
  member_user uuid := '83333333-3333-4333-8333-cccccccccccc';
  owner_id bigint; manager_id bigint; member_id bigint;
  official_id bigint; community_id bigint; disabled_id bigint; optional_id bigint;
  official_post bigint; community_post bigint; target_comment bigint;
  like_id bigint;
begin
  insert into auth.users(id,email) values
    (owner_user,'anonymity-owner@example.com'),
    (manager_user,'anonymity-manager@example.com'),
    (member_user,'anonymity-member@example.com');
  select id into owner_id from public.profiles where auth_user_id=owner_user;
  select id into manager_id from public.profiles where auth_user_id=manager_user;
  select id into member_id from public.profiles where auth_user_id=member_user;
  update public.profiles set type='teacher',status='accepted'
  where id in (owner_id,manager_id,member_id);

  insert into public.spaces(type,name,anonymity_policy) values
    ('group','required official','required') returning id into official_id;
  insert into public.spaces(type,name,anonymity_policy) values
    ('community','required community','required') returning id into community_id;
  insert into public.spaces(type,name,anonymity_policy) values
    ('community','disabled anonymity','disabled') returning id into disabled_id;
  insert into public.spaces(type,name,anonymity_policy) values
    ('community','optional anonymity','optional') returning id into optional_id;
  insert into public.space_members(space_id,user_id,role) values
    (official_id,owner_id,'owner'),(official_id,manager_id,'manager'),(official_id,member_id,'member'),
    (community_id,owner_id,'owner'),(community_id,member_id,'member'),
    (disabled_id,owner_id,'owner'),(optional_id,owner_id,'owner');

  -- required 공식 그룹의 운영진은 입력값과 무관하게 운영진 익명으로 고정된다.
  insert into public.posts(space_id,author_id,title,content,is_anonymous)
  values(official_id,owner_id,'official staff','body',false) returning id into official_post;
  if not exists(
    select 1 from public.posts
    where id=official_post and is_anonymous and author_attribution='staff'
  ) then raise exception 'required official staff post attribution was not enforced'; end if;

  insert into public.comments(post_id,author_id,content,is_anonymous)
  values(official_post,manager_id,'staff reply',false) returning id into target_comment;
  if not exists(
    select 1 from public.comments
    where id=target_comment and is_anonymous and author_attribution='staff'
  ) then raise exception 'required official staff comment attribution was not enforced'; end if;

  -- 일반 멤버가 staff를 위조해도 일반 익명으로 정규화된다.
  insert into public.posts(space_id,author_id,title,content,is_anonymous,author_attribution)
  values(official_id,member_id,'member anonymous','body',false,'staff') returning id into community_post;
  if not exists(
    select 1 from public.posts
    where id=community_post and is_anonymous and author_attribution is null
  ) then raise exception 'required member post must be anonymous without staff attribution'; end if;

  -- required에서는 의미론적 멘션 행을 만들 수 없다.
  begin
    insert into public.post_mentions(post_id,user_id) values(community_post,owner_id);
    raise exception 'required-anonymity post mentions must be rejected';
  exception when others then
    if sqlerrm not like '%mentions are not available%' then raise; end if;
  end;

  -- 비공식 required 운영진은 일반 익명이 기본이고 staff를 명시적으로 선택할 수 있다.
  insert into public.posts(space_id,author_id,title,content)
  values(community_id,owner_id,'community anonymous','body') returning id into community_post;
  if not exists(select 1 from public.posts where id=community_post and is_anonymous and author_attribution is null) then
    raise exception 'required community staff must default to ordinary anonymity';
  end if;
  insert into public.posts(space_id,author_id,title,content,author_attribution)
  values(community_id,owner_id,'community staff','body','staff') returning id into community_post;
  if not exists(select 1 from public.posts where id=community_post and is_anonymous and author_attribution='staff') then
    raise exception 'required community staff attribution choice was not preserved';
  end if;

  -- disabled는 익명 입력을 실명으로, optional은 선택값 그대로 정규화한다.
  insert into public.posts(space_id,author_id,title,content,is_anonymous)
  values(disabled_id,owner_id,'forced named','body',true) returning id into community_post;
  if (select is_anonymous from public.posts where id=community_post) then
    raise exception 'disabled policy must force named content';
  end if;
  insert into public.posts(space_id,author_id,title,content,is_anonymous)
  values(optional_id,owner_id,'chosen anonymous','body',true) returning id into community_post;
  if not (select is_anonymous from public.posts where id=community_post) then
    raise exception 'optional policy must preserve the anonymous choice';
  end if;

  -- required 정지 중에는 false를 보내도 강제 익명이 먼저 적용되어 작성이 막힌다. 반응은 허용된다.
  insert into public.space_anonymity_suspensions(space_id,user_id,suspended_until)
  values(official_id,member_id,now()+interval '1 day');
  begin
    insert into public.comments(post_id,author_id,content,is_anonymous)
    values(official_post,member_id,'blocked',false);
    raise exception 'a suspended member must not bypass required anonymity with false';
  exception when others then
    if sqlerrm not like '%anonymous posting is not available%' then raise; end if;
  end;
  select id into like_id from public.reaction_types where key='like';
  insert into public.post_reactions(post_id,user_id,reaction_type_id)
  values(official_post,member_id,like_id);
  if not exists(
    select 1 from public.post_reactions
    where post_id=official_post and user_id=member_id and is_anonymous
  ) then raise exception 'required reactions must remain available and anonymous during suspension'; end if;
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

  begin
    perform public.purge_deleted_content(interval '7 days',null);
    raise exception 'purge must reject a null limit';
  exception when others then
    if sqlerrm <> 'limit must be between 1 and 1000' then raise; end if;
  end;
  begin
    perform public.purge_deleted_content(null,100);
    raise exception 'purge must reject a null cutoff';
  exception when others then
    if sqlerrm <> 'purge cutoff must be at least 1 day' then raise; end if;
  end;

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
