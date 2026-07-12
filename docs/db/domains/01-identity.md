# 01. Identity

Source: [`supabase/schemas/01-identity.sql`](../../../supabase/schemas/01-identity.sql)

앱의 사용자 기준점. `auth.users`를 직접 쓰지 않고 `public.profiles`를 실제 사용자 테이블로 둔다. 이후 모든 도메인 FK는 `profiles.id`를 참조한다.

## 테이블

- `profile_departments` — profile에 연결할 부서 lookup (`name`). service_role이 관리하고 authenticated는 읽기만 가능
- `profiles` — 이름/역할/상태/학생정보/부서/국내·국제 track/복학 여부/연락처/avatar/cover/soft delete. `status`가 `accepted`인지가 권한 모델의 핵심 전제
- `user_keys` — 이 사용자의 **암호학적** 신원. `profiles`가 사회적 신원이라면 그 옆에 걸린 열쇠고리다. X25519 신원 공개키 + 봉인된 blob 셋(`wrapped_user_key`, `wrapped_identity_secret_key`, `recovery_wrapped_user_key`). 키 계층 전체는 [docs/e2ee.md](../../e2ee.md)
- `permissions` — 문자열 key 기반 권한 registry (seed: `gongang`, `karaoke` — baseline migration)
- `user_permissions` — profile별 permission 부여

`profile_departments` seed 목록: `문화기획부`, `방송부`, `체육부`, `학습부`, `환경부`, `영어상용부`, `도서부`, `식품영양부`, `동아리관리부`, `과학기술부`, `금융정보부`, `법무부`.

## RPC

| 함수                                    | 인증                                                     | 쓰기 | 목적                                                                        |
| --------------------------------------- | -------------------------------------------------------- | ---- | --------------------------------------------------------------------------- |
| `submit_onboarding(...)`                | 본인 profile (`none`/`rejected` 상태만, accepted 불필요) | O    | onboarding 정보 저장, status →`pending`                                     |
| `review_profile(profile_id, status)`    | app admin                                                | O    | pending profile을`accepted`/`rejected`로 심사                               |
| `withdraw_profile()`                    | accepted 본인 (admin이거나 space owner면 거부)           | O    | 본인 profile 삭제 처리 +`withdrawn` 처리                                    |
| `finalize_avatar(storage_path)`         | 본인 profile                                             | O    | 업로드된 avatar object 검증 후`avatar_url` 연결                             |
| `finalize_cover_image(storage_path)`    | 본인 profile                                             | O    | 업로드된 profile cover object 검증 후`cover_image_url` 연결                 |
| `bootstrap_first_app_admin(profile_id)` | service_role                                             | O    | admin이 하나도 없을 때 첫 admin 지정                                        |
| `get_my_key_vault()`                    | 본인 profile (accepted 불필요)                           | X    | 봉인된 blob이 서버 밖으로 나가는 **유일한** 문. 호출자 행에 스스로를 가둔다 |
| `get_identity_public_keys(user_ids[])`  | accepted (security **invoker**)                          | X    | 상대의 신원 공개키. 메시지 키를 봉인하려면 먼저 필요하다                    |
| `create_user_keys(...)`                 | 본인 profile (accepted 불필요)                           | O    | 가입 시 1회. 이미 있으면 실패 — 덮어쓰면 그 사람의 DM이 통째로 죽는다       |
| `reseal_user_keys(...)`                 | 본인 profile (accepted 불필요)                           | O    | 비밀번호 변경. **신원키를 건드릴 수 없다** — 그래서 히스토리가 살아남는다   |
| `rotate_user_keys(...)`                 | 본인 profile (accepted 불필요)                           | O    | 비밀번호도 복구 코드도 없을 때. 지난 DM은 영영 닫힌다                       |

열쇠고리 RPC가 `accepted`를 요구하지 않는 이유: 열쇠고리는 **가입 직후, 브라우저가 아직 비밀번호를 들고 있는 그 순간**에 만들어야 한다. 승인까지 미루면 그때는 세션만 있고 비밀번호가 없어 `encKey`를 만들 방법이 없다.

`bytea`가 PostgREST를 지나면 hex 문자열이 되어 2배로 부푸므로 경계에서는 base64로 주고받고 컬럼은 `bytea`로 남긴다. 클라이언트 쓰기 경로가 이 RPC들뿐인 이유도 같다 — `user_keys`에는 insert/update grant가 아예 없다.

## Onboarding 필수 필드

DB constraint 기준으로 `submit_onboarding(...)` 이후 `status`가 `pending` 이상인 profile은 다음 값이 필요하다.

- 공통 필수: `name`, `type`
- 학생(`type = 'student'`) 필수: `student_number`, `cohort`, `track`
- `department`, `gender`, `class_no`, `phone_number`, `birthday`, `description`, `dorm_room`, `is_reenrolled`는 DB상 선택값이다. 단, `is_reenrolled`는 값이 없으면 `false`로 저장된다.

`track`은 국내반/국제반 배정이라 학생에게만 요구한다. 선생님·졸업생은 `track` 없이 온보딩할 수 있다.

## Private helper

| 함수                                        | 용도                                                                                                                                                                            |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `private.current_profile_id()`              | 현재 auth user의 profile id                                                                                                                                                     |
| `private.is_accepted_user()`                | 현재 사용자가 accepted + non-deleted인지                                                                                                                                        |
| `private.is_app_admin()`                    | 현재 사용자가 accepted admin인지                                                                                                                                                |
| `private.has_permission(key)`               | accepted + 해당 permission 보유 여부                                                                                                                                            |
| `private.require_current_profile(accepted)` | active profile 강제, 없으면 예외. RPC 공통 가드                                                                                                                                 |
| `private.require_app_admin()`               | accepted admin 강제, 아니면 예외                                                                                                                                                |
| `private.anonymize_profile(profile_id)`     | profile 필드를 탈퇴 상태로 일괄 스크럽(`withdrawn`). `withdraw_profile`과 auth 삭제 트리거가 공유. `auth_user_id`는 건드리지 않음(자기 탈퇴는 유지, auth 삭제는 FK가 null 처리) |

## Trigger

| 트리거                 | 테이블       | 이벤트        | side effect                                                                                                         |
| ---------------------- | ------------ | ------------- | ------------------------------------------------------------------------------------------------------------------- |
| `on_auth_user_created` | `auth.users` | AFTER INSERT  | `profiles` 1행 자동 생성 (이름: metadata `full_name` → `name` → `사용자`, 50자 절단)                                |
| `on_auth_user_deleted` | `auth.users` | BEFORE DELETE | admin/space owner면 예외로 삭제 거부. 아니면 profile 삭제 처리(`탈퇴한 사용자`) + `withdrawn` + `auth_user_id` null |

## 주의

- profile 생성 경로는 Auth trigger뿐이다. user metadata는 이름 외에 role/status 판정에 쓰지 않는다.
- `user_keys`는 행 전체가 accepted 사용자에게 보이지만 **컬럼 grant가 `identity_public_key` 하나만 남기고 봉인된 blob을 전부 회수한다.** 행 단위로는 이 구분을 표현할 수 없어서다. 회수하지 않으면 같은 학교 아무나 반 친구들의 `wrapped_user_key`를 긁어갈 수 있는데, 그건 _비밀번호에서 유도된_ 키로 봉인돼 있어서 약한 비밀번호를 오프라인에서 때릴 수 있다.
- `anonymize_profile`이 탈퇴 시 `user_keys`를 지운다. 남겨봐야 아무도 열 수 없는 blob이고, 상대방 쪽 히스토리는 상대의 키로 그대로 읽힌다.
