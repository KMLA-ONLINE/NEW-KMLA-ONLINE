# school_community — Supabase 마이그레이션 계획서 1/2

---

## 문서 규칙

* 각 섹션 앞에 **마이그레이션 파일명**을 명시한다.
  파일명 형식: `{CLI자동부여타임스탬프}_{name}.sql`
  예: `20260611072414_extensions.sql`
  이 문서에는 `{name}` 부분만 기재한다. 타임스탬프는 `supabase migration new {name}` 실행 시 CLI가 자동으로 부여하므로 agent가 직접 작성하거나 수정하지 않는다.
* `TODO:` 는 아직 결정되지 않은 항목. SQL 생성 전 사람이 확정해야 한다.
* `DECIDED:` 는 확정된 설계 결정. AI agent가 그대로 구현한다.
* `REASON:` 은 해당 결정을 내린 이유. 컨텍스트 유지용.
* `[REVISED] DECIDED:` 는 production-readiness 반복 검토에서 새로 추가하거나 강화한 결정이다.
* 문서에는 현재 유효한 결정만 유지한다. 변경된 구결정은 제거하고 최신 결정과 REASON을 남긴다.

### FK 삭제 원칙

DECIDED: `ON DELETE CASCADE`는 사용하지 않는다.

* 사용자 탈퇴처럼 참조 기록을 보존해야 하는 관계는 `ON DELETE SET NULL` 또는 보존 profile + `ON DELETE RESTRICT`
* 부모와 자식을 함께 영구 삭제해야 하는 경우에도 명시적 관리 RPC/정리 Job이 자식부터 순서대로 삭제
* 예상하지 못한 대량 연쇄 삭제를 막기 위해 나머지 FK는 기본 `ON DELETE RESTRICT`

[REVISED] DECIDED: 모든 hard purge는 service role 전용 관리 작업으로만 수행하고, 대상 부모 행을 잠근 뒤 자식 행·Storage 오브젝트를 명시된 순서로 제거한다. 일반 사용자와 `authenticated` 역할에는 부모/자식 도메인 테이블의 hard DELETE 권한을 부여하지 않는다.

REASON: 부모가 소프트 삭제된 직후 reaction/attachment INSERT가 경합하면 RESTRICT 실패나 고아 데이터가 생길 수 있으므로 purge 시작 시점부터 새 쓰기를 차단해야 한다.

---

## 마이그레이션 순서 개요

아래 순서대로 `supabase migration new {name}` 을 실행해 파일을 생성한다.
CLI가 타임스탬프를 자동으로 앞에 붙인다 (예: `20260611072414_extensions.sql`).

1. [01. security_defaults — 기본 Data API 권한 회수](#01-기본-data-api-권한-회수)
2. [02. extensions — 확장 활성화](#02-extensions)
3. [03. enums — enum 생성](#03-enums)
4. [04. tables_identity — profiles, permissions, user_permissions](#04-identity-테이블)
5. [05. tables_spaces — spaces, space_members](#05-spaces-테이블)
6. [06. tables_content — posts, post_attachments, comments](#06-content-테이블)
7. [07. tables_reactions — reaction_types, post_reactions, comment_reactions](#07-reactions-테이블)

이 문서의 마지막 마이그레이션을 적용한 뒤 [`migration-2.md`의 08. Chat 테이블](./migration-2.md#08-chat-테이블)부터 순서대로 진행한다.

---

## 01. 기본 Data API 권한 회수

**파일:** `{타임스탬프}_01_security_defaults.sql`

DECIDED: 새 public 테이블, 함수, sequence가 Data API 역할에 자동 노출되지 않도록 기본 권한을 먼저 회수한다.

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES
  FROM anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS
  FROM PUBLIC, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES
  FROM anon, authenticated, service_role;
```

DECIDED: 각 객체의 최소 `GRANT`는 RLS 정책과 함께 `rls_and_grants` 마이그레이션에서 명시한다.

REASON: `GRANT`는 역할이 객체에 접근 가능한지를 결정하고, RLS는 접근 가능한 객체에서 허용할 행을 결정한다. 둘 중 하나라도 없으면 접근할 수 없다.

[REVISED] DECIDED: `16_rls_and_grants`는 테이블별로 직접 REST/SDK 호출에 허용할 작업과 컬럼 allowlist를 명시한다. allowlist에 없는 식별자·역할·상태·감사·소프트 삭제 컬럼은 직접 INSERT/UPDATE할 수 없고 검증 RPC만 변경한다.

REASON: RLS는 행 접근만 제한하므로 column-level GRANT가 없으면 허용된 행의 `author_id`, `role`, `deleted_at` 등을 위조할 수 있다.

DECIDED: RLS helper와 내부 관리 함수용 비노출 schema를 생성한다.

```sql
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
```

---

## 02. Extensions

**파일:** `{타임스탬프}_02_extensions.sql`

DECIDED: 아래 확장을 활성화한다.

* `pg_trgm` — 한글 ILIKE 검색 지원
* `btree_gist` — gongangs exclusion constraint용

```
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gist;
```

DECIDED: 외부 노출용 UUID는 `gen_random_uuid()`를 사용한다. UUIDv7 정렬 특성은 내부 bigserial PK를 사용하므로 필요하지 않다.

DECIDED: 내부 PK의 `bigserial`은 유지한다.

REASON: identity 컬럼으로 변경해도 실질적인 성능 이점이 없으며, 현재 DBML 전체를 기계적으로 변경할 필요가 없다.

---

## 03. Enums

**파일:** `{타임스탬프}_03_enums.sql`

DECIDED: DBML에 정의된 enum을 그대로 생성한다.

* `app_role`: user, admin
* `profile_gender`: male, female
* `profile_type`: student, teacher, alumni
* `profile_status`: none, pending, accepted, rejected, withdrawn
* `member_role`: owner, admin, manager, member
* `notification_setting`: none, mentions, all
* `space_join_policy`: auto_join, invite_only
* `gongang_location`: floor_b1, floor_2, floor_4, floor_10
* `space_type`: group, community
* `club_type`: major, general

---

## 04. Identity 테이블

**파일:** `{타임스탬프}_04_tables_identity.sql`

### profiles

DECIDED: `auth.users.id`를 nullable `auth_user_id`로 참조. ON DELETE SET NULL.

REASON: 계정 탈퇴 후에도 게시물, 댓글, 메시지와 감사 기록을 보존해야 하므로 profile을 삭제하지 않는다.

DECIDED: 탈퇴 처리는 `withdraw_profile()` RPC로 수행한다.

* 개인정보를 익명화
* `status = 'withdrawn'`
* `deleted_at = now()`
* Auth 사용자 삭제 후 `auth_user_id`는 FK의 ON DELETE SET NULL로 정리
* 탈퇴 profile은 로그인하거나 새 콘텐츠를 작성할 수 없음

[REVISED] DECIDED: profile 최초 생성은 Auth 사용자 생성 후 실행되는 신뢰된 trigger 또는 service-role 서버 경로만 수행한다. 클라이언트는 `profiles` INSERT 권한을 받지 않으며 본인 profile의 허용된 온보딩 컬럼만 UPDATE할 수 있다.

[REVISED] DECIDED: `withdraw_profile()`은 owner인 space뿐 아니라 `app_role = 'admin'`인 사용자도 역할 이관 전까지 거부한다. space의 admin/manager 역할은 탈퇴를 막지 않으며, 탈퇴 즉시 승인 상태 검사에서 제외되어 권한을 잃고 owner/admin이 후속 정리할 수 있다.

REASON: 앱 전체 관리자 또는 유일 owner의 갑작스러운 비활성화는 복구 경로를 없애지만, 일반 space 관리 역할까지 탈퇴를 막으면 계정 삭제를 과도하게 제한한다.

[REVISED] DECIDED: auth.users 직접 삭제도 profile lifecycle 검증을 우회하지 못하도록 Auth 삭제 trigger가 owner/app admin이면 삭제를 거부하고, 그 외 사용자는 profile 익명화·withdrawn 처리를 수행한 뒤 auth_user_id를 NULL로 만든다. 관리자가 profile status를 accepted 이외로 변경하는 RPC도 owner/app admin 이관 검사를 적용한다.

REASON: Dashboard/service-role에서 Auth 사용자를 직접 삭제하거나 상태를 바꾸는 경로도 owner 없는 space와 관리자 공백을 만들 수 있다.

DECIDED: `status_updated_by`는 ON DELETE SET NULL.

REASON: 승인한 관리자가 탈퇴해도 승인 기록은 유지되어야 한다.

DECIDED: 추가할 CHECK 제약 (`13_constraints`에서 처리):

* `CHECK (cohort IS NULL OR cohort BETWEEN 1 AND 100)`
* `CHECK (class_no IS NULL OR class_no > 0)`
* `CHECK (student_number IS NULL OR student_number ~ '^\d{6}$')`
* `CHECK (dorm_room IS NULL OR dorm_room > 0)`
* `CHECK (deleted_at IS NOT NULL OR status = 'none' OR type <> 'student' OR (student_number IS NOT NULL AND cohort IS NOT NULL))`

[REVISED] DECIDED: profile `name`은 trim 후 1~50자다. nullable인 `anonymous_username`은 NULL이 아닌 경우에만 trim 후 1~50자와 정규화 UNIQUE를 강제한다. `description`은 최대 2,000자, `phone_number`는 허용 형식과 최대 길이를 검증한다.

REASON: OAuth 직후 `status = 'none'` profile은 학생 필수 정보가 아직 없어도 생성 가능해야 한다. 온보딩 제출 이후에는 학생 필수 필드를 강제한다.

DECIDED: `student_number` 앞 두 자리는 `cohort`를 인코딩하지 않는다. 두 필드 사이의 연계 CHECK를 추가하지 않는다.

DECIDED: `anonymous_username`에 UNIQUE 제약을 건다.

REASON: 같은 게시글 안에서 두 명의 익명 사용자가 동일한 이름을 가지면 구분이 불가능하다. 익명성은 실명 비공개로 달성하고, 닉네임 유일성은 별도로 보장한다.

[REVISED] DECIDED: `is_anonymous`는 보안상 익명성을 제공하지 않고 UI에서 실명 대신 전역 pseudonym을 표시하는 기능으로 정의한다. `anonymous_username`은 게시물 간 연결 가능하며, 조회 권한이 있는 사용자는 `author_id`도 볼 수 있다.

[REVISED] DECIDED: `anonymous_username`은 저장 전후 trim된 값이어야 하고 대소문자를 구분하지 않는 정규화 값으로 전역 UNIQUE를 검사한다. 공백 또는 대소문자 차이만으로 기존 pseudonym을 가장할 수 없다.

[REVISED] DECIDED: 익명 post/comment의 표시 이름은 profile의 `anonymous_username`을 우선 사용하고, NULL이면 `익명 {author_id}`를 반환한다. fallback은 기존 내부 `author_id`를 사용하므로 별도 컬럼을 추가하지 않는다.

REASON: 전역 UNIQUE pseudonym과 마스킹하지 않는 `author_id` 설계에서는 사용자의 활동 연결을 막을 수 없다. 기능 명칭과 개인정보 안내에서 이 한계를 명확히 고지한다.

### permissions / user_permissions

DECIDED: `user_permissions.granted_by`는 ON DELETE SET NULL.

DECIDED: `user_permissions.(user_id, permission_key)` 복합 PK.

---

## 05. Spaces 테이블

**파일:** `{타임스탬프}_05_tables_spaces.sql`

### spaces

DECIDED: `created_by`는 ON DELETE SET NULL.

REASON: 공간을 만든 사람이 탈퇴해도 공간은 유지되어야 한다.

DECIDED: partial unique index (`13_constraints`에서 처리):

```sql
CREATE UNIQUE INDEX spaces_active_group_name_unique
  ON spaces (lower(btrim(name)))
  WHERE type = 'group' AND deleted_at IS NULL;
```

REASON: group 타입은 이름이 전역 고유해야 하지만, community는 중복 허용.

[REVISED] DECIDED: group 이름 고유성은 활성 group에만 적용하여 `type = 'group' AND deleted_at IS NULL`인 행끼리 전역 고유하게 한다. 삭제된 group을 복구할 때 같은 이름의 활성 group이 이미 있으면 복구를 거부하고 관리자에게 이름 변경 또는 충돌 group 정리를 요구한다.

REASON: 소프트 삭제된 group 이름을 영구 예약하지 않으면서 복구 시점의 충돌도 명시적으로 처리해야 한다.

[REVISED] DECIDED: space 이름은 trim 후 1~100자, description은 최대 5,000자로 제한한다. 활성 group 이름 고유성은 대소문자를 구분하지 않는 정규화 이름으로 검사한다.

[REVISED] DECIDED: spaces의 가입 방식은 `join_policy = auto_join | invite_only`로 관리하고 `create_space()` 호출자가 생성 시 선택한다. `auto_join`은 accepted 사용자의 `join_space()` 호출 즉시 membership을 생성하고, `invite_only`는 owner/admin의 초대·추가 RPC만 membership을 생성한다.

[REVISED] DECIDED: spaces에 `member_count int4 NOT NULL DEFAULT 0` 캐시 컬럼을 추가한다. `space_members` INSERT/DELETE가 현재 멤버 수를 원자적으로 증감하고 운영 reconciliation job이 실제 행 수와 대조한다.

DECIDED: spaces는 `deleted_at`, `deleted_by`를 추가하여 소프트 삭제한다.

* 직접 DELETE 금지
* `soft_delete_space()` RPC만 `deleted_at`, `deleted_by`를 갱신
* 삭제된 공간과 하위 게시물은 일반 SELECT/INSERT 대상에서 제외
* 영구 삭제가 필요하면 별도 관리자 purge 작업이 참조 데이터를 명시적 순서로 정리

[REVISED] DECIDED: `create_space()` RPC가 space와 최초 owner membership을 한 트랜잭션에서 생성한다. `spaces`와 owner 역할의 직접 INSERT를 금지하며, 생성 완료 시 owner가 정확히 한 명인지 검증한다.

[REVISED] DECIDED: owner 양도 RPC는 대상 space와 현재/신규 owner membership 행을 잠그고, partial unique index 경합을 피하도록 기존 owner 강등과 신규 owner 승격을 하나의 트랜잭션에서 수행한다.

REASON: partial unique index는 owner가 최대 한 명임만 보장하며, RPC와 잠금이 없으면 owner가 0명인 공간이나 동시 양도 충돌이 생길 수 있다.

### space_members

DECIDED: `(space_id, user_id)` 복합 PK.

DECIDED: `banned_by`는 ON DELETE SET NULL.

DECIDED: partial unique index (`13_constraints`에서 처리):

```sql
CREATE UNIQUE INDEX space_members_one_owner
  ON space_members (space_id) WHERE role = 'owner';
```

DECIDED: owner 양도는 반드시 RPC로 처리한다 (`15_rpc_functions`에서 정의). 두 UPDATE가 하나의 트랜잭션 안에 있어야 한다.

DECIDED: owner는 탈퇴 전에 반드시 양도를 완료해야 한다. `withdraw_profile()` RPC는 owner인 space가 하나라도 있으면 거부한다.

[REVISED] DECIDED: `private.is_space_member()`는 현재 profile이 `accepted`, 비탈퇴 상태이고 membership의 `banned_at IS NULL`, 대상 space의 `deleted_at IS NULL`일 때만 true를 반환한다. owner/admin/manager 검사도 같은 활성 조건을 공유한다.

---

## 06. Content 테이블

**파일:** `{타임스탬프}_06_tables_content.sql`

### posts

DECIDED: `space_id` NOT NULL로 변경. (DBML에 nullable로 선언되어 있으나, 모든 게시물은 반드시 하나의 space에 속한다.)

DECIDED: `space_type` NOT NULL로 변경. 트리거(`14_triggers`)로 `spaces.type`에서 자동 동기화.

REASON: `idx_posts_space_type_created_at` 인덱스가 NULL 행을 제외해 희박해지는 것을 방지.

DECIDED: `author_id`는 ON DELETE RESTRICT.

REASON: 게시물 작성자가 탈퇴해도 게시물은 남아야 한다. 소프트 삭제 처리. 탈퇴한 사용자는 "삭제된 계정"으로 표시.

DECIDED: 탈퇴한 사용자는 보존된 profile의 `deleted_at`을 기준으로 "탈퇴한 사용자"로 표시한다.

DECIDED: `pinned_by`는 ON DELETE SET NULL.

DECIDED: `deleted_by`는 ON DELETE SET NULL.

DECIDED: `search_vector`는 generated stored column:

```sql
search_vector tsvector GENERATED ALWAYS AS (
  to_tsvector('simple',
    coalesce(title, '') || ' ' || coalesce(content, ''))
) STORED
```

DECIDED: 추가할 CHECK (`13_constraints`에서 처리):

* `CHECK (comment_count >= 0)`
* `CHECK (reaction_count >= 0)`
* `CHECK (is_pinned = false OR pinned_at IS NOT NULL)` — 핀 고정 일관성

[REVISED] DECIDED: 게시물 title은 trim 후 1~200자, content는 trim 후 1~50,000자로 제한한다. comments content는 trim 후 1~10,000자로 제한하며 placeholder 문구는 soft-delete RPC만 기록할 수 있다.

[REVISED] DECIDED: posts 직접 INSERT는 `space_id`, `title`, `content`, `is_anonymous`만 클라이언트 입력으로 허용하고 `author_id`는 현재 profile ID와 일치하도록 `WITH CHECK`한다. 대상 space가 활성 상태이고 호출자가 accepted·비차단 멤버일 때만 허용한다.

[REVISED] DECIDED: `is_anonymous = true`인 post/comment INSERT와 posts의 `is_anonymous` false→true UPDATE는 작성자 본인·활성 parent·활성 membership을 검사하고, `anonymous_username`이 NULL이면 `익명 {author_id}` fallback을 사용하므로 허용한다. posts의 true→false UPDATE도 작성자의 실명 표시 전환이므로 `anonymous_username` 존재 여부와 무관하게 허용한다.

[REVISED] DECIDED: posts 직접 UPDATE는 작성자의 `title`, `content`, `is_anonymous`만 허용하며, 작성자가 여전히 accepted·비차단 멤버이고 post/space가 삭제되지 않은 경우에만 허용한다. `space_id`, `space_type`, `author_id`, pin/count/audit 필드는 직접 변경할 수 없다.

[REVISED] DECIDED: feed pagination은 `(created_at DESC, id DESC)` keyset cursor를 사용한다. 페이지 사이에 소프트 삭제된 행은 다음 페이지에서 제외하며, 완전한 snapshot 일관성은 제공하지 않는 accepted trade-off로 문서화한다.

REASON: offset pagination은 중간 삭제 시 중복·누락이 커지고, 장시간 snapshot transaction은 Data API 요청 모델에 부적합하다.

### post_attachments

DECIDED: `post_id`는 ON DELETE RESTRICT.

REASON: 게시물 영구 삭제 전에 관리 RPC/정리 Job이 Storage 오브젝트와 첨부파일 레코드를 명시적으로 정리해야 한다.

DECIDED: 추가할 CHECK (`13_constraints`에서 처리):

* `CHECK (size_bytes >= 0)`
* `CHECK (sort_order >= 0)`
* `CHECK (width IS NULL OR width > 0)`
* `CHECK (height IS NULL OR height > 0)`

DECIDED: 소프트 삭제된 게시물의 첨부파일 레코드와 Storage 오브젝트는 삭제 7일 후 주기적 정리 Job으로 제거한다.

* 대상 조건: `posts.deleted_at IS NOT NULL AND posts.deleted_at < now() - interval '7 days'`
* Storage 오브젝트를 먼저 삭제한 뒤 첨부파일 레코드를 삭제
[REVISED] DECIDED: Storage object 삭제가 포함된 attachment cleanup은 migration-2 section 17에서 정한 scheduled Edge Function/service-role worker로 수행한다.

[REVISED] DECIDED: post attachment 업로드는 `post-files/{post_pub_id}/{uploader_auth_uid}/{random_object_id}` 경로만 허용하고, 업로드 후 `finalize_post_attachment()` RPC가 작성자·활성 post·오브젝트 경로·bucket·크기·MIME를 검증한 뒤 attachment 행을 생성한다.

[REVISED] DECIDED: `finalize_post_attachment()` 호출자는 해당 post의 작성자여야 한다. space 관리자 권한만으로 다른 사용자의 post에 attachment를 추가할 수 없으며, 관리자 첨부가 필요해지면 별도 감사 로그가 있는 관리 RPC로 설계한다.

[REVISED] DECIDED: 참조 attachment 행이 없는 Storage 오브젝트는 생성 후 24시간이 지나면 orphan cleanup job이 삭제한다. 7일 soft-delete cleanup은 참조된 오브젝트를 Storage에서 먼저 삭제하고 성공한 항목의 attachment 행만 삭제하며, 실패 항목은 다음 실행에서 재시도한다.

REASON: Storage 업로드 성공 후 DB 행 생성 실패, 또는 악의적인 직접 업로드로 생긴 고아 오브젝트를 정리해야 한다.

### comments

DECIDED: `post_id`는 ON DELETE RESTRICT.

DECIDED: `author_id`는 ON DELETE RESTRICT (posts와 동일한 이유).

DECIDED: `parent_id`는 ON DELETE RESTRICT.

REASON: 부모 댓글은 소프트 삭제 시 placeholder를 유지하며, 영구 삭제는 답글 정리 여부를 명시적으로 결정한 관리 작업에서만 수행한다.

DECIDED: `deleted_by`는 ON DELETE SET NULL.

DECIDED: `search_vector`는 generated stored column:

```sql
search_vector tsvector GENERATED ALWAYS AS (
  to_tsvector('simple', coalesce(content, ''))
) STORED
```

DECIDED: 1레벨 중첩 강제는 트리거(`14_triggers`)로 처리:

* `parent_id`가 가리키는 댓글의 `parent_id`가 NULL이어야 함
* `parent_id`가 가리키는 댓글의 `post_id`가 현재 행의 `post_id`와 일치해야 함

[REVISED] DECIDED: comments 직접 INSERT/UPDATE는 현재 profile을 `author_id`로 강제하고, accepted·비차단 멤버가 활성 post에만 작성하도록 검증한다. `post_id`, `parent_id`, `author_id`, 삭제·감사 필드는 생성 후 직접 변경할 수 없다.

[REVISED] DECIDED: `soft_delete_comment()`은 원문과 검색 노출을 제거하고 placeholder 표시용 고정 문구로 content를 교체한다. 답글이 있는 삭제 댓글은 멤버에게 placeholder 행으로 보이며, 답글이 없는 삭제 댓글은 일반 SELECT에서 숨긴다.

REASON: 삭제 행을 그대로 SELECT 허용하면 placeholder 정책이 삭제된 원문을 노출한다.

---

## 07. Reactions 테이블

**파일:** `{타임스탬프}_07_tables_reactions.sql`

### reaction_types

DECIDED: 초기 데이터 시드:

| key   | name     | sort_order |
| ----- | -------- | ---------- |
| like  | 좋아요   | 0          |
| love  | 사랑해요 | 1          |
| laugh | 웃겨요   | 2          |
| wow   | 놀라워요 | 3          |
| sad   | 슬퍼요   | 4          |
| angry | 화나요   | 5          |

### post_reactions / comment_reactions

DECIDED: 각각 `post_id`, `comment_id`는 ON DELETE RESTRICT. 영구 삭제 관리 작업이 리액션을 먼저 삭제한다.

DECIDED: 리액션 변경은 `reaction_type_id` UPDATE (행 삭제 후 재삽입 아님). `updated_at`을 갱신.

DECIDED: `posts.reaction_count` 캐시 갱신 트리거(`14_triggers`)에서 처리. INSERT/UPDATE/DELETE 모두 감지.

[REVISED] DECIDED: reaction 직접 INSERT/UPDATE/DELETE는 현재 profile의 `user_id`만 허용하고, accepted·비차단 사용자가 활성 parent에만 수행할 수 있다. parent가 소프트 삭제되면 reaction은 조회·변경할 수 없으며 hard purge 작업이 reaction을 먼저 삭제한다.

[REVISED] DECIDED: reaction_count 트리거는 동시 요청에서도 원자적 증감 또는 행 잠금을 사용하고, UPDATE에서 parent 변경은 column-level GRANT로 금지한다. 운영 검증 작업은 캐시값과 실제 활성 reaction 수를 주기적으로 대조한다.

[REVISED] DECIDED: post/comment/message reaction의 직접 UPDATE allowlist는 `reaction_type_id`만 허용한다. parent FK와 `user_id`는 생성 후 변경할 수 없고, 새 reaction type은 `reaction_types`에 존재해야 한다. reaction type 비활성화가 필요해지면 별도 상태 컬럼과 정책을 추가하기 전까지 registry 행을 삭제하지 않는다.

[REVISED] DECIDED: 캐시 카운트는 `posts.reaction_count`만 유지한다. comment reaction count와 message reaction count는 캐시 컬럼·증감 트리거를 만들지 않고 필요 시 각 reaction 테이블에서 집계한다.

---
