# 05. Spaces

- SQL 파일: `supabase/migrations/20260612120344_tables_spaces.sql`

## 역할

이 파일은 이 프로젝트의 핵심 컨테이너인 `spaces`와 그 안의 membership 구조를 만든다. 게시글, 알림, 운영 권한은 대부분 이 space membership을 기준으로 연결된다.

## 관련 스키마

```text
spaces(
  id bigserial PK,
  pub_id uuid,
  type space_type,
  name text,
  description text?,
  image_url text?,
  join_policy space_join_policy,
  member_count int4,
  created_by bigint? -> profiles.id,
  created_at timestamptz,
  updated_at timestamptz?,
  deleted_at timestamptz?,
  deleted_by bigint? -> profiles.id
)

space_members(
  space_id bigint -> spaces.id,
  user_id bigint -> profiles.id,
  role member_role,
  notification_setting notification_setting,
  banned_at timestamptz?,
  banned_by bigint? -> profiles.id,
  ban_reason text?,
  joined_at timestamptz,
  PK(space_id, user_id)
)
```

## 현재 작동 방식

### spaces

- `spaces`는 커뮤니티나 그룹 같은 상위 단위를 표현한다.
- 각 row는 다음 성격의 정보를 가진다.
  - 외부 노출용 식별자 `pub_id`
  - 타입 `type`
  - 표시 정보 `name`, `description`, `image_url`
  - 가입 정책 `join_policy`
  - 캐시 수치 `member_count`
  - 생성/삭제 감사 필드 `created_by`, `deleted_by`, `created_at`, `updated_at`, `deleted_at`
- hard delete가 아니라 soft delete 전제를 가진 구조다.

### memberships

- `space_members`는 `(space_id, user_id)` 한 행이 한 사람의 membership을 뜻한다.
- 한 membership은 다음 상태를 함께 가진다.
  - 역할 `role`
  - 알림 설정 `notification_setting`
  - ban 정보 `banned_at`, `banned_by`, `ban_reason`
  - 가입 시각 `joined_at`
- membership은 이후 게시글/알림/space 관리 권한 판단의 가장 중요한 기준이 된다.

## 현재 사용하는 RPC

- `create_space()`: 새 space를 만들고 creator를 첫 owner membership으로 넣는다.
- `update_space()`: 이름/설명/join_policy를 바꾸고, 필요하면 type도 바꾼다.
- `join_space()`: auto-join space에 본인이 직접 들어간다.
- `add_space_member()`: owner/admin이 다른 사용자를 멤버로 추가한다.
- `leave_space()`: 본인 membership을 제거한다.
- `set_space_member_role()`: owner가 다른 멤버 역할을 바꾼다.
- `transfer_space_owner()`: 기존 owner에서 새 owner로 소유권을 넘긴다.
- `set_space_member_ban()`: owner/admin이 ban/unban을 처리한다.
- `soft_delete_space()`: space를 hard delete하지 않고 soft delete한다.
- `finalize_space_image()`: Storage object를 `spaces.image_url`에 연결한다.

## 권한과 쓰기 경로

- 이 파일 자체는 단순 구조 정의만 한다.
- 실제 생성, 가입, 초대, 역할 변경, ban/unban은 위 RPC로 처리된다.
- 실제 읽기/쓰기 범위는 뒤 RLS migration에서 정해진다.

## 현재 주의점

- `member_count`는 이 시점에서는 단순 stored column이다.
- count를 어떻게 갱신할지, owner를 어떻게 강제할지는 later migration에 의존한다.
- membership row 하나가 active member인지, banned member인지, 관리자 권한이 있는지는 후속 helper와 policy에서 해석된다.
- `spaces.updated_at`은 현재 SQL 기준 자동 갱신되지 않는다.

## 미구현 / 계약과 차이

- 이 파일 alone 기준으로는 owner unique, active group name unique, ban state check가 없다.
- `updated_at` 자동 갱신은 later trigger migration에서 구현된다.

## 기존 합의 세부 규칙

- `group`은 앱 관리자가 관리하는 공식 공간, `community`는 사용자가 만드는 비공식 공간으로 보는 해석을 유지한다.
- group/community 구조 차이는 같은 테이블을 공유하고, 정책 차이는 RLS와 제약으로 처리하는 방향을 유지한다.
- `spaces`는 hard delete하지 않고 `deleted_at`, `deleted_by` 기반 soft delete를 사용한다.
- service-role `purge_deleted_content('space', ...)` hard purge 경로는 별도로 존재한다.
- space 생성과 최초 owner membership은 `create_space()`에서 한 transaction으로 처리한다.
- owner는 space마다 정확히 1명이어야 한다.
- owner 양도는 RPC만 허용한다.
- `private.is_space_member()`는 accepted, non-deleted profile과 활성 space, 비차단 membership을 기준으로 판단하는 것이 원래 합의다.
- accepted 사용자는 community를 생성할 수 있고, group 생성/삭제는 app admin만 수행하는 방향을 유지한다.
- active group 이름은 `lower(btrim(name))` 기준 unique를 목표로 한다.
- space 이름은 trim 후 1~100자, description은 최대 5000자를 목표로 한다.
- `member_count`는 cached counter이며 exact truth와 구분해서 취급한다.
