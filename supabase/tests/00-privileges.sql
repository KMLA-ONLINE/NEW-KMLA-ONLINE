-- public 스키마 전체의 권한 불변식. 어떤 도메인에도 속하지 않고, 픽스처도 필요 없다 --
-- 전부 카탈로그를 읽을 뿐이다.
--
-- 이 파일이 잡는 것은 하나의 실패 유형이다: **`supabase db diff`는 권한을 보지 못한다.**
-- 컬럼 단위 grant를 통째로 빠뜨리고, 함수 grant는 단 하나도 내보내지 않으며, 함수를
-- drop+recreate 할 때는 기존 grant를 조용히 들고 가면서 동시에 함수의 암묵적
-- EXECUTE TO PUBLIC을 되살린다. 그 결과는 언제나 조용하다 -- 스키마 파일은 멀쩡해 보이고,
-- 마이그레이션은 깨끗이 적용되고, 그리고 뭔가가 죽어 있거나 열려 있다.
--
-- 그래서 도메인별 파일이 아니라 여기 따로 있다: 도메인 픽스처 사이에 묻어두면, 정작
-- 도메인 하나를 손볼 때 이 검사들이 눈에 안 들어온다.

begin;

do $$
begin
  -- authenticated에게 열린 insert/update 정책인데 그 테이블의 단 한 컬럼도 쓸 수 없다면,
  -- 그 정책은 영원히 발화하지 않는다. 잃어버린 컬럼 grant의 모습이 정확히 이렇다.
  if exists (
    select 1
    from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and pol.polcmd in ('a', 'w')
      and (pol.polroles = '{0}'::oid[] or 'authenticated'::regrole = any (pol.polroles))
      and not has_any_column_privilege(
            'authenticated',
            c.oid,
            case pol.polcmd when 'a' then 'INSERT' else 'UPDATE' end
          )
  ) then
    raise exception 'an insert/update policy for authenticated has no matching column grant';
  end if;

  -- 반대 방향: 테이블 단위 쓰기 grant는 authenticated에게 모든 컬럼을 준다 -- 나중에
  -- 추가될 컬럼까지 포함해서. 클라이언트 쓰기는 언제나 컬럼 단위다.
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and (
        has_table_privilege('authenticated', c.oid, 'INSERT')
        or has_table_privilege('authenticated', c.oid, 'UPDATE')
      )
  ) then
    raise exception 'authenticated holds a table-wide insert/update grant; scope it to columns';
  end if;

  -- 함수는 ACL이 없으면 EXECUTE TO PUBLIC이 기본이고, 기본 권한 회수는 그걸 막지 못한다.
  -- 그래서 새 함수도, drop 후 재생성된 함수도, 명시적으로 회수하지 않으면 anon에게 열린다.
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and has_function_privilege('anon', p.oid, 'EXECUTE')
  ) then
    raise exception 'anon must not execute public application functions';
  end if;

  -- 00-foundation의 `alter default privileges`는 **postgres가 만든 객체에만** 걸린다.
  -- Supabase의 supabase_admin 기본값은 여전히 anon에게 arwdDxtm를 주므로, 다른 롤로 DDL이
  -- 돌면 새 테이블이 anon에게 열린 채 태어나고 스키마 파일 어디에도 그 사실이 남지 않는다.
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p', 'v', 'm', 'f')
      and (
        has_any_column_privilege('anon', c.oid, 'SELECT')
        or has_any_column_privilege('anon', c.oid, 'INSERT')
        or has_any_column_privilege('anon', c.oid, 'UPDATE')
        or has_any_column_privilege('anon', c.oid, 'REFERENCES')
        or has_table_privilege('anon', c.oid, 'DELETE')
        or has_table_privilege('anon', c.oid, 'TRUNCATE')
        or has_table_privilege('anon', c.oid, 'TRIGGER')
      )
  ) then
    raise exception 'anon must not hold privileges on public tables';
  end if;

  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'S'
      and (
        has_sequence_privilege('anon', c.oid, 'USAGE')
        or has_sequence_privilege('anon', c.oid, 'SELECT')
        or has_sequence_privilege('anon', c.oid, 'UPDATE')
      )
  ) then
    raise exception 'anon must not hold privileges on public sequences';
  end if;

  -- 아무도 실행할 수 없는 public 함수는 죽은 함수이고, 거의 언제나 grant를 잃었다는 뜻이다.
  -- 파라미터 이름 하나만 바꿔도 Postgres는 create or replace를 거부하므로 diff가 drop+create를
  -- 내고, grant는 따라오지 않는다.
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
      and not has_function_privilege('service_role', p.oid, 'EXECUTE')
  ) then
    raise exception 'a public function is executable by no role: a grant was probably lost';
  end if;

  -- private 스키마의 헬퍼는 위 검사가 보지 못한다(public만 본다). 그런데 RLS 정책 표현식과
  -- security invoker 함수는 **호출자 권한으로** 실행되므로, 거기서 쓰이는 헬퍼가 grant를
  -- 잃으면 그 정책이 걸린 모든 읽기·쓰기가 "permission denied for function"으로 죽는다.
  -- 잃기 가장 쉬운 것들을 이름으로 못박아 둔다.
  if not has_function_privilege('authenticated', 'private.current_profile_id()', 'EXECUTE')
    or not has_function_privilege('authenticated', 'private.is_accepted_user()', 'EXECUTE')
    or not has_function_privilege('authenticated', 'private.is_conversation_member(bigint)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'private.can_access_message(bigint)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'private.is_direct_conversation(bigint)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'private.can_post_in_space(bigint)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'private.can_curate_space(bigint)', 'EXECUTE')
  then
    raise exception 'a private helper used by an RLS policy has lost its execute grant';
  end if;

  -- private 스키마 자체는 클라이언트의 것이 아니다. usage는 위 헬퍼를 부르기 위해 필요하지만,
  -- 테이블은 단 하나도 보이면 안 된다.
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'private'
      and c.relkind = 'r'
      and (
        has_any_column_privilege('authenticated', c.oid, 'SELECT')
        or has_any_column_privilege('anon', c.oid, 'SELECT')
      )
  ) then
    raise exception 'private tables must not be readable by clients';
  end if;
end
$$;

rollback;
