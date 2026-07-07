# 02. Spaces

Source: [`supabase/schemas/02-spaces.sql`](../../../supabase/schemas/02-spaces.sql)

커뮤니티/그룹 컨테이너와 membership. 게시글·알림·운영 권한 판단의 기준 단위.

## 테이블

- `spaces` — type(`group`=공식/`community`=비공식), 가입 정책, `member_count` 캐시, soft delete
- `space_members` — `(space_id, user_id)` PK. 역할(`owner`/`admin`/`manager`/`member`), 알림 설정, ban 상태

## RPC

없음. space 관련 RPC(`create_space`, `join_space`, `transfer_space_owner` 등 10종)는 2026-07 정리에서 모두 제거됐다. `spaces`/`space_members`에는 직접 insert grant도 없어서 **현재 authenticated의 쓰기 경로가 없다** (`space_members.notification_setting` update 제외). space 기능을 만들려면 RPC 또는 grant를 먼저 복구해야 한다.

## Private helper

| 함수 | 용도 |
| --- | --- |
| `private.is_space_member(space_id, roles?)` | 활성 space의 비차단 멤버인지 (역할 필터 옵션) |
| `private.can_manage_space(space_id, roles?)` | 기본 owner/admin 여부 (`is_space_member` 위임) |

## Trigger

| 트리거 | 테이블 | 이벤트 | side effect |
| --- | --- | --- | --- |
| `trg_validate_space_owner` | `space_members` | AFTER INSERT/UPDATE/DELETE (deferred constraint) | space당 owner가 정확히 1명이 아니면 트랜잭션 거부 |

## 주의

- `member_count`는 캐시다. 갱신하던 RPC와 `reconcile_cached_counts()`가 제거돼 현재 갱신 경로가 없다.
- soft delete 전제(`deleted_at`/`deleted_by`). active group 이름은 `lower(btrim(name))` unique.
