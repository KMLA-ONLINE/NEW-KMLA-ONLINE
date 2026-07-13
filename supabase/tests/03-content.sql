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
  profile1 bigint; profile2 bigint; profile3 bigint;
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
    (user3, 'post-check-3@example.com', '{"name":"Post Check 3"}'::jsonb);
  select id into profile1 from public.profiles where auth_user_id = user1;
  select id into profile2 from public.profiles where auth_user_id = user2;
  select id into profile3 from public.profiles where auth_user_id = user3;
  update public.profiles set type='teacher', track='domestic', status='accepted'
  where id in (profile1, profile2, profile3);

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
end $$;

rollback;
