-- 공간: 가입 정책과 멤버십 RPC의 존재 계약.
-- supabase/schemas/02-spaces.sql
--
-- 전부 카탈로그 검사라 픽스처가 없다. 정책이 실제로 어떻게 동작하는지(초대 승인, 소유권
-- 이양, manager의 3가지 권한)를 찔러보는 테스트는 아직 없다 -- docs/db/README.md의 "검증" 참고.

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
end
$$;

rollback;
