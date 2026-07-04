# 04. Identity

- SQL 파일: `supabase/migrations/20260612001830_identity.sql`

## 역할

이 파일은 이 프로젝트의 사용자 정체성 계층을 만든다. Supabase Auth의 `auth.users`를 그대로 앱의 주 사용자 테이블로 쓰지 않고, `profiles`를 앱의 실제 사용자 기준점으로 둔다. 그 위에 권한 registry인 `permissions`, 사용자별 부여 테이블인 `user_permissions`를 얹는다.

## 관련 스키마

```text
profiles(
  id bigserial PK,
  auth_user_id uuid? -> auth.users.id,
  pub_id uuid,
  name text,
  anonymous_username text?,
  role app_role,
  type profile_type,
  student_number char(6)?,
  class_no int2?, cohort int2?, gender profile_gender?,
  phone_number text?, avatar_url text?, birthday date?, description text?,
  status profile_status,
  dorm_room int2?, onboarding_completed_at timestamptz?,
  status_updated_at timestamptz?, status_updated_by bigint? -> profiles.id,
  created_at timestamptz,
  updated_at timestamptz?,
  deleted_at timestamptz?
)

permissions(
  key text PK,
  name text,
  description text?,
  created_at timestamptz
)

user_permissions(
  user_id bigint -> profiles.id,
  permission_key text -> permissions.key,
  granted_at timestamptz,
  granted_by bigint? -> profiles.id,
  PK(user_id, permission_key)
)
```

## 현재 작동 방식

### 프로필 생성

- 새 Auth 사용자가 생기면 `auth.users` after insert trigger가 동작한다.
- trigger는 `private.handle_auth_user_created()`를 호출해 `public.profiles`에 1행을 만든다.
- profile 이름은 아래 순서로 결정된다.
  - `raw_user_meta_data.full_name`
  - `raw_user_meta_data.name`
  - fallback `사용자`
- 이름은 trim 후 최대 50자로 잘린다.

### 사용자 식별

- 앱 내부에서 현재 사용자의 profile id가 필요할 때 `private.current_profile_id()`를 쓴다.
- accepted 상태 여부가 필요할 때 `private.is_accepted_user()`를 쓴다.
- 이 둘은 이후 RLS와 RPC에서 공통으로 쓰이는 가장 기본 helper다.

### identity 데이터 구조

- `profiles`는 Auth와 1:1을 지향하지만, 앱에서 쓰는 이름, 역할, 상태, 학생 정보, 연락처, 익명 이름, soft delete 상태까지 모두 가진다.
- `permissions`는 문자열 key 기반 registry다.
- `user_permissions`는 특정 profile에 특정 permission을 부여하는 조인 테이블이다.
- 초기 permission으로 `gongang`, `karaoke`를 넣는다.

### identity 읽기/수정 규칙

- `profiles`는 RLS가 켜져 있다.
- authenticated 사용자는:
  - 자기 profile은 언제나 읽을 수 있다.
  - 자기 자신이 accepted이면, 다른 accepted + non-deleted profile도 읽을 수 있다.
- profile 직접 수정은 accepted 본인에게만 열려 있다.
- 직접 수정 가능한 컬럼은 제한돼 있다.
  - `name`, `gender`, `phone_number`, `birthday`, `description`
- `permissions`는 accepted 사용자만 읽을 수 있다.
- `user_permissions`는 본인 행만 읽을 수 있다.

## 현재 사용하는 RPC

- 일반 사용자 lifecycle
  - `submit_onboarding()`: onboarding payload를 저장하고 status를 `pending`으로 올린다.
  - `set_anonymous_username()`: 익명 표시 이름을 바꾼다.
  - `withdraw_profile()`: 본인 profile을 익명화하고 withdrawn/deleted 상태로 바꾼다.
  - `finalize_avatar()`: Storage object를 `profiles.avatar_url`에 연결한다.
- 관리자 lifecycle
  - `review_profile()`: pending profile을 accepted/rejected로 심사한다.
  - `update_verified_profile_identity()`: 검증 신원 필드를 수정한다.
  - `change_profile_status()`: 관리자용 상태 전환을 수행한다.
  - `change_app_role()`: app role을 user/admin으로 바꾼다.
  - `grant_user_permission()`, `revoke_user_permission()`: 사용자 permission을 관리한다.
  - `upsert_permission()`: permission registry를 관리한다.
- service bootstrap
  - `bootstrap_first_app_admin()`: 첫 app admin을 service-role로 bootstrap한다.

## 권한과 쓰기 경로

- `authenticated`
  - `profiles`, `permissions`, `user_permissions` select
  - `profiles` 일부 컬럼 update
  - `private.current_profile_id()`, `private.is_accepted_user()` execute
- `service_role`
  - identity table 전체 CRUD
  - `profiles_id_seq` 사용 가능

## 현재 주의점

- identity의 실제 소유자 기준은 `profiles.id`다. 이후 도메인 테이블은 대부분 `auth.users.id`가 아니라 `profiles.id`를 참조한다.
- accepted 여부가 권한 모델의 핵심 전제라서, 같은 authenticated라도 status에 따라 보이는 데이터가 달라진다.

## 미구현 / 계약과 차이

- `profiles.auth_user_id` unique는 이 파일이 아니라 later constraint migration에서 완성된다.
- `current_profile_id()`는 중복 profile이 생기면 가장 작은 `id`를 반환한다.
- Auth user 삭제 lifecycle은 이 파일이 아니라 trigger migration에서 구현된다.
- `updated_at` 자동 갱신은 여기서 하지 않는다.

## 기존 합의 세부 규칙

- profile 최초 생성은 Auth trigger 또는 service-role 서버 경로만 사용한다.
- Auth profile 생성 시 `auth_user_id`만 신뢰 식별자로 사용하고, user metadata를 role/status/permission 판정에 사용하지 않는다.
- `anonymous_username`은 trim 후 1~50자, 대소문자 비구분 전역 unique를 목표로 한다.
- Auth 사용자 직접 삭제 시 owner/app admin이면 거부하고, 나머지는 withdrawn 익명화 처리한다.
- withdrawn 익명화 시 `name='탈퇴한 사용자'`, `role='user'`, 개인식별성 필드는 NULL로 정리하는 흐름을 따른다.
- 상태 전이는 onboarding, review, withdrawal, lifecycle/admin RPC로 제한하는 것이 원래 합의다.
- accepted 본인이 직접 바꿀 수 있는 profile 필드는 제한적이어야 한다.
- `permissions` 초기 registry는 `gongang`, `karaoke`를 기준으로 유지한다.
