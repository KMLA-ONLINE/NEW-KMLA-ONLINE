# 01. Identity

Source: [`supabase/schemas/01-identity.sql`](../../../supabase/schemas/01-identity.sql)

앱의 사용자 기준점. `auth.users`를 직접 쓰지 않고 `public.profiles`를 실제 사용자 테이블로 둔다. 이후 모든 도메인 FK는 `profiles.id`를 참조한다.

## 테이블

- `profiles` — 이름/역할/상태/학생정보/연락처/익명이름/soft delete. `status`가 `accepted`인지가 권한 모델의 핵심 전제
- `permissions` — 문자열 key 기반 권한 registry (seed: `gongang`, `karaoke` — baseline migration)
- `user_permissions` — profile별 permission 부여

## RPC

| 함수 | 인증 | 쓰기 | 목적 |
| --- | --- | --- | --- |
| `submit_onboarding(...)` | 본인 profile (`none`/`rejected` 상태만, accepted 불필요) | O | onboarding 정보 저장, status → `pending` |
| `review_profile(profile_id, status)` | app admin | O | pending profile을 `accepted`/`rejected`로 심사 |
| `set_anonymous_username(value)` | 본인 profile (withdrawn 제외) | O | 익명 표시명 변경/해제 |
| `withdraw_profile()` | accepted 본인 (admin이거나 space owner면 거부) | O | 본인 profile 익명화 + `withdrawn` 처리 |
| `finalize_avatar(storage_path)` | 본인 profile | O | 업로드된 avatar object 검증 후 `avatar_url` 연결 |
| `bootstrap_first_app_admin(profile_id)` | service_role | O | admin이 하나도 없을 때 첫 admin 지정 |

## Private helper

| 함수 | 용도 |
| --- | --- |
| `private.current_profile_id()` | 현재 auth user의 profile id |
| `private.is_accepted_user()` | 현재 사용자가 accepted + non-deleted인지 |
| `private.is_app_admin()` | 현재 사용자가 accepted admin인지 |
| `private.has_permission(key)` | accepted + 해당 permission 보유 여부 |
| `private.require_current_profile(accepted)` | active profile 강제, 없으면 예외. RPC 공통 가드 |
| `private.require_app_admin()` | accepted admin 강제, 아니면 예외 |

## Trigger

| 트리거 | 테이블 | 이벤트 | side effect |
| --- | --- | --- | --- |
| `on_auth_user_created` | `auth.users` | AFTER INSERT | `profiles` 1행 자동 생성 (이름: metadata `full_name` → `name` → `사용자`, 50자 절단) |
| `on_auth_user_deleted` | `auth.users` | BEFORE DELETE | admin/space owner면 예외로 삭제 거부. 아니면 profile 익명화(`탈퇴한 사용자`) + `withdrawn` + `auth_user_id` null |

## 주의

- profile 생성 경로는 Auth trigger뿐이다. user metadata는 이름 외에 role/status 판정에 쓰지 않는다.
- authenticated 본인이 직접 update할 수 있는 컬럼은 `name`, `gender`, `phone_number`, `birthday`, `description`뿐. 나머지 상태 전이는 위 RPC로만 한다.
- `anonymous_username`은 trim 후 1 ~ 50자, 대소문자 비구분 전역 unique.
- 관리자용 profile 수정 RPC(`change_app_role`, `change_profile_status`, `update_verified_profile_identity`, permission 관리)는 2026-07 정리에서 제거됐다 — 필요 시 service-role 직접 SQL.
