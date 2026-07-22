# 01. Identity

Source: [`supabase/schemas/01-identity.sql`](../../../supabase/schemas/01-identity.sql)

앱의 사용자 기준점. `auth.users`를 직접 쓰지 않고 `public.profiles`를 실제 사용자 테이블로 둔다. 이후 모든 도메인 FK는 `profiles.id`를 참조한다.

## 테이블

- `profile_departments` — profile에 연결할 부서 lookup (`name`). service_role이 관리하고 authenticated는 읽기만 가능
- `profiles` — 이름/역할/상태/학생정보/부서/국내·국제 track/복학 여부/연락처/avatar/cover/soft delete. `status`가 `accepted`인지가 권한 모델의 핵심 전제
- `private.profile_auth_map` — `profile_id`, 내부 auth UUID, 상태·삭제 시각만 복제하는 비노출 권한 조회 표. `profiles.auth_user_id` column grant를 열지 않고 Storage RLS와 공통 identity helper가 현재 사용자를 확인한다
- `user_keys` — 이 사용자의 **암호학적** 신원. `profiles`가 사회적 신원이라면 그 옆에 걸린 열쇠고리다. X25519 신원 공개키 + 봉인된 blob 둘(`wrapped_user_key`, `wrapped_identity_secret_key`). 키 계층 전체는 [docs/e2ee.md](../../e2ee.md)
- `permissions` — 문자열 key 기반 권한 registry (seed: `gongang`, `karaoke` — baseline migration)
- `user_permissions` — profile별 permission 부여

`profile_departments` seed 목록: `문화기획부`, `방송부`, `체육부`, `학습부`, `환경부`, `영어상용부`, `도서부`, `식품영양부`, `동아리관리부`, `과학기술부`, `금융정보부`, `법무부`.

## RPC

### 열쇠고리

| 함수                                   | 인증                            | 쓰기 | 목적                                                                        |
| -------------------------------------- | ------------------------------- | ---- | --------------------------------------------------------------------------- |
| `create_user_keys(...)`                | 본인 profile (accepted 불필요)  | O    | 가입 시 1회. 이미 있으면 실패 — 덮어쓰면 그 사람의 DM이 통째로 죽는다       |
| `get_my_key_vault()`                   | 본인 profile (accepted 불필요)  | X    | 봉인된 blob이 서버 밖으로 나가는 **유일한** 문. 호출자 행에 스스로를 가둔다 |
| `get_identity_public_keys(user_ids[])` | accepted (security **invoker**) | X    | 상대의 신원 공개키. 메시지 키를 봉인하려면 먼저 필요하다                    |
| `reseal_user_keys(...)`                | 본인 profile (accepted 불필요)  | O    | 비밀번호 변경. **신원키를 건드릴 수 없다** — 그래서 히스토리가 살아남는다   |
| `rotate_user_keys(...)`                | 본인 profile (accepted 불필요)  | O    | 비밀번호를 잊었을 때. 신원키까지 새로 발급, 지난 DM은 영영 닫힌다           |

### 온보딩과 profile

| 함수                                 | 인증                                                     | 쓰기 | 목적                                                        |
| ------------------------------------ | -------------------------------------------------------- | ---- | ----------------------------------------------------------- |
| `get_my_profile()`                   | 본인 profile (accepted 불필요, soft-delete 제외)         | X    | 호출자 본인 행 1개. 인자가 없다 — 남의 행을 요구할 방법 자체가 없다 |
| `submit_onboarding(...)`             | 본인 profile (`none`/`rejected` 상태만, accepted 불필요) | O    | onboarding 정보 저장, status →`pending`                     |
| `finalize_avatar(storage_path)`      | 본인 profile                                             | O    | 업로드된 avatar object 검증 후`avatar_url` 연결             |
| `finalize_cover_image(storage_path)` | 본인 profile                                             | O    | 업로드된 profile cover object 검증 후`cover_image_url` 연결 |
| `withdraw_profile()`                 | accepted 본인 (admin이거나 space owner면 거부)           | O    | 본인 profile 삭제 처리 +`withdrawn` 처리                    |

### 가입 심사

| 함수                                     | 인증      | 쓰기 | 목적                                                                    |
| ---------------------------------------- | --------- | ---- | ----------------------------------------------------------------------- |
| `list_pending_profiles(after_id, limit)` | app admin | X    | 승인 대기 큐. **오래 기다린 순서**(오름차순) — 커서도 반대라 `after_id` |
| `count_pending_profiles()`               | app admin | X    | 대기 인원 수                                                            |
| `review_profiles(profile_ids[], status)` | app admin | O    | 배치 심사. 실제로 옮긴 행 수를 반환 (이미 심사된 id는 세지 않는다)      |
| `review_profile(profile_id, status)`     | app admin | O    | 단건 심사. `review_profiles`를 감싼다 — 심사 규칙은 한 곳에만 산다      |

### 앱 관리자

| 함수                                    | 인증         | 쓰기 | 목적                                    |
| --------------------------------------- | ------------ | ---- | --------------------------------------- |
| `bootstrap_first_app_admin(profile_id)` | service_role | O    | admin이 하나도 없을 때 첫 admin 지정    |
| `set_app_admin(profile_id)`             | app admin    | O    | 두 번째 이후의 admin 임명 (accepted만)  |
| `unset_app_admin(profile_id)`           | app admin    | O    | admin 강등. **마지막 한 명은 못 내린다** |

승인 큐를 RPC로 읽는 이유: `profiles_select`에는 admin 분기가 없어 **관리자에게도 pending 행은 보이지 않는다**. RLS에 `or private.is_app_admin()`을 더하면 한 줄로 풀리지만 그 한 줄은 컬럼이 아니라 _행_ 을 연다 — rejected·withdrawn·soft-delete된 행까지, 아무 쿼리에서나, 영구히. `list_pending_profiles`는 pending으로 잠긴 창만 낸다.

승인 큐 전용 부분 인덱스는 `pending`이면서 soft-delete되지 않은 행만 `onboarding_completed_at, id` 순서로 둔다. 목록 RPC의 정렬과 키셋 커서 조건을 그대로 따라가므로, 이미 심사된 profile까지 인덱싱하지 않는다.

열쇠고리 RPC가 `accepted`를 요구하지 않는 이유: 열쇠고리는 **가입 직후, 브라우저가 아직 비밀번호를 들고 있는 그 순간**에 만들어야 한다. 승인까지 미루면 그때는 세션만 있고 비밀번호가 없어 `encKey`를 만들 방법이 없다.

`bytea`가 PostgREST를 지나면 hex 문자열이 되어 2배로 부푸므로 경계에서는 base64로 주고받고 컬럼은 `bytea`로 남긴다. 클라이언트 쓰기 경로가 이 RPC들뿐인 이유도 같다 — `user_keys`에는 insert/update grant가 아예 없다.
## Onboarding 필수 필드

DB constraint 기준으로 `submit_onboarding(...)` 이후 `status`가 `pending` 이상인 profile은 다음 값이 필요하다.

- 공통 필수: `name`, `type`
- 학생(`type = 'student'`) 필수: `student_number`, `cohort`, `track`
- 선생님(`type = 'teacher'`): `student_number`, `class_no`, `cohort`, `gender`, `track`, `department`, `dorm_room`은 모두 `NULL`
- 졸업생(`type = 'alumni'`): `class_no`, `department`, `dorm_room`은 `NULL`; 학번·기수·성별·계열은 보존할 수 있다.
- `phone_number`, `contact_email`, `birthday`, `description`, `is_reenrolled`는 DB상 선택값이다. `contact_email`은 인증 이메일과 분리된 프로필 공개용 연락처이며, 비어 있으면 프로필에 표시하지 않는다. 단, `is_reenrolled`는 값이 없으면 `false`로 저장된다.

`track`은 국내반/국제반 배정이다. DB는 학생에게만 필수로 강제하고 졸업생 값도 허용한다. 앱 온보딩은 학생·졸업생 모두에게 `track`을 받으며, 선생님에게는 받지 않는다.

## 본인이 고칠 수 있는 필드

승인 이후의 profile 편집은 RPC가 아니라 **컬럼 단위 update grant**가 가른다 (`profiles_update` 정책이 행을 본인으로 잠그고, grant가 컬럼을 자른다).

- 열려 있음: `name`, `gender`, `phone_number`, `contact_email`, `birthday`, `description`, `cohort`, `class_no`, `track`, `department`, `dorm_room`
- 닫혀 있음: `student_number`, `role`, `status`, `type`, `avatar_url`, `cover_image_url`, `is_reenrolled`

`student_number`만 학교 정보 중 유일하게 닫혀 있다. 심사에서 신원을 대조한 값이고 unique 제약이 걸려 있어, 열어두면 남의 학번을 선점하거나 심사받은 신원과 다른 사람이 될 수 있다. 나머지 학교 필드는 진급·전과·부서 이동으로 실제로 바뀌는 값이라 매번 관리자를 거치게 하지 않는다.

grant를 넓혀도 무결성은 constraint가 계속 잡는다 — 학생은 `cohort`/`track`을 null로 비울 수 없고(`profiles_student_identity_check`, `profiles_track_required_check`), 역할별로 허용되지 않는 칼럼은 `profiles_type_field_shape_check`가 `NULL`로 강제한다. `cohort`는 1 ~ 100, `class_no`·`dorm_room`은 양수, `department`는 `profile_departments` FK 안의 이름이어야 한다.

`avatar_url`/`cover_image_url`은 update grant가 없다. 업로드된 object를 검증해 붙이는 `finalize_avatar`/`finalize_cover_image`가 유일한 문이다.

프로필 화면(`/profile/:profileId`)은 본인과 남을 같은 라우트로 그린다. 편집 컨트롤만 본인 여부로 갈리므로, `get_my_profile()`의 `id`와 URL의 `:profileId`를 비교하는 것이 그 판정이다 — 화면 혼자서는 계산할 수 없는 값이다.

## Private helper

| 함수                                        | 용도                                                                                                                                                                            |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `private.current_profile_id()`              | 현재 auth user의 profile id                                                                                                                                                     |
| `private.has_active_profile()`              | 현재 auth user가 soft-delete되지 않은 profile을 가졌는지. Storage upload policy가 비공개 auth UUID를 직접 읽지 않도록 쓴다                                                     |
| `private.is_accepted_user()`                | 현재 사용자가 accepted + non-deleted인지                                                                                                                                        |
| `private.is_teacher()`                      | 현재 사용자가 non-deleted 선생님인지. spaces의 검색·자발적 가입 정책이 사용                                                                                                      |
| `private.is_app_admin()`                    | 현재 사용자가 accepted admin인지                                                                                                                                                |
| `private.has_permission(key)`               | accepted + 해당 permission 보유 여부                                                                                                                                            |
| `private.require_current_profile(accepted)` | active profile 강제, 없으면 예외. RPC 공통 가드                                                                                                                                 |
| `private.require_app_admin()`               | accepted admin 강제, 아니면 예외                                                                                                                                                |
| `private.anonymize_profile(profile_id)`     | profile 필드를 탈퇴 상태로 일괄 스크럽(`withdrawn`). `withdraw_profile`과 auth 삭제 트리거가 공유. `auth_user_id`는 건드리지 않음(자기 탈퇴는 유지, auth 삭제는 FK가 null 처리) |

## Trigger

### Auth 생명주기

| 트리거                 | 테이블       | 이벤트        | side effect                                                                                                         |
| ---------------------- | ------------ | ------------- | ------------------------------------------------------------------------------------------------------------------- |
| `on_auth_user_created` | `auth.users` | AFTER INSERT  | `profiles` 1행 자동 생성 (이름: metadata `full_name` → `name` → `사용자`, 50자 절단)                                |
| `sync_profile_auth_map` | `profiles` | AFTER INSERT / auth UUID·status·삭제 시각 UPDATE | `private.profile_auth_map`을 동기화. auth UUID를 browser 역할에 열지 않는 Storage RLS 조회 경로다 |
| `on_auth_user_deleted` | `auth.users` | BEFORE DELETE | admin/space owner면 예외로 삭제 거부. 아니면 profile 삭제 처리(`탈퇴한 사용자`) + `withdrawn` + `auth_user_id` null |
## 주의

- profile 생성 경로는 Auth trigger뿐이다. user metadata는 이름 외에 role/status 판정에 쓰지 않는다.
- **`get_my_profile()`이 없으면 클라이언트는 자기 행을 고를 수 없다.** `profiles_select`는 본인 행을 이미 열어두지만 `auth_user_id`가 컬럼 grant에서 빠져 있어 `where auth_user_id = auth.uid()`를 쓸 수 없고, `profiles.id`는 로그인만으로 알 수 없다. 이 함수는 그 한 칸만 메운다 — 돌려주는 컬럼 집합이 select 컬럼 grant와 같아서(`auth_user_id`·`status_updated_by` 제외) 새로 여는 정보는 없다.
- **app admin은 admin끼리 늘리고 줄인다.** `profiles.role`은 update grant에 없어서 `set_app_admin`/`unset_app_admin`이 유일한 문이다. 첫 한 명만 예외로 `bootstrap_first_app_admin`(service_role, admin이 0명일 때만)이 세운다.
- **마지막 admin은 강등되지 않는다.** 0명이 되는 순간 다시 세우는 길이 service_role뿐이라 앱 안에서 복구할 수 없다. 동시에 서로를 내리는 경합도 같은 구멍으로 새므로 `unset_app_admin`은 bootstrap과 **같은 키**의 advisory lock으로 직렬화한다 — 둘이 각자 "나 말고 한 명 더 있네"를 보고 통과하면 결과는 0명이다.
- 강등은 임명의 짝이면서 **탈퇴의 전제**이기도 하다. `withdraw_profile`이 admin의 탈퇴를 거부하므로, 강등이 없으면 한번 admin이 된 사람은 계정을 지울 수 없다.
- `user_keys`는 행 전체가 accepted 사용자에게 보이지만 **컬럼 grant가 `identity_public_key` 하나만 남기고 봉인된 blob을 전부 회수한다.** 행 단위로는 이 구분을 표현할 수 없어서다. 회수하지 않으면 같은 학교 아무나 반 친구들의 `wrapped_user_key`를 긁어갈 수 있는데, 그건 _비밀번호에서 유도된_ 키로 봉인돼 있어서 약한 비밀번호를 오프라인에서 때릴 수 있다.
- `anonymize_profile`이 탈퇴 시 `user_keys`를 지운다. 남겨봐야 아무도 열 수 없는 blob이고, 상대방 쪽 히스토리는 상대의 키로 그대로 읽힌다.
