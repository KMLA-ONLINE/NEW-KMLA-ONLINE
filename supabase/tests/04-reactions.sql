-- 반응. supabase/schemas/04-reactions.sql
--
-- get_post_reactors(반응자 목록 모달의 데이터원)의 계약 중 다른 데서 안 잡히는 것만 찌른다:
-- 접근 못 하는 글이면 명단이 새지 않고, null 상한을 거부하며, keyset이 최신순으로 겹침 없이
-- 이어진다. 요약(top_reactions/my_reaction_id)은 03-content.sql이 get_post로 이미 검증한다.

begin;

do $$
declare
  owner_user uuid := 'a1a1a1a1-1111-4111-8111-aaaaaaaaaaaa';
  m2_user    uuid := 'a2a2a2a2-2222-4222-8222-bbbbbbbbbbbb';
  m3_user    uuid := 'a3a3a3a3-3333-4333-8333-cccccccccccc';
  outsider   uuid := 'a4a4a4a4-4444-4222-8222-dddddddddddd';
  p_owner bigint; p_m2 bigint; p_m3 bigint; p_out bigint;
  space1 bigint; post1 bigint; like_id bigint;
  ids bigint[]; cursor_user bigint; anonymous_count bigint;
begin
  insert into auth.users (id, email) values
    (owner_user, 'react-owner@example.com'), (m2_user, 'react-m2@example.com'),
    (m3_user, 'react-m3@example.com'), (outsider, 'react-outsider@example.com');
  select id into p_owner from public.profiles where auth_user_id=owner_user;
  select id into p_m2 from public.profiles where auth_user_id=m2_user;
  select id into p_m3 from public.profiles where auth_user_id=m3_user;
  select id into p_out from public.profiles where auth_user_id=outsider;
  update public.profiles set type='teacher', status='accepted'
  where id in (p_owner, p_m2, p_m3, p_out);

  insert into public.spaces (type, name) values ('group','반응 테스트') returning id into space1;
  insert into public.space_members (space_id, user_id, role) values
    (space1, p_owner, 'owner'), (space1, p_m2, 'member'), (space1, p_m3, 'member');
  insert into public.posts (space_id, author_id, title, content)
  values (space1, p_owner, '반응 글', '본문') returning id into post1;

  -- 세 명이 서로 다른 시각에 반응한다(created_at을 명시해 keyset 순서를 결정론적으로). 가장 최근이 m3.
  select id into like_id from public.reaction_types where key='like';
  insert into public.post_reactions (post_id, user_id, reaction_type_id, created_at) values
    (post1, p_owner, like_id, '2026-02-01 10:00:00+00'),
    (post1, p_m2,    like_id, '2026-02-01 11:00:00+00'),
    (post1, p_m3,    like_id, '2026-02-01 12:00:00+00');

  -- 접근 못 하는 글의 반응자 명단은 새지 않는다(비멤버는 존재 오라클도 못 얻는다).
  perform set_config('request.jwt.claim.sub', outsider::text, true);
  begin
    perform public.get_post_reactors(post1, null, null, 30);
    raise exception 'a non-member must not read a post reactor list';
  exception when others then
    if sqlerrm not like '%post access required%' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub', owner_user::text, true);

  -- 상한은 null도 막는다(`limit null`은 상한 없음 = 접근 가능한 반응자 통째로 유출).
  begin
    perform public.get_post_reactors(post1, null, null, null);
    raise exception 'get_post_reactors must reject a null limit';
  exception when others then
    if sqlerrm not like '%limit must be 1 to 50%' then raise; end if;
  end;

  -- keyset: 첫 페이지(1명)는 최신 반응자(m3)이고, 그 커서 뒤로 나머지가 최신순으로 겹침 없이 이어진다.
  select user_id into cursor_user from public.get_post_reactors(post1, null, null, 1);
  if cursor_user is distinct from p_m3 then
    raise exception 'first keyset page must be the newest reactor';
  end if;
  select array_agg(user_id) into ids from public.get_post_reactors(post1, null, cursor_user, 30);
  if ids is distinct from array[p_m2, p_owner] then
    raise exception 'keyset page must continue newest-first after the cursor without overlap, got %', ids;
  end if;

  -- required 이후에 찍힌 반응은 익명 스냅샷이다. 기존 실명 반응은 소급 변경하지 않는다.
  insert into public.space_members(space_id,user_id,role) values(space1,p_out,'member');
  update public.spaces set anonymity_policy='required' where id=space1;
  insert into public.post_reactions(post_id,user_id,reaction_type_id)
  values(post1,p_out,like_id);
  if not (select is_anonymous from public.post_reactions where post_id=post1 and user_id=p_out) then
    raise exception 'a required-space reaction must be stored anonymously';
  end if;
  if exists(select 1 from public.get_post_reactors(post1,null,null,30) where user_id=p_out) then
    raise exception 'get_post_reactors must not expose an anonymous reactor';
  end if;
  select reaction_count into anonymous_count
  from public.get_post_anonymous_reaction_counts(post1) where reaction_type_id=like_id;
  if anonymous_count is distinct from 1 then
    raise exception 'anonymous reactions must be exposed only as type counts';
  end if;
end $$;

rollback;
