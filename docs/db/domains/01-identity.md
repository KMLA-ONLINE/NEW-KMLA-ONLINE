# 01. Identity

Source: [`supabase/schemas/01-identity.sql`](../../../supabase/schemas/01-identity.sql)

앱의 사용자 기준점. `auth.users`를 직접 쓰지 않고 `public.profiles`를 실제 사용자 테이블로 둔다. 이후 모든 도메인 FK는 `profiles.id`를 참조한다.

## 테이블

- `profile_departments` — profile에 연결할 부서 lookup (`name`). service_role이 관리하고 authenticated는 읽기만 가능
- `profiles` — 이름/역할/상태/학생정보/부서/국내·국제 track/복학 여부/연락처/avatar/cover/soft delete. `status`가 `accepted`인지가 권한 모델의 핵심 전제
- `permissions` — 문자열 key 기반 권한 registry (seed: `gongang`, `karaoke` — baseline migration)
- `user_permissions` — profile별 permission 부여

`profile_departments` seed 목록: `문화기획부`, `방송부`, `체육부`, `학습부`, `환경부`, `영어상용부`, `도서부`, `식품영양부`, `동아리관리부`, `과학기술부`, `금융정보부`, `법무부`.

## RPC


| 함수                                    | 인증                                                     | 쓰기 | 목적                                                        |
| ----------------------------------------- | ---------------------------------------------------------- | ------ | ------------------------------------------------------------- |
| `submit_onboarding(...)`                | 본인 profile (`none`/`rejected` 상태만, accepted 불필요) | O    | onboarding 정보 저장, status →`pending`                    |
| `review_profile(profile_id, status)`    | app admin                                                | O    | pending profile을`accepted`/`rejected`로 심사               |
| `withdraw_profile()`                    | accepted 본인 (admin이거나 space owner면 거부)           | O    | 본인 profile 삭제 처리 +`withdrawn` 처리                    |
| `finalize_avatar(storage_path)`         | 본인 profile                                             | O    | 업로드된 avatar object 검증 후`avatar_url` 연결             |
| `finalize_cover_image(storage_path)`    | 본인 profile                                             | O    | 업로드된 profile cover object 검증 후`cover_image_url` 연결 |
| `bootstrap_first_app_admin(profile_id)` | service_role                                             | O    | admin이 하나도 없을 때 첫 admin 지정                        |

## Onboarding 필수 필드

DB constraint 기준으로 `submit_onboarding(...)` 이후 `status`가 `pending` 이상인 profile은 다음 값이 필요하다.

- 공통 필수: `name`, `type`
- 학생(`type = 'student'`) 필수: `student_number`, `cohort`, `track`
- `department`, `gender`, `class_no`, `phone_number`, `birthday`, `description`, `dorm_room`, `is_reenrolled`는 DB상 선택값이다. 단, `is_reenrolled`는 값이 없으면 `false`로 저장된다.

`track`은 국내반/국제반 배정이라 학생에게만 요구한다. 선생님·졸업생은 `track` 없이 온보딩할 수 있다.

## Private helper


| 함수                                        | 용도                                            |
| --------------------------------------------- | ------------------------------------------------- |
| `private.current_profile_id()`              | 현재 auth user의 profile id                     |
| `private.is_accepted_user()`                | 현재 사용자가 accepted + non-deleted인지        |
| `private.is_app_admin()`                    | 현재 사용자가 accepted admin인지                |
| `private.has_permission(key)`               | accepted + 해당 permission 보유 여부            |
| `private.require_current_profile(accepted)` | active profile 강제, 없으면 예외. RPC 공통 가드 |
| `private.require_app_admin()`               | accepted admin 강제, 아니면 예외                |
| `private.anonymize_profile(profile_id)`     | profile 필드를 탈퇴 상태로 일괄 스크럽(`withdrawn`). `withdraw_profile`과 auth 삭제 트리거가 공유. `auth_user_id`는 건드리지 않음(자기 탈퇴는 유지, auth 삭제는 FK가 null 처리) |

## Trigger


| 트리거                 | 테이블       | 이벤트        | side effect                                                                                                         |
| ------------------------ | -------------- | --------------- | --------------------------------------------------------------------------------------------------------------------- |
| `on_auth_user_created` | `auth.users` | AFTER INSERT  | `profiles` 1행 자동 생성 (이름: metadata `full_name` → `name` → `사용자`, 50자 절단)                              |
| `on_auth_user_deleted` | `auth.users` | BEFORE DELETE | admin/space owner면 예외로 삭제 거부. 아니면 profile 삭제 처리(`탈퇴한 사용자`) + `withdrawn` + `auth_user_id` null |

## 주의

- profile 생성 경로는 Auth trigger뿐이다. user metadata는 이름 외에 role/status 판정에 쓰지 않는다.
