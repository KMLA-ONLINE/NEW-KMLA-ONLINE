# school_community — Supabase 마이그레이션 계획서 2/2

> **담당 범위**
> 이 문서는 `chat_rooms`, `direct_chat_pairs`, `chat_room_members`, `messages`, `message_attachments`, `message_reactions`, `message_reads`, `chat_room_read_states`, `notifications`, `gongangs`, `song_requests`, `clubs`, `club_apply_rounds`, `clubs_apply` 테이블을 담당한다.
>
> 또한 모든 도메인 테이블 생성 후 실행하는 공통 인덱스·제약조건·트리거·RLS/GRANT·RPC·Storage·검증 절차를 담당한다. 기반 설정과 identity/spaces/content/reactions 테이블은 먼저 [`migration-1.md`](./migration-1.md)를 적용한다.

---

## 마이그레이션 순서 개요

[`migration-1.md`의 07. Reactions 테이블](./migration-1.md#07-reactions-테이블) 적용 후 아래 순서대로 진행한다.

1. [08. tables_chat — chat 관련 테이블](#08-chat-테이블)
2. [09. tables_notifications — notifications](#09-notifications-테이블)
3. [10. tables_utilities — gongangs, song_requests](#10-utilities-테이블)
4. [11. tables_clubs — clubs, club_apply_rounds, clubs_apply](#11-clubs-테이블)
5. [12. indexes — 전체 도메인 인덱스](#12-인덱스)
6. [13. constraints — CHECK, partial unique, exclusion](#13-제약조건)
7. [14. triggers — 검증·동기화·캐시 트리거](#14-트리거)
8. [15. rpc_functions — 원자적·권한 변경 함수](#15-rpc-함수)
9. [16. rls_and_grants — RLS 및 최소 GRANT](#16-rls-정책-및-grant)
10. [17. storage_buckets — Storage 버킷 및 정책](#17-storage-버킷)

---

## 08. Chat 테이블

**파일:** `{타임스탬프}_08_tables_chat.sql`

### chat_rooms

DECIDED: `created_by`는 ON DELETE SET NULL.

### direct_chat_pairs

DECIDED: `room_id`는 ON DELETE RESTRICT.

DECIDED: `user1_id < user2_id` 순서 강제:

```sql
CHECK (user1_id < user2_id)
```

DECIDED: 1:1 채팅 생성은 반드시 RPC `create_direct_chat(p_other_user_id)`로 처리 (`15_rpc_functions`에서 정의). 호출자 ID는 `auth.uid()`에서 유도하며 클라이언트 직접 INSERT를 금지한다.

DECIDED: `direct_chat_pairs.room_id`는 `is_group = false`인 방만 참조할 수 있고, pair의 두 사용자와 `chat_room_members`의 정확히 두 멤버가 일치해야 한다. 생성 RPC와 검증 트리거로 강제한다.

DECIDED: 1:1 방의 `chat_room_members` 직접 INSERT/DELETE는 금지한다. 단체 방만 검증 RPC를 통해 멤버를 추가/제거한다.

### messages

DECIDED: `room_id`는 ON DELETE RESTRICT.

DECIDED: `sender_id`는 ON DELETE RESTRICT.

DECIDED: `parent_id`는 ON DELETE RESTRICT (댓글과 동일).

DECIDED: `deleted_by`는 ON DELETE SET NULL.

DECIDED: 메시지 수정 15분 제한은 내용 수정 RPC와 RLS 정책으로 함께 강제:

```sql
USING (
  sender_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
  AND created_at > now() - interval '15 minutes'
  AND deleted_at IS NULL
)
```

DECIDED: `search_vector`는 generated stored column (posts와 동일한 방식).

DECIDED: 메시지 답글은 같은 room의 최상위 메시지만 가리킬 수 있다. `trg_validate_message_parent`에서 강제한다.

### message_reactions

DECIDED: `message_id`는 ON DELETE RESTRICT. 메시지 영구 삭제 관리 작업이 리액션을 먼저 삭제한다.

DECIDED: 리액션 변경은 `reaction_type_id` UPDATE로 처리하고, 취소는 본인 행 DELETE로 처리한다.

### message_reads

DECIDED: 소규모 그룹/1:1 채팅에서 "누가 읽었는지" 표시가 필요한 경우에만 사용.

REASON: 대규모 방에서는 행이 폭발적으로 증가하므로, 읽지 않음 카운트의 source of truth는 `chat_room_read_states`로만 관리.

TODO: `message_reads` 사용 조건을 RLS로 제한할지, 또는 애플리케이션 레이어에서만 제어할지 결정 필요.

### chat_room_read_states

DECIDED: `last_read_message_id`는 같은 `room_id`의 메시지여야 함. 트리거(`14_triggers`)로 강제.

---

## 09. Notifications 테이블

**파일:** `{타임스탬프}_09_tables_notifications.sql`

DECIDED: `actor_id`는 ON DELETE SET NULL.

DECIDED: `space_id`는 ON DELETE SET NULL.

DECIDED: `post_id`는 ON DELETE SET NULL.

DECIDED: `comment_id`는 ON DELETE SET NULL.

DECIDED: `message_id`는 ON DELETE SET NULL.

REASON: 원본 콘텐츠가 삭제되어도 알림 기록은 남긴다. 클라이언트에서 NULL 체크 후 "삭제된 콘텐츠" 표시.

DECIDED: `space_type`은 `notifications` INSERT 트리거(`14_triggers`)에서 `spaces.type`으로부터 자동 설정.

DECIDED: 읽은 알림은 생성 후 30일이 지나면 주기적으로 삭제한다.

* 대상 조건: `read_at IS NOT NULL AND created_at < now() - interval '30 days'`
* 읽지 않은 알림은 자동 삭제하지 않는다.

---

## 10. Utilities 테이블

**파일:** `{타임스탬프}_10_tables_utilities.sql`

### gongangs

DECIDED: 시간 범위 중복 방지는 `int4range` + exclusion constraint로 처리 (`13_constraints`에서 정의):

```sql
ALTER TABLE gongangs ADD COLUMN time_range int4range
  GENERATED ALWAYS AS (int4range(start_minute, end_minute)) STORED;

ALTER TABLE gongangs ADD CONSTRAINT gongangs_no_overlap
  EXCLUDE USING gist (
    location WITH =,
    day_of_week WITH =,
    time_range WITH &&
  );
```

REASON: 현재 UNIQUE(location, day_of_week, start_minute, end_minute)는 동일 시작/종료만 막음. 겹치는 시간대(예: 09:00~10:00 vs 09:30~11:00)는 막지 못한다.

DECIDED: 추가할 CHECK (`13_constraints`에서 처리):

* `CHECK (day_of_week BETWEEN 0 AND 6)`
* `CHECK (start_minute BETWEEN 0 AND 1439)`
* `CHECK (end_minute BETWEEN 1 AND 1440)`
* `CHECK (start_minute < end_minute)`

DECIDED: `gongang_location` 값은 `floor_b1`, `floor_2`, `floor_4`, `floor_10`을 사용한다.

### song_requests

DECIDED: 현재 설계는 단순 로그 테이블. 처리 상태 없음.

TODO: 큐 역할이 필요하다면 아래 컬럼 추가 검토:

* `status`: pending, played, rejected
* `played_at`: 재생된 시각

---

## 11. Clubs 테이블

**파일:** `{타임스탬프}_11_tables_clubs.sql`

### club_apply_rounds

DECIDED: 동시에 여러 활성 라운드가 존재할 수 있다. 사용자에게 어느 라운드인지 명확히 표시하는 것은 UI에서 처리.

TODO: 같은 기간에 두 라운드가 겹치는 것을 막을지 결정 필요.

* 옵션 A: CHECK 또는 exclusion constraint로 서버 단에서 막기
* 옵션 B: 애플리케이션 레이어에서만 제어

### clubs_apply

DECIDED: `(round_id, user_id, club_id)` 복합 unique.

DECIDED: `round_id`는 ON DELETE RESTRICT.

DECIDED: `user_id`는 ON DELETE RESTRICT.

DECIDED: `club_id`는 ON DELETE RESTRICT.

REASON: 동아리가 삭제되면 해당 동아리에 대한 신청 기록도 어떻게 할지 명확하지 않으므로 일단 RESTRICT로 막는다.

---

## 12. 인덱스

**파일:** `{타임스탬프}_12_indexes.sql`

DBML에 정의된 모든 인덱스를 생성한다. 아래는 DBML에 없는 추가 인덱스:

DECIDED: `tsvector` 인덱스는 모두 명시적으로 `USING gin`으로 생성한다.

DECIDED: `pg_trgm` 기반 한글 검색 인덱스:

```sql
CREATE INDEX idx_posts_title_trgm
  ON posts USING gin (title gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_posts_content_trgm
  ON posts USING gin (content gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_comments_content_trgm
  ON comments USING gin (content gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_messages_content_trgm
  ON messages USING gin (content gin_trgm_ops)
  WHERE deleted_at IS NULL;
```

REASON: `to_tsvector('simple')`은 한글 형태소 분석 불가. `pg_trgm` ILIKE 검색을 병용.

DECIDED: 활성 feed 조회용 partial index:

```sql
CREATE INDEX idx_posts_active_space_created_at
  ON posts (space_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_comments_active_post_created_at
  ON comments (post_id, created_at)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_messages_active_room_created_at
  ON messages (room_id, created_at)
  WHERE deleted_at IS NULL;
```

DECIDED: 모든 FK의 참조하는 쪽 컬럼에 단일 또는 선두 컬럼 복합 인덱스가 존재하는지 확인한다. DBML 인덱스로 충족되지 않는 최소 추가 대상:

* `profiles(status_updated_by)`
* `user_permissions(permission_key)`, `user_permissions(granted_by)`
* `spaces(created_by)`, `spaces(deleted_by)`
* `space_members(banned_by)`
* `posts(pinned_by)`, `posts(deleted_by)`
* `comments(parent_id)`, `comments(deleted_by)`
* reaction 테이블의 `reaction_type_id`
* `chat_rooms(created_by)`
* `messages(deleted_by)`
* `chat_room_read_states(last_read_message_id)`
* notifications의 `actor_id`, `post_id`, `comment_id`, `message_id`
* `club_apply_rounds(created_by)`, `clubs_apply(user_id)`, `clubs_apply(club_id)`

---

## 13. 제약조건

**파일:** `{타임스탬프}_13_constraints.sql`

각 테이블의 CHECK 제약, partial unique index, exclusion constraint를 일괄 정의.

### 요약

| 테이블              | 종류           | 내용                                                     |
| ------------------- | -------------- | -------------------------------------------------------- |
| profiles            | CHECK          | cohort 범위, student_number 형식, student 타입 필수 필드 |
| profiles            | UNIQUE         | anonymous_username                                       |
| spaces              | PARTIAL UNIQUE | name WHERE type = 'group'                                |
| space_members       | PARTIAL UNIQUE | space_id WHERE role = 'owner'                            |
| posts               | CHECK          | comment_count/reaction_count >= 0, is_pinned 일관성      |
| post_attachments    | CHECK          | size_bytes, sort_order, width/height                     |
| comments            | CHECK          | parent_id <> id                                          |
| direct_chat_pairs   | CHECK          | user1_id < user2_id                                      |
| messages            | CHECK          | parent_id <> id                                          |
| message_attachments | CHECK          | size_bytes, sort_order, width/height                     |
| gongangs            | CHECK          | day_of_week, minute 범위, start < end                    |
| gongangs            | EXCLUSION      | location + day_of_week + time_range 중복 방지            |

DECIDED: `profiles`, `spaces`, `posts`의 `pub_id`는 모두 `NOT NULL UNIQUE DEFAULT gen_random_uuid()`로 생성한다.

---

## 14. 트리거

**파일:** `{타임스탬프}_14_triggers.sql`

### 목록

| 트리거명                             | 테이블                | 시점                                       | 역할                                                                |
| ------------------------------------ | --------------------- | ------------------------------------------ | ------------------------------------------------------------------- |
| `trg_sync_post_space_type`         | posts                 | BEFORE INSERT, UPDATE OF space_id          | `space_id`→`spaces.type`으로 `space_type`자동 설정           |
| `trg_sync_notification_space_type` | notifications         | BEFORE INSERT                              | `space_id`→`spaces.type`으로 `space_type`자동 설정           |
| `trg_propagate_space_type`         | spaces                | AFTER UPDATE OF type                       | 변경된 type을 해당 space의 posts/notifications에 전파             |
| `trg_validate_comment_parent`      | comments              | BEFORE INSERT, UPDATE                      | 1레벨 중첩 강제, 동일 post 강제                                     |
| `trg_validate_message_parent`      | messages              | BEFORE INSERT, UPDATE                      | 1레벨 중첩 강제, 동일 room 강제                                     |
| `trg_validate_direct_chat`         | direct_chat_pairs     | BEFORE INSERT, UPDATE                      | room이 1:1인지 검증; 멤버 일치는 생성 RPC 종료 시 검증              |
| `trg_update_post_comment_count`    | comments              | AFTER INSERT, UPDATE, DELETE               | OLD/NEW post_id 및 deleted_at을 모두 처리하고 활성 댓글만 집계      |
| `trg_update_post_reaction_count`   | post_reactions        | AFTER INSERT, UPDATE, DELETE               | OLD/NEW post_id를 모두 처리하여 캐시 갱신                           |
| `trg_validate_chat_read_state`     | chat_room_read_states | BEFORE INSERT, UPDATE                      | `last_read_message_id`가 동일 `room_id`의 메시지인지 검증       |
| `trg_posts_updated_at`             | posts                 | BEFORE UPDATE                              | `updated_at = now()`자동 갱신                                     |
| `trg_comments_updated_at`          | comments              | BEFORE UPDATE                              | `updated_at = now()`자동 갱신                                     |
| `trg_messages_updated_at`          | messages              | BEFORE UPDATE                              | `updated_at = now()`자동 갱신                                     |
| `trg_spaces_updated_at`            | spaces                | BEFORE UPDATE                              | `updated_at = now()`자동 갱신                                     |
| `trg_profiles_updated_at`          | profiles              | BEFORE UPDATE                              | `updated_at = now()`자동 갱신                                     |

DECIDED: 캐시 카운트 트리거는 단순 `count(*)` 재계산 대신 증감 방식으로 구현하되, UPDATE에서 관계 FK 또는 활성 상태가 바뀌면 OLD 부모에서 감소하고 NEW 부모에서 증가하도록 처리한다. 카운트 컬럼에는 음수 방지 CHECK를 유지한다.

---

## 15. RPC 함수

**파일:** `{타임스탬프}_15_rpc_functions.sql`

### create_direct_chat(p_other_user_id bigint) → bigint

역할: 1:1 채팅방 원자적 생성. 이미 존재하면 기존 room_id 반환.

동작:

1. 호출자 profile ID를 `(SELECT auth.uid())`에서 조회하고 승인 상태인지 검증
2. 상대방이 승인된 profile인지, 호출자 본인과 다른지 검증
3. `user1_id = LEAST(caller_id, p_other_user_id)`, `user2_id = GREATEST(...)`로 정규화
4. `direct_chat_pairs`에서 기존 방 조회 → 있으면 반환
5. 없으면 `chat_rooms` INSERT → `direct_chat_pairs` INSERT → `chat_room_members` 2건 INSERT
6. 생성된 방이 `is_group = false`이고 멤버가 정확히 pair의 두 명인지 검증
7. 모두 하나의 트랜잭션

### transfer_space_owner(p_space_id bigint, p_new_owner_id bigint) → void

역할: space owner 양도.

동작:

1. 현재 owner 조회 (호출자가 owner인지 검증)
2. 기존 owner → admin으로 UPDATE
3. 새 owner → owner로 UPDATE
4. 하나의 트랜잭션

### soft_delete_space / soft_delete_post / soft_delete_comment / soft_delete_message

역할: 직접 DELETE 없이 공간과 콘텐츠를 소프트 삭제한다.

공통 동작:

1. 호출자 profile ID와 승인 상태를 검증
2. 공간 owner/admin, 작성자 또는 해당 도메인 관리자 권한 검증
3. 이미 삭제된 행이면 idempotent하게 종료
4. `deleted_at = now()`, `deleted_by = caller_id`만 갱신
5. 댓글은 cache trigger가 활성 댓글 수를 감소

### withdraw_profile() → void

역할: 현재 사용자의 profile과 콘텐츠 참조는 보존하면서 탈퇴 처리한다.

동작:

1. 현재 profile을 잠그고 호출자 본인인지 검증
2. owner인 space가 있으면 양도 전까지 거부
3. 개인정보 및 식별 가능한 profile 필드를 익명화
4. `status = 'withdrawn'`, `deleted_at = now()` 기록
5. Auth 사용자 삭제는 신뢰된 서버 경로에서 별도 수행

### RPC 보안 속성

TODO: 각 외부 호출 RPC의 `SECURITY INVOKER`/`SECURITY DEFINER` 선택과 실행 역할은 구현 전 확정한다.

확정 전에도 모든 함수 생성 직후 `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated, service_role`를 먼저 적용하고, 검토가 끝난 함수만 필요한 역할에 명시적으로 `GRANT EXECUTE`한다.

### search_posts(p_query text, p_space_type space_type, p_space_id bigint) → table

역할: 게시물 + 댓글 통합 검색.

동작:

1. `posts.title ILIKE '%query%' OR posts.content ILIKE '%query%'` (pg_trgm 활용)
2. 매칭 posts에 딸린 `comments.content ILIKE '%query%'` 도 포함
3. `deleted_at IS NULL` 필터
4. `space_type`, `space_id` 파라미터로 범위 제한 (NULL이면 전체)

반환 컬럼: `post_id`, `title`, `content_snippet`, `author_name`, `space_name`, `created_at`, `match_type` (post/comment)

### search_messages(p_query text, p_room_id bigint) → table

역할: 채팅방 내 메시지 검색.

동작: `content ILIKE '%query%'` AND `deleted_at IS NULL` AND `room_id = p_room_id`

---

## 16. RLS 정책 및 GRANT

**파일:** `{타임스탬프}_16_rls_and_grants.sql`

모든 public 테이블에 RLS를 활성화한다. 정책은 "기본 거부, 최소 GRANT, 명시적 허용" 원칙.

### 공통 원칙

* `anon`에는 앱 도메인 테이블 권한을 부여하지 않는다.
* `authenticated`에는 실제 클라이언트가 직접 수행해야 하는 작업만 테이블별로 `GRANT SELECT/INSERT/UPDATE/DELETE`한다.
* posts/comments/messages 같은 보존 콘텐츠에는 직접 DELETE를 부여하지 않는다. 소프트 삭제 및 영구 정리는 RPC/관리 작업으로만 수행한다.
* reaction 취소처럼 행 자체가 상태인 단순 관계 테이블만 본인 행 DELETE를 명시적으로 허용할 수 있다.
* 민감 상태 변경, 역할 변경, owner 양도, 탈퇴, 소프트 삭제는 RPC 전용이다.
* 일반 작성 내용처럼 직접 UPDATE를 허용하는 컬럼은 column-level GRANT를 사용한다. 예: `GRANT UPDATE (title, content) ON posts TO authenticated`.
* bigserial 테이블에 직접 INSERT를 허용할 때만 해당 sequence에 `GRANT USAGE, SELECT`를 명시한다.
* 모든 정책은 `TO authenticated`를 명시하고 승인 사용자 조건과 소유권/멤버십 조건을 함께 검사한다.
* UPDATE 정책은 필요한 SELECT 정책과 `USING`, `WITH CHECK`를 모두 정의한다.
* INSERT/UPDATE의 `author_id`, `user_id`, `sender_id` 등 소유자 컬럼은 현재 profile ID와 일치하도록 `WITH CHECK`한다.
* `(SELECT auth.uid())` 패턴을 사용하고 RLS에서 조회하는 FK/상태 컬럼에 인덱스를 둔다.
* `service_role`은 서버 전용이며 브라우저에 노출하지 않는다. 기본 권한 회수 후 서버 작업에 필요한 객체 권한도 명시적으로 다시 부여한다.

DECIDED: 승인 사용자와 멤버십 검사는 RLS 재귀를 피하기 위해 비노출 `private` schema의 helper 함수로 처리한다.

* `private.current_profile_id()`
* `private.is_accepted_user()`
* `private.is_app_admin()`
* `private.is_space_member(p_space_id, p_allowed_roles default null)`
* `private.is_room_member(p_room_id)`

Helper는 필요한 경우에만 `SECURITY DEFINER SET search_path = ''`를 사용하고, 함수 내부에서 `(SELECT auth.uid())`를 반드시 검증한다. `private` schema는 Data API exposed schema에 포함하지 않는다. helper의 정확한 schema USAGE/EXECUTE 권한은 RPC 보안 속성 TODO와 함께 실제 RLS 호출 테스트 후 확정한다.

### profiles

| 정책 | 대상 | 조건 |
| --- | --- | --- |
| SELECT 자신 | 본인 | `auth_user_id = (SELECT auth.uid())` |
| SELECT 타인 | 승인된 사용자 | `status = 'accepted'`인 행 조회 허용 |
| UPDATE 자신 | 본인 | column-level GRANT로 허용된 일반 프로필 필드만 |
| 상태/역할 변경 | admin role | 직접 UPDATE 금지. 관리자 RPC만 허용 |

DECIDED: 프로필 컬럼 마스킹은 하지 않는다. 승인 사용자가 조회 가능한 profile 컬럼은 그대로 노출하며, 실제 비공개가 필요한 정보가 생기면 별도 private 테이블로 분리한다.

### spaces / space_members

| 정책 | 대상 | 조건 |
| --- | --- | --- |
| SELECT space | 승인된 멤버 또는 public | `deleted_at IS NULL`이고 `visibility = 'public'`이거나 helper 기준 멤버 |
| INSERT space | 승인된 사용자 | 직접 INSERT 대신 `create_space` RPC |
| SELECT space_members | 해당 space 멤버 | `private.is_space_member(space_id)` |
| 멤버/차단/역할 변경 | owner/admin | 직접 변경 대신 검증 RPC |
| 소프트 삭제 | owner/admin | `soft_delete_space` RPC만 허용 |

`space_members` 정책은 해당 테이블을 다시 직접 조회하지 않고 `private.is_space_member()`를 사용하여 RLS 재귀를 방지한다.

### posts

| 정책 | 대상 | 조건 |
| --- | --- | --- |
| SELECT | 승인된 해당 space 멤버 | `deleted_at IS NULL` |
| INSERT | 승인된 해당 space 멤버 | `banned_at IS NULL` |
| UPDATE 내용 | 작성자 | column-level GRANT로 `title`,`content`만 허용 |
| UPDATE 핀 | owner/admin/manager | 직접 UPDATE 금지. 핀 RPC만 허용 |
| 소프트 삭제 | 작성자 또는 owner/admin | `soft_delete_post` RPC만 허용 |

### comments

| 정책 | 대상 | 조건 |
| --- | --- | --- |
| SELECT | 승인된 해당 space 멤버 | 활성 댓글 또는 답글이 있는 소프트 삭제 placeholder |
| INSERT | 승인된 해당 space 멤버 | `banned_at IS NULL` |
| UPDATE | 작성자 | column-level GRANT로 `content`만 허용 |
| 소프트 삭제 | 작성자 또는 owner/admin | `soft_delete_comment` RPC만 허용 |

### messages

| 정책 | 대상 | 조건 |
| --- | --- | --- |
| SELECT | 승인된 해당 room 멤버 | `deleted_at IS NULL` |
| INSERT | 승인된 해당 room 멤버 | sender_id는 현재 profile로 강제 |
| UPDATE | 작성자 | column-level GRANT로 `content`만 허용, 15분 제한 |
| 소프트 삭제 | 작성자 | `soft_delete_message` RPC만 허용 |

### 나머지 public 테이블 정책 범위

| 테이블군 | 최소 정책 |
| --- | --- |
| permissions | 승인 사용자는 SELECT, 변경은 app admin RPC |
| user_permissions | 본인은 SELECT, 변경은 app admin RPC |
| attachments | 부모 post/message 접근 권한을 상속, 변경은 작성자 또는 관리자 |
| reactions | 부모 콘텐츠 접근 가능 사용자만 SELECT/INSERT/UPDATE, 본인 행만 DELETE |
| chat_rooms/direct_chat_pairs/chat_room_members | room 멤버만 SELECT, 생성/멤버 변경은 검증 RPC |
| message_reads/chat_room_read_states | room 멤버가 자신의 상태만 INSERT/UPDATE, room 멤버만 SELECT |
| notifications | recipient 본인만 SELECT/UPDATE, INSERT는 신뢰된 RPC/서버만 |
| gongangs/song_requests | 승인 상태 및 별도 user_permissions 권한 검사 |
| clubs/club_apply_rounds/clubs_apply | 승인 사용자는 공개 데이터 SELECT, 신청은 본인만, 관리 변경은 app admin |

DECIDED: 익명 게시물/댓글의 `author_id`는 DB에서 마스킹하지 않는다. `is_anonymous`는 UI 표시 규칙이며, 조회 권한이 있는 사용자는 원본 행을 조회할 수 있다.

---

## 17. Storage 버킷

**파일:** `{타임스탬프}_17_storage_buckets.sql`

Supabase Storage 버킷은 SQL로 직접 생성하거나 대시보드에서 생성.

| 버킷명            | public | 용도             |
| ----------------- | ------ | ---------------- |
| `avatars`       | false  | 프로필 이미지    |
| `space-images`  | false  | 공간 대표 이미지 |
| `post-files`    | false  | 게시물 첨부파일  |
| `message-files` | false  | 메시지 첨부파일  |

DECIDED: 모든 버킷을 private으로 설정. 접근은 RLS로만 제어.

REASON: 오브젝트 경로 추측으로 인한 무단 접근 방지.

### Storage RLS 정책 (버킷별)

**avatars:**

* SELECT: 승인된 사용자 전체
* INSERT/UPDATE/DELETE: 본인 (`storage.objects.name` 기반 user id 검증)

**space-images:**

* SELECT: 해당 space 멤버 (또는 public space)
* INSERT/UPDATE/DELETE: space owner/admin

**post-files:**

* SELECT: 해당 post가 속한 space 멤버
* INSERT: 게시물 작성자
* DELETE: 게시물 작성자 또는 owner/admin

**message-files:**

* SELECT: 해당 채팅방 멤버
* INSERT: 해당 채팅방 멤버
* DELETE: 메시지 작성자

---

## 마이그레이션 검증 절차

각 마이그레이션 묶음은 아래 순서로 검증한다.

1. `supabase db reset`으로 빈 로컬 DB에 전체 migration을 처음부터 적용
2. `supabase migration list --local`로 적용 순서 확인
3. `supabase db diff --local`로 선언되지 않은 schema drift가 없는지 확인
4. `supabase db advisors` 또는 MCP advisors로 security/performance 경고 확인
5. `anon`, `authenticated`, 관리자, service role별 GRANT/RLS 접근 테스트
6. 승인 전 사용자, 승인 사용자, 탈퇴 사용자의 접근 차단 테스트
7. column-level GRANT가 role/status/pin/deleted 필드 직접 수정을 차단하는지 테스트
8. RPC 호출자가 다른 사용자의 ID를 가장할 수 없는지 테스트
9. space_members RLS 조회가 재귀 오류 없이 동작하는지 테스트
10. direct chat 생성 경쟁 상황에서 중복 방이 생기지 않고 멤버가 정확히 두 명인지 테스트
11. soft delete 후 활성 댓글 수와 reaction count가 정확한지 테스트
12. FK 삭제가 예상치 못한 연쇄 삭제 없이 RESTRICT/SET NULL로 동작하는지 테스트
13. 모든 FK 참조 컬럼에 사용 가능한 인덱스가 있는지 진단 쿼리로 확인
14. `supabase gen types typescript --local`로 생성 타입 갱신

현재 저장소에서는 Supabase CLI가 PATH에 없으므로, 실제 SQL 작성 전 CLI 실행 방법을 먼저 확정해야 한다.

---

## 미결 항목 요약 (TODO 전체)

| # | 테이블/영역 | 항목 | 옵션 |
| -- | --- | --- | --- |
| 1 | message_reads | 사용 조건 제한 방식 | RLS 제한 or 앱 레이어 제어 |
| 2 | song_requests | 큐 역할 필요 여부 | status 컬럼 추가 여부 |
| 3 | club_apply_rounds | 라운드 중복 방지 | 서버 단 constraint or 앱 레이어 |
| 4 | RPC | 각 함수의 SECURITY INVOKER/DEFINER 및 EXECUTE 대상 | 구현 전 보안 검토 |

---

*마지막 업데이트: 2026-06-11 설계 리뷰 반영*


