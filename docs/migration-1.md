# school_community — Supabase 마이그레이션 계획서 1/2

> **담당 범위**
> 이 문서는 기반 설정과 `profiles`, `permissions`, `user_permissions`, `spaces`, `space_members`, `posts`, `post_attachments`, `comments`, `reaction_types`, `post_reactions`, `comment_reactions` 테이블을 담당한다.
>
> `chat`, `notifications`, `utilities`, `clubs` 테이블과 모든 테이블 생성 후 실행하는 공통 인덱스·제약조건·트리거·RLS/GRANT·RPC·Storage·검증 절차는 `migration-2.md`가 담당한다.

> **이 문서의 용도**
> SCHEMA.md는 테이블 구조만 선언한다. 이 문서는 "무엇을 왜 만들어야 하는지"를 테이블 단위로 정의한다.
> AI agent는 이 문서를 읽고 마이그레이션 SQL을 하나씩 생성한다. 각 섹션이 하나의 마이그레이션 파일에 대응한다.

---

## 문서 규칙

* 각 섹션 앞에 **마이그레이션 파일명**을 명시한다.
  파일명 형식: `{CLI자동부여타임스탬프}_{name}.sql`
  예: `20260611072414_extensions.sql`
  이 문서에는 `{name}` 부분만 기재한다. 타임스탬프는 `supabase migration new {name}` 실행 시 CLI가 자동으로 부여하므로 agent가 직접 작성하거나 수정하지 않는다.
* `TODO:` 는 아직 결정되지 않은 항목. SQL 생성 전 사람이 확정해야 한다.
* `DECIDED:` 는 확정된 설계 결정. AI agent가 그대로 구현한다.
* `REASON:` 은 해당 결정을 내린 이유. 컨텍스트 유지용.

### FK 삭제 원칙

DECIDED: `ON DELETE CASCADE`는 사용하지 않는다.

* 사용자 탈퇴처럼 참조 기록을 보존해야 하는 관계는 `ON DELETE SET NULL` 또는 보존 profile + `ON DELETE RESTRICT`
* 부모와 자식을 함께 영구 삭제해야 하는 경우에도 명시적 관리 RPC/정리 Job이 자식부터 순서대로 삭제
* 예상하지 못한 대량 연쇄 삭제를 막기 위해 나머지 FK는 기본 `ON DELETE RESTRICT`

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
* `visibility`: public, invite_only
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

DECIDED: `status_updated_by`는 ON DELETE SET NULL.

REASON: 승인한 관리자가 탈퇴해도 승인 기록은 유지되어야 한다.

DECIDED: 추가할 CHECK 제약 (`13_constraints`에서 처리):

* `CHECK (cohort IS NULL OR cohort BETWEEN 1 AND 100)`
* `CHECK (class_no IS NULL OR class_no > 0)`
* `CHECK (student_number IS NULL OR student_number ~ '^\d{6}$')`
* `CHECK (dorm_room IS NULL OR dorm_room > 0)`
* `CHECK (deleted_at IS NOT NULL OR status = 'none' OR type <> 'student' OR (student_number IS NOT NULL AND cohort IS NOT NULL))`

REASON: OAuth 직후 `status = 'none'` profile은 학생 필수 정보가 아직 없어도 생성 가능해야 한다. 온보딩 제출 이후에는 학생 필수 필드를 강제한다.

DECIDED: `student_number` 앞 두 자리는 `cohort`를 인코딩하지 않는다. 두 필드 사이의 연계 CHECK를 추가하지 않는다.

DECIDED: `anonymous_username`에 UNIQUE 제약을 건다.

REASON: 같은 게시글 안에서 두 명의 익명 사용자가 동일한 이름을 가지면 구분이 불가능하다. 익명성은 실명 비공개로 달성하고, 닉네임 유일성은 별도로 보장한다.

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
CREATE UNIQUE INDEX spaces_group_name_unique
  ON spaces (name) WHERE type = 'group';
```

REASON: group 타입은 이름이 전역 고유해야 하지만, community는 중복 허용.

DECIDED: spaces는 `deleted_at`, `deleted_by`를 추가하여 소프트 삭제한다.

* 직접 DELETE 금지
* `soft_delete_space()` RPC만 `deleted_at`, `deleted_by`를 갱신
* 삭제된 공간과 하위 게시물은 일반 SELECT/INSERT 대상에서 제외
* 영구 삭제가 필요하면 별도 관리자 purge 작업이 참조 데이터를 명시적 순서로 정리

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
* pg_cron 또는 Edge Function 중 실제 실행 방식은 구현 전에 확정

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

---

다음 단계는 [`migration-2.md`의 08. Chat 테이블](./migration-2.md#08-chat-테이블)부터 이어서 진행한다.

*마지막 업데이트: 2026-06-11 설계 리뷰 반영*
