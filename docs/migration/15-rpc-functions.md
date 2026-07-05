# 15. RPC Functions

- SQL 파일: `supabase/migrations/20260612121242_rpc_functions.sql`

## 역할

이 파일은 SQL 상으로는 많은 RPC 정의가 한곳에 모여 있는 migration이지만, 문서 구조상으로는 공통 helper와 cross-domain 규칙을 설명하는 곳으로 본다. space/chat/content/clubs 같은 도메인별 RPC 설명은 각 도메인 문서에 배치한다.

## 현재 작동 방식

### 공통 helper

- `private.require_current_profile(boolean)`는 현재 auth user에 연결된 active profile을 강제한다.
- `private.require_app_admin()`은 accepted app admin만 통과시킨다.
- `private.require_service_role()`은 service-role 성격 작업을 보호한다.
- `private.display_author_name()`은 익명 여부에 따라 표시 이름을 계산한다.

### 도메인별 RPC 문서 배치

- identity/profile 관련 RPC: `04-identity.md`
- space/membership 관련 RPC: `05-spaces.md`
- content/post/comment 관련 RPC: `06-content.md`
- reactions registry 관련 RPC: `07-reactions.md`
- chat 관련 RPC: `08-chat.md`
- notifications 관련 RPC: `09-notifications.md`
- clubs 관련 RPC: `11-clubs.md`
- storage finalize/cleanup 관련 RPC: `17-storage-buckets.md`

### 공통 패턴

- 대부분의 user mutation RPC는 먼저 현재 profile을 확인한다.
- 관리자 전용 RPC는 accepted app admin을 다시 검사한다.
- service 작업은 JWT/session 기준으로 `service_role`만 허용한다.
- search 계열 일부 함수는 `SECURITY INVOKER`로 동작하고, 많은 mutation 함수는 `SECURITY DEFINER`로 동작한다.

## 권한과 쓰기 경로

- 대부분의 user mutation은 `authenticated`에게 execute를 주되, 함수 내부에서 다시 accepted 상태와 역할을 검사한다.
- 정말 service-only인 작업은 `service_role`만 execute할 수 있다.
- search RPC는 `SECURITY INVOKER`이고, 나머지 많은 mutation은 `SECURITY DEFINER`다.

## 현재 주의점

- 현재 실제 앱 쓰기 모델은 “테이블 직접 write”보다 RPC가 정본이다.
- 이 문서는 도메인 기능 설명서가 아니라, RPC 전반의 공통 원칙과 배치 규칙을 설명하는 문서로 유지한다.

## 미구현 / 계약과 차이

- 도메인별 구체적 주의점과 차이점은 각 도메인 문서의 마지막 섹션에서 관리한다.
