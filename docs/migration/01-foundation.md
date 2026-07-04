# 01. Foundation

- SQL 파일: `supabase/migrations/20260612001825_foundation.sql`

## 역할

이 파일은 이후 모든 도메인 migration이 공통으로 의존하는 기반을 만든다. 크게 두 가지를 담당한다.

- baseline이 열어 둔 기본 권한을 다시 회수해서 앱 보안 모델의 출발점을 만든다.
- 이후 schema, RLS, RPC에서 반복해서 쓰는 enum과 내부용 `private` schema를 준비한다.

## 현재 작동 방식

- `public` schema의 default privileges를 회수한다.
  - tables, sequences는 `anon`, `authenticated`, `service_role`에서 revoke
  - functions는 `PUBLIC`, `anon`, `authenticated`, `service_role`에서 revoke
- 내부 helper와 trigger 함수 전용 공간으로 `private` schema를 만든다.
- `private` schema 자체도 `public`, `anon`, `authenticated`, `service_role`에 열어 두지 않는다.
- 검색과 exclusion constraint를 위해 extension을 보장한다.
  - `extensions.pg_trgm`
  - `extensions.btree_gist`
- 이후 전체 프로젝트에서 공통으로 쓰는 enum을 만든다.
  - 사용자/권한: `app_role`, `profile_gender`, `profile_type`, `profile_status`
  - membership/알림: `member_role`, `notification_setting`, `notification_level`
  - space/유틸리티: `space_join_policy`, `gongang_location`, `space_type`, `club_type`

## 현재 주의점

- 이 파일은 타입과 권한 초기화까지만 담당한다.
- helper 함수, trigger, RLS, 테이블 생성은 모두 뒤 migration에서 이어진다.
- `private` schema가 만들어졌다고 해서 자동으로 helper 접근이 생기지는 않는다. 각 helper마다 나중에 개별 grant가 필요하다.

## 미구현 / 계약과 차이

- Data API exposed schema 설정 자체는 SQL migration 안에 없다.
