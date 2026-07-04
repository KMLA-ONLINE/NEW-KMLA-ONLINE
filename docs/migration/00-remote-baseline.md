
# 00. Remote Baseline

- SQL 파일: `supabase/migrations/20260611072414_remote_schema.sql`

## 역할

이 파일은 애플리케이션 기능을 만드는 migration이 아니라, Supabase가 remote 환경에서 이미 갖고 있던 기본 상태를 local migration 체인에 다시 넣는 baseline이다. 즉 이 프로젝트의 도메인 규칙을 설명하는 파일이 아니라, 이후 migration들이 기대하는 출발점을 맞추는 파일이다.

## 현재 작동 방식

- `public` schema comment를 `standard public schema`로 맞춘다.
- Supabase 기본 extension이 존재하도록 보장한다.
  - `extensions.pg_stat_statements`
  - `extensions.pgcrypto`
  - `vault.supabase_vault`
  - `extensions.uuid-ossp`
- realtime publication `supabase_realtime`의 owner를 `postgres`로 맞춘다.
- `public` schema의 `USAGE`를 `postgres`, `anon`, `authenticated`, `service_role`에 준다.
- `postgres` role의 `public` default privileges를 넓게 열어 둔다.
  - tables, sequences, functions에 대해 `anon`, `authenticated`, `service_role`까지 기본 권한을 받는 상태다.

## 현재 주의점

- 이 파일만 놓고 보면 보안적으로 닫혀 있는 상태가 아니다.
- 실제 앱 권한 모델은 이 다음 `01-foundation`에서 기본 권한을 다시 회수한 뒤 시작된다.
- 여기에는 앱 도메인 테이블, RLS, helper, RPC가 없다.

## 미구현 / 계약과 차이

- 별도 앱 기능 누락이라기보다, baseline 특성상 일부러 느슨한 상태로 시작한다.
