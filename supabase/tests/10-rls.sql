-- RLS가 **실제로 걸리는지** 본다. 이 저장소에서 유일하게 `set local role authenticated`로 도는
-- 파일이다.
--
-- 왜 따로 있는가: 나머지 테스트는 전부 postgres로 돈다. postgres는 이 테이블들의 **소유자**라
-- RLS를 통째로 건너뛴다(FORCE ROW LEVEL SECURITY를 켠 테이블이 하나도 없다). 그래서 지금까지
-- 스키마의 정책 40여 개는 단 한 번도 평가된 적이 없다 -- `spaces_select`를 `using (true)`로
-- 바꿔도, 남의 익명 정지 기록을 열어도, 전 테스트가 녹색이었다.
--
-- 00-privileges.sql은 **카탈로그**를 읽는다: "grant 엔트리가 없다"까지만 말한다. 이 파일은 실제로
-- 그 롤이 되어 쿼리를 쏜다: "정말로 못 읽는다"를 말한다. 둘은 다른 것을 증명하고, 이 앱에서
-- 익명성과 열쇠고리를 지키는 것은 후자다.
--
-- 모든 걸 덮지 않는다. **틀렸을 때 아무 소리도 안 나는 것들**만 고른다: 익명 작성자, 봉인된 키,
-- 익명 정지 기록, 심사 대기 프로필, 비멤버의 글. 이것들이 새면 아무도 모른다 -- 화면은 멀쩡하고
-- 에러도 없고, 그냥 누가 조용히 다 읽어간다.

begin;

do $$
declare
  alice uuid := 'a11ce000-0000-4000-8000-000000000001';
  bob uuid := 'b0b00000-0000-4000-8000-000000000002';
  applicant uuid := 'c0000000-0000-4000-8000-000000000003';
  alice_id bigint;
  bob_id bigint;
  applicant_id bigint;
  home_id bigint;
  outside_id bigint;
  home_post_id bigint;
  home_post_pub uuid;
  rpc_post_pub uuid;
  like_id bigint;
  leaked bigint;
  invite_token text;
begin
  insert into auth.users (id, email) values
    (alice, 'rls-alice@example.com'),
    (bob, 'rls-bob@example.com'),
    (applicant, 'rls-applicant@example.com');

  select id into alice_id from public.profiles where auth_user_id = alice;
  select id into bob_id from public.profiles where auth_user_id = bob;
  select id into applicant_id from public.profiles where auth_user_id = applicant;
  update public.profiles set type = 'teacher', status = 'accepted' where id in (alice_id, bob_id);
  -- 심사 대기 중인 사람. accepted가 아니므로 profiles_select가 남에게 보여주면 안 된다.
  update public.profiles set type = 'teacher', status = 'pending' where id = applicant_id;

  perform set_config('request.jwt.claim.sub', alice::text, true);
  home_id := public.create_space('community', 'RLS 공간');
  outside_id := public.create_space('community', 'bob이 모르는 공간');

  -- alice가 익명으로 글을 쓴다. bob은 이 글을 읽을 수 있지만 **누가 썼는지는 알 수 없어야** 한다.
  insert into public.posts (space_id, author_id, title, content, is_anonymous)
  values (home_id, alice_id, '익명 글', '본문', true)
  returning id,pub_id into home_post_id,home_post_pub;

  insert into public.space_members (space_id, user_id, role) values (home_id, bob_id, 'member');
  update public.spaces set member_count = 2 where id = home_id;

  -- required로 전환한 뒤의 반응은 익명 스냅샷이며, 명부도 owner/admin 외에는 숨긴다.
  update public.spaces set anonymity_policy='required' where id=home_id;
  select id into like_id from public.reaction_types where key='like';
  insert into public.post_reactions(post_id,user_id,reaction_type_id)
  values(home_post_id,alice_id,like_id);

  -- alice의 익명 정지 기록. 관리자에게도 보이면 안 되고(그게 익명의 조건이다) bob에게는 더더욱.
  insert into public.space_anonymity_suspensions (space_id, user_id, suspended_until)
  values (home_id, alice_id, now() + interval '1 day');

  insert into public.user_keys (user_id, identity_public_key, wrapped_user_key, wrapped_identity_secret_key)
  values (alice_id, decode(repeat('a1', 32), 'hex'), decode(repeat('dd', 60), 'hex'), decode(repeat('ee', 60), 'hex'));

  -- 여기부터 bob이다. postgres가 아니라 **진짜 authenticated 롤**로 갈아탄다 -- 이 한 줄이
  -- 이 파일의 존재 이유다. set local이라 트랜잭션이 끝나면 원래대로 돌아온다.
  perform set_config('request.jwt.claim.sub', bob::text, true);
  set local role authenticated;

  -- -------------------------------------------------------------------------
  -- 게시글 생성은 RPC 하나로만 간다
  -- -------------------------------------------------------------------------
  if has_any_column_privilege(current_user,'public.posts','INSERT') then
    raise exception 'authenticated must not have direct INSERT privileges on posts';
  end if;
  if has_sequence_privilege(current_user,'public.posts_id_seq','USAGE') then
    raise exception 'authenticated must not have USAGE on posts_id_seq';
  end if;
  if has_function_privilege(current_user,'private.can_post_in_space(bigint)','EXECUTE') then
    raise exception 'authenticated must not execute the RPC-internal posting helper directly';
  end if;
  if has_any_column_privilege(current_user,'public.post_attachments','INSERT') then
    raise exception 'authenticated must not insert post attachment metadata directly';
  end if;

  begin
    insert into public.posts(space_id,author_id,title,content)
    values(home_id,bob_id,'직접 생성 시도','본문');
    raise exception 'authenticated direct post INSERT must fail';
  exception when insufficient_privilege then
    null;
  end;

  rpc_post_pub := public.create_post_with_attachments(
    home_id,'RPC 생성','본문','[]'::jsonb,null,false,null
  );
  if not exists(select 1 from public.posts where pub_id=rpc_post_pub) then
    raise exception 'authenticated must be able to create a text-only post through the RPC';
  end if;

  -- 신고 원본 행은 신고자 자신에게도 직접 열지 않고, 목적별 RPC만 authenticated에 연다.
  if has_any_column_privilege(current_user,'public.post_reports','SELECT') then
    raise exception 'authenticated must not have direct SELECT privileges on post_reports';
  end if;
  begin
    perform reporter_id from public.post_reports;
    raise exception 'authenticated must not be able to read post report identities';
  exception when insufficient_privilege then
    null;
  end;
  if not public.report_post(home_post_pub,'other','RLS RPC 신고') then
    raise exception 'authenticated members must be able to report another member post through the RPC';
  end if;

  -- -------------------------------------------------------------------------
  -- 익명: author_id는 컬럼 grant에서 회수돼 있다
  -- -------------------------------------------------------------------------
  -- is_anonymous는 표시 플래그일 뿐이라 RLS가 컬럼을 가려주지 못한다. 테이블 전체 select를 주면
  -- `select author_id from posts where is_anonymous`로 작성자 명단이 그대로 나온다. 그래서 select가
  -- 컬럼 단위다. 이 단언이 없으면 그 grant가 되살아나도(diff의 drop+create가 흔히 그런다) 조용하다.
  begin
    select author_id into leaked from public.posts where id = home_post_id;
    raise exception 'authenticated must not be able to read posts.author_id (% leaked)', leaked;
  exception when insufficient_privilege then
    null;
  end;

  -- 글 자체는 읽힌다. 위 검사가 "아무것도 못 읽는다"로 통과하는 가짜가 아니라는 뜻이다.
  if not exists (select 1 from public.posts where id = home_post_id) then
    raise exception 'a member must still be able to read the post itself';
  end if;

  -- required 명부에서 일반 멤버는 자기 행만 볼 수 있다.
  if exists(select 1 from public.space_members where space_id=home_id and user_id=alice_id)
    or not exists(select 1 from public.space_members where space_id=home_id and user_id=bob_id)
  then
    raise exception 'required-space member directory leaked to a regular member';
  end if;

  -- 다른 사람의 익명 반응 행은 직접 조회할 수 없다. 타입별 count는 전용 RPC로만 읽는다.
  if exists(select 1 from public.post_reactions where post_id=home_post_id and user_id=alice_id) then
    raise exception 'an anonymous reaction row leaked to another member';
  end if;

  -- -------------------------------------------------------------------------
  -- 열쇠고리: 봉인된 blob은 나가지 않는다
  -- -------------------------------------------------------------------------
  -- wrapped_user_key는 **비밀번호에서 유도된** 키로 봉인돼 있다. 새면 같은 학교 아무나 반 친구의
  -- blob을 긁어가 약한 비밀번호를 오프라인에서 때릴 수 있다. 나가는 것은 공개키뿐이다.
  begin
    perform wrapped_user_key from public.user_keys where user_id = alice_id;
    raise exception 'authenticated must not be able to read user_keys.wrapped_user_key';
  exception when insufficient_privilege then
    null;
  end;

  if not exists (select 1 from public.user_keys where user_id = alice_id) then
    raise exception 'the identity public key must stay readable';
  end if;

  -- -------------------------------------------------------------------------
  -- 익명 정지 기록은 본인에게만 보인다
  -- -------------------------------------------------------------------------
  -- 이건 컬럼 grant가 아니라 **행 정책**(space_anonymity_suspensions_select)이라, 카탈로그 검사로는
  -- 절대 잡히지 않는다. 남에게 보이면 익명 글 작성자를 특정하는 통로가 된다: "익명 글 X의 작성자를
  -- 정지" 직후 목록에 새로 뜬 한 명이 곧 X다.
  if exists (select 1 from public.space_anonymity_suspensions where user_id = alice_id) then
    raise exception 'a suspension row leaked to another user: anonymity is broken';
  end if;

  -- -------------------------------------------------------------------------
  -- 심사 대기 프로필은 남에게 보이지 않는다
  -- -------------------------------------------------------------------------
  -- profiles_select에 admin 분기가 없는 이유이기도 하다 -- 관리자조차 RLS로는 못 보고
  -- list_pending_profiles라는 좁은 창으로만 본다.
  if exists (select 1 from public.profiles where id = applicant_id) then
    raise exception 'a pending profile is visible to other users';
  end if;

  -- -------------------------------------------------------------------------
  -- 비멤버는 그 공간도, 그 안의 글도 보지 못한다
  -- -------------------------------------------------------------------------
  if exists (select 1 from public.space_members m where m.space_id = outside_id) then
    raise exception 'space_members leaked for a space the caller is not in';
  end if;

  -- 선생님은 멤버가 아닌 공개 공간을 검색하거나 스스로 가입할 수 없다. 초대장은 운영자가
  -- 필요에 따라 보내는 흐름이므로 수락만은 가능하고, 수락한 뒤에는 해당 공간이 보인다.
  if exists (select 1 from public.spaces where id = outside_id) then
    raise exception 'a teacher must not discover a non-member space';
  end if;
  begin
    perform public.join_space(outside_id);
    raise exception 'a teacher must not self-join a non-member space';
  exception when others then
    if sqlerrm <> 'space not found' then raise; end if;
  end;

  reset role;
  perform set_config('request.jwt.claim.sub', alice::text, true);
  invite_token := public.create_space_invite(outside_id, bob_id);
  perform set_config('request.jwt.claim.sub', bob::text, true);
  set local role authenticated;
  if public.accept_space_invite(invite_token) <> outside_id then
    raise exception 'a teacher invitation must add the invited member';
  end if;
  if not exists (select 1 from public.spaces where id = outside_id) then
    raise exception 'an invited teacher must see the space after joining';
  end if;

  reset role;
end
$$;

rollback;
