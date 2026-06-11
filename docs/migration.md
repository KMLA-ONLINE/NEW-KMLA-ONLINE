# school_community — AI Agent용 Supabase 마이그레이션 실행서

이 문서는 실제 Supabase migration 구현에 필요한 전체 실행 명세다. 다른 migration 계획 문서나 `SCHEMA.md` 없이 이 문서만 보고 작업한다.

## 실행 규칙

1. 아래 01 ~ 17 순서를 변경하지 않는다.
2. 각 SQL 파일은 `supabase migration new {name}`으로 생성한다. 타임스탬프를 직접 작성하지 않는다.
3. 테이블·컬럼·enum의 최종 정의는 이 문서의 데이터 모델 계약을 따른다.
4. 이 문서에 없는 객체·컬럼·권한·동작은 임의로 추가하지 않는다.
5. `ON DELETE CASCADE`를 사용하지 않는다.
6. 감사·원본 참조 보존 FK는 `ON DELETE SET NULL`, 나머지는 기본 `ON DELETE RESTRICT`로 구현한다.
7. public schema의 모든 테이블에 RLS를 활성화한다.
8. `anon`, `authenticated`, `service_role`, `PUBLIC` 권한은 필요한 객체에만 명시적으로 부여한다.
9. `SECURITY DEFINER` 함수는 `SET search_path = ''`와 함수 내부 권한 검사를 포함한다.
10. 모든 migration 적용 후 검증 절차를 실행한다.
11. 명시되지 않은 client 권한은 허용하지 않는다. 판단이 필요한 경우 권한을 추가하지 말고 작업을 중단한다.
12. SQL 예시보다 본문의 최종 계약이 우선한다. 같은 객체를 여러 section에서 다루면 뒤 section이 앞 section의 권한·제약·트리거를 완성한다.

## 생성 순서

| 순서 | migration 이름         | 주요 작업                               |
| ---- | ---------------------- | --------------------------------------- |
| 01   | `security_defaults`    | 기본 Data API 권한 회수, private schema |
| 02   | `extensions`           | 확장 활성화                             |
| 03   | `enums`                | enum 생성                               |
| 04   | `tables_identity`      | profiles, permissions                   |
| 05   | `tables_spaces`        | spaces, space_members                   |
| 06   | `tables_content`       | posts, attachments, comments            |
| 07   | `tables_reactions`     | reaction registry 및 reactions          |
| 08   | `tables_chat`          | chat 전체 테이블                        |
| 09   | `tables_notifications` | notifications                           |
| 10   | `tables_utilities`     | gongangs, song_requests                 |
| 11   | `tables_clubs`         | clubs 및 신청                           |
| 12   | `indexes`              | 명시된 필수 인덱스                      |
| 13   | `constraints`          | CHECK, unique, exclusion, FK            |
| 14   | `triggers`             | 검증·동기화·캐시 트리거                 |
| 15   | `rpc_functions`        | mutation/search/cleanup RPC             |
| 16   | `rls_and_grants`       | RLS, helper, GRANT                      |
| 17   | `storage_buckets`      | Storage, cleanup queue, jobs            |

---

## 01. security_defaults

파일 생성:

```bash
supabase migration new security_defaults
```

구현:

- `postgres` 역할의 public schema 기본 privileges에서 아래 권한을 회수한다.
  - tables: `SELECT, INSERT, UPDATE, DELETE`
  - sequences: `USAGE, SELECT`
  - functions: `EXECUTE`
  - 대상 역할: `anon`, `authenticated`, `service_role`
- 함수의 `PUBLIC EXECUTE` 기본 권한을 회수한다.
- 비노출 `private` schema를 생성한다.
- private schema를 Data API exposed schema에 포함하지 않는다.

---

## 02. extensions

파일 생성:

```bash
supabase migration new extensions
```

활성화:

- `pg_trgm`
- `btree_gist`
- 외부 UUID는 `gen_random_uuid()`를 사용한다.
- 내부 PK는 `bigserial`을 사용한다.

---

## 03. enums

파일 생성:

```bash
supabase migration new enums
```

생성:

- `app_role`: `user`, `admin`
- `profile_gender`: `male`, `female`
- `profile_type`: `student`, `teacher`, `alumni`
- `profile_status`: `none`, `pending`, `accepted`, `rejected`, `withdrawn`
- `member_role`: `owner`, `admin`, `manager`, `member`
- `notification_setting`: `none`, `mentions`, `all`
- `space_join_policy`: `auto_join`, `invite_only`
- `gongang_location`: `floor_b1`, `floor_2`, `floor_4`, `floor_10`
- `space_type`: `group`, `community`
- `club_type`: `major`, `general`

## 데이터 모델 계약

아래 표기에서 `?`는 nullable, `PK`는 primary key, `UQ`는 unique, `→`는 FK다. 명시되지 않은 컬럼은 추가하지 않는다. generated column과 FK 삭제 동작은 뒤 section의 계약을 함께 적용한다.
`auth.users`는 Supabase Auth가 관리하므로 생성하지 않고 `profiles.auth_user_id` FK 대상으로만 참조한다.

```text
profiles(
  id bigserial PK,
  auth_user_id uuid? UQ → auth.users.id,
  pub_id uuid NOT NULL UQ DEFAULT gen_random_uuid(),
  name text NOT NULL,
  anonymous_username text?,
  role app_role NOT NULL DEFAULT 'user',
  type profile_type NOT NULL DEFAULT 'student',
  student_number char(6)? UQ,
  class_no int2?, cohort int2?, gender profile_gender?, phone_number text?,
  avatar_url text?, birthday date?, description text?,
  status profile_status NOT NULL DEFAULT 'none',
  dorm_room int2?, onboarding_completed_at timestamptz?,
  status_updated_at timestamptz?, status_updated_by bigint? → profiles.id,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz?, deleted_at timestamptz?
)

permissions(
  key text PK, name text NOT NULL, description text?,
  created_at timestamptz NOT NULL DEFAULT now()
)

user_permissions(
  user_id bigint NOT NULL → profiles.id,
  permission_key text NOT NULL → permissions.key,
  granted_at timestamptz NOT NULL DEFAULT now(),
  granted_by bigint? → profiles.id,
  PK(user_id, permission_key)
)

spaces(
  id bigserial PK,
  pub_id uuid NOT NULL UQ DEFAULT gen_random_uuid(),
  type space_type NOT NULL,
  name text NOT NULL, description text?, image_url text?,
  join_policy space_join_policy NOT NULL DEFAULT 'auto_join',
  member_count int4 NOT NULL DEFAULT 0,
  created_by bigint? → profiles.id,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz?, deleted_at timestamptz?, deleted_by bigint? → profiles.id
)

space_members(
  space_id bigint NOT NULL → spaces.id,
  user_id bigint NOT NULL → profiles.id,
  role member_role NOT NULL DEFAULT 'member',
  notification_setting notification_setting NOT NULL DEFAULT 'mentions',
  banned_at timestamptz?, banned_by bigint? → profiles.id, ban_reason text?,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PK(space_id, user_id)
)
```

```text
posts(
  id bigserial PK,
  pub_id uuid NOT NULL UQ DEFAULT gen_random_uuid(),
  space_id bigint NOT NULL → spaces.id,
  space_type space_type NOT NULL,
  author_id bigint NOT NULL → profiles.id,
  title text NOT NULL, content text NOT NULL,
  is_anonymous boolean NOT NULL DEFAULT false,
  search_vector tsvector GENERATED STORED,
  is_pinned boolean NOT NULL DEFAULT false,
  pinned_at timestamptz?, pinned_by bigint? → profiles.id,
  comment_count int4 NOT NULL DEFAULT 0,
  reaction_count int4 NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz?, deleted_at timestamptz?, deleted_by bigint? → profiles.id
)

post_attachments(
  id bigserial PK,
  post_id bigint NOT NULL → posts.id,
  storage_bucket text NOT NULL, storage_path text NOT NULL,
  file_name text NOT NULL, content_type text NOT NULL,
  size_bytes int8?, sort_order int4 NOT NULL DEFAULT 0,
  alt text?, width int4?, height int4?,
  created_at timestamptz NOT NULL DEFAULT now()
)

comments(
  id bigserial PK,
  post_id bigint NOT NULL → posts.id,
  author_id bigint NOT NULL → profiles.id,
  parent_id bigint? → comments.id,
  content text NOT NULL,
  search_vector tsvector GENERATED STORED,
  is_anonymous boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz?, deleted_at timestamptz?, deleted_by bigint? → profiles.id
)

reaction_types(
  id bigserial PK, key text NOT NULL UQ, name text NOT NULL,
  icon text?, sort_order int2 NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
)

post_reactions(
  id bigserial PK,
  post_id bigint NOT NULL → posts.id,
  user_id bigint NOT NULL → profiles.id,
  reaction_type_id bigint NOT NULL → reaction_types.id,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz?,
  UQ(post_id, user_id)
)

comment_reactions(
  id bigserial PK,
  comment_id bigint NOT NULL → comments.id,
  user_id bigint NOT NULL → profiles.id,
  reaction_type_id bigint NOT NULL → reaction_types.id,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz?,
  UQ(comment_id, user_id)
)
```

```text
chat_rooms(
  id bigserial PK, name text?, is_group boolean NOT NULL DEFAULT false,
  created_by bigint? → profiles.id,
  created_at timestamptz NOT NULL DEFAULT now()
)

direct_chat_pairs(
  room_id bigint PK → chat_rooms.id,
  user1_id bigint NOT NULL → profiles.id,
  user2_id bigint NOT NULL → profiles.id,
  created_at timestamptz NOT NULL DEFAULT now(),
  UQ(user1_id, user2_id)
)

chat_room_members(
  room_id bigint NOT NULL → chat_rooms.id,
  user_id bigint NOT NULL → profiles.id,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PK(room_id, user_id)
)

messages(
  id bigserial PK,
  room_id bigint NOT NULL → chat_rooms.id,
  sender_id bigint NOT NULL → profiles.id,
  parent_id bigint? → messages.id,
  content text NOT NULL,
  search_vector tsvector GENERATED STORED,
  is_edited boolean NOT NULL DEFAULT false,
  edited_at timestamptz?, deleted_at timestamptz?, deleted_by bigint? → profiles.id,
  created_at timestamptz NOT NULL DEFAULT now()
)

message_attachments(
  id bigserial PK,
  message_id bigint NOT NULL → messages.id,
  storage_bucket text NOT NULL, storage_path text NOT NULL,
  file_name text NOT NULL, content_type text NOT NULL,
  size_bytes int8?, sort_order int4 NOT NULL DEFAULT 0,
  width int4?, height int4?,
  created_at timestamptz NOT NULL DEFAULT now()
)

message_reactions(
  id bigserial PK,
  message_id bigint NOT NULL → messages.id,
  user_id bigint NOT NULL → profiles.id,
  reaction_type_id bigint NOT NULL → reaction_types.id,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz?,
  UQ(message_id, user_id)
)

message_reads(
  message_id bigint NOT NULL → messages.id,
  user_id bigint NOT NULL → profiles.id,
  read_at timestamptz NOT NULL DEFAULT now(),
  PK(message_id, user_id)
)

chat_room_read_states(
  room_id bigint NOT NULL → chat_rooms.id,
  user_id bigint NOT NULL → profiles.id,
  last_read_message_id bigint? → messages.id,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PK(room_id, user_id)
)
```

```text
notifications(
  id bigserial PK,
  recipient_id bigint NOT NULL → profiles.id,
  actor_id bigint? → profiles.id,
  title text?, body text?,
  space_id bigint? → spaces.id, space_type space_type?,
  post_id bigint? → posts.id, comment_id bigint? → comments.id, message_id bigint? → messages.id,
  read_at timestamptz?, created_at timestamptz NOT NULL DEFAULT now()
)

gongangs(
  id bigserial PK,
  location gongang_location NOT NULL,
  owner_id bigint NOT NULL → profiles.id,
  day_of_week int2 NOT NULL,
  start_minute int2 NOT NULL, end_minute int2 NOT NULL,
  valid_from date NOT NULL, valid_until date NOT NULL,
  time_range int4range GENERATED STORED NOT NULL,
  validity_range daterange GENERATED STORED NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
)

song_requests(
  id bigserial PK,
  requester_id bigint NOT NULL → profiles.id,
  url text NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now()
)

clubs(
  id bigserial PK, name text NOT NULL UQ, description text?,
  type club_type NOT NULL DEFAULT 'major',
  created_at timestamptz NOT NULL DEFAULT now()
)

club_apply_rounds(
  id bigserial PK, name text NOT NULL,
  starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
  apply_range tstzrange GENERATED STORED NOT NULL,
  created_by bigint? → profiles.id,
  created_at timestamptz NOT NULL DEFAULT now()
)

clubs_apply(
  id bigserial PK,
  round_id bigint NOT NULL → club_apply_rounds.id,
  user_id bigint NOT NULL → profiles.id,
  club_id bigint NOT NULL → clubs.id,
  created_at timestamptz NOT NULL DEFAULT now(),
  UQ(round_id, user_id, club_id)
)

private.attachment_cleanup_queue(
  id bigserial PK,
  storage_bucket text NOT NULL, storage_path text NOT NULL,
  requested_by bigint? → profiles.id,
  requested_at timestamptz NOT NULL DEFAULT now(),
  available_at timestamptz NOT NULL DEFAULT now(),
  attempts int4 NOT NULL DEFAULT 0,
  last_error text?, processed_at timestamptz?,
  UQ(storage_bucket, storage_path)
)
```

---

## 04. tables_identity

파일 생성:

```bash
supabase migration new tables_identity
```

데이터 모델 계약에 따라 생성:

- `profiles`
- `permissions`
- `user_permissions`

필수 처리:

- `profiles.auth_user_id → auth.users.id`: nullable, `ON DELETE SET NULL`
- `profiles.status_updated_by`: `ON DELETE SET NULL`
- `user_permissions.granted_by`: `ON DELETE SET NULL`
- `user_permissions`: `(user_id, permission_key)` 복합 PK
- profile 최초 생성은 Auth trigger 또는 service-role 서버 경로만 사용한다.
- `anonymous_username`은 nullable이며, non-NULL 값은 trim 후 1 ~ 15자와 대소문자 비구분 전역 unique를 강제한다.
- Auth 사용자 직접 삭제 시 owner/app admin이면 거부하고, 나머지는 profile을 withdrawn·익명화 처리한다.
- withdrawn 익명화 시 `name = '탈퇴한 사용자'`, `role = 'user'`, `anonymous_username`, `student_number`, `class_no`, `cohort`, `gender`, `phone_number`, `avatar_url`, `birthday`, `description`, `dorm_room`을 NULL로 만든다. `id`, `pub_id`, `type`, 생성·상태 감사 필드는 보존한다.
- profile 상태 전이는 `none/rejected → pending`은 본인 onboarding RPC, `pending → accepted/rejected`는 app admin review RPC, `accepted → withdrawn`은 본인 withdrawal RPC로 처리한다. 그 외 상태 변경은 app admin lifecycle RPC만 허용한다.
- owner 또는 app admin은 역할 이관 전 withdrawal, Auth 삭제, accepted 이외 상태 전환을 거부한다. space admin/manager는 withdrawal을 막지 않는다.
- permissions 초기 행으로 `gongang`, `karaoke`를 생성한다.
- profile CHECK:
  - `cohort IS NULL OR cohort BETWEEN 1 AND 100`
  - `class_no IS NULL OR class_no > 0`
  - `student_number IS NULL OR student_number  ~  '^\d{6}$'`
  - `phone_number IS NULL OR phone_number  ~  '^\+?[0-9]{8,15}$'`; 저장값에 공백·하이픈을 허용하지 않는다.
  - `dorm_room IS NULL OR dorm_room > 0`
  - active student onboarding 이후 `student_number`, `cohort` 필수

---

## 05. tables_spaces

파일 생성:

```bash
supabase migration new tables_spaces
```

데이터 모델 계약에 따라 생성:

- `spaces`
- `space_members`

필수 처리:

- `spaces.join_policy`: 생성 시 `auto_join` 또는 `invite_only` 선택
- `spaces.member_count`: `int4 NOT NULL DEFAULT 0`
- `spaces.created_by`, `spaces.deleted_by`, `space_members.banned_by`: `ON DELETE SET NULL`
- `space_members`: `(space_id, user_id)` 복합 PK
- spaces는 직접 hard delete하지 않고 `deleted_at`, `deleted_by`로 soft delete한다.
- space 생성과 최초 owner membership은 `create_space()`에서 한 transaction으로 처리한다.
- owner는 space마다 정확히 1명이어야 한다.
- owner 양도는 RPC만 허용한다.
- `private.is_space_member()`는 accepted·비탈퇴 profile, 활성 space, `banned_at IS NULL` membership만 true로 처리한다.
- accepted 사용자는 community를 생성할 수 있고 group 생성·삭제는 app admin만 수행한다.
- active group 이름은 `lower(btrim(name))` 기준 전역 unique다. community 이름 중복은 허용한다.
- space name은 trim 후 1 ~ 20자, description은 최대 5,000자다.
- `member_count`는 banned 상태를 포함한 현재 `space_members` 행 수다. role/notification/ban UPDATE는 count를 변경하지 않는다.

---

## 06. tables_content

파일 생성:

```bash
supabase migration new tables_content
```

데이터 모델 계약에 따라 생성:

- `posts`
- `post_attachments`
- `comments`

필수 처리:

- 모든 post는 `space_id`, `space_type`을 반드시 가진다.
- `posts.space_type`은 parent space type과 동기화한다.
- author/parent/attachment FK는 `ON DELETE RESTRICT`를 사용한다.
- `pinned_by`, `deleted_by`는 `ON DELETE SET NULL`을 사용한다.
- posts/comments의 `search_vector`는 generated stored column으로 생성한다.
- `posts.search_vector = to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(content, ''))`
- `comments.search_vector = to_tsvector('simple', coalesce(content, ''))`
- comments는 1레벨 답글만 허용한다.
- post/comment는 직접 hard delete하지 않는다.
- 삭제 댓글은 답글이 있으면 고정 placeholder로 노출하고, 답글이 없으면 숨긴다.
- 익명 표시명은 `anonymous_username`, NULL이면 `익명 {author_id 앞 2자리}`를 사용한다.
- `anonymous_username` 변경은 기존 익명 post/comment 표시에도 즉시 소급 적용된다.
- post feed는 `(created_at DESC, id DESC)` keyset cursor를 사용한다.
- 페이지 사이 soft delete는 다음 페이지에서 제외하며 완전한 snapshot 일관성은 제공하지 않는다.
- posts 직접 INSERT 입력은 `space_id`, `title`, `content`, `is_anonymous`만 허용한다. `author_id`와 `space_type`은 서버에서 결정한다.
- posts 직접 UPDATE는 작성자의 활성 post에 대해 `title`, `content`, `is_anonymous`만 허용한다.
- comments 직접 INSERT 입력은 `post_id`, `parent_id`, `content`, `is_anonymous`만 허용하고 `author_id`는 서버에서 결정한다.
- comments 직접 UPDATE는 작성자의 활성 comment `content`만 허용한다.
- post title은 trim 후 1 ~ 40자, post content는 trim 후 1 ~ 50,000자, comment content는 trim 후 1 ~ 1,000자다.
- comment placeholder 문자열은 `삭제된 댓글입니다.`로 고정하고 `soft_delete_comment()`만 기록할 수 있다.

---

## 07. tables_reactions

파일 생성:

```bash
supabase migration new tables_reactions
```

데이터 모델 계약에 따라 생성:

- `reaction_types`
- `post_reactions`
- `comment_reactions`

초기 `reaction_types`를 시드한다:

| key  | label  | sort_order |
| ---- | ------ | ---------- |
| like | 좋아요 | 0          |
| love | 하트   | 1          |

필수 처리:

- reaction parent FK는 `ON DELETE RESTRICT`
- reaction 변경은 `reaction_type_id` UPDATE
- reaction 취소는 본인 행 DELETE
- `posts.reaction_count`만 캐시한다.
- comment/message reaction count는 캐시하지 않는다.
- 사용자는 parent당 reaction 하나만 가질 수 있다.
- reaction INSERT의 `user_id`는 현재 profile로 강제한다.
- reaction UPDATE는 `reaction_type_id`만 허용하고 parent FK 및 `user_id` 변경을 금지한다.

---

## 08. tables_chat

파일 생성:

```bash
supabase migration new tables_chat
```

데이터 모델 계약에 따라 생성:

- `chat_rooms`
- `direct_chat_pairs`
- `chat_room_members`
- `messages`
- `message_attachments`
- `message_reactions`
- `message_reads`
- `chat_room_read_states`

필수 처리:

- direct pair는 `user1_id < user2_id`를 강제한다.
- direct pair는 동일 사용자 조합당 하나만 허용한다.
- `direct_chat_pairs.room_id`는 `is_group = false`인 room만 참조한다.
- direct room은 멤버가 정확히 두 명이고 pair 사용자와 일치해야 한다.
- direct room 생성은 `create_direct_chat()`만 사용한다.
- `create_direct_chat()`은 정규화 pair를 키로 transaction advisory lock을 획득한 뒤 기존 pair 재조회 또는 신규 생성하여 동시 요청에도 orphan room 없이 하나의 room만 반환한다.
- group room membership 변경은 RPC만 사용한다.
- direct room name은 NULL, group room name은 trim 후 1 ~ 30자다.
- message parent는 동일 room의 활성 최상위 message만 허용한다.
- `messages.search_vector = to_tsvector('simple', coalesce(content, ''))`
- message 수정은 작성 후 15분까지만 허용한다.
- message soft delete는 시간 제한 없이 sender 본인에게 허용한다.
- 삭제 message 본문은 숨기고 기존 답글은 유지한다.
- message/read/read_state 접근은 현재 room membership을 요구한다.
- read state는 동일 room 안에서 앞으로만 이동한다.
- group room의 일반 멤버는 accepted 사용자를 초대하고 본인만 나갈 수 있다. 타인 제거는 room creator 또는 app admin만 허용한다.
- group room creator가 비활성화되면 타인 강제 제거는 app admin만 수행한다.
- messages 직접 INSERT 입력은 `room_id`, `parent_id`, `content`만 허용하고 `sender_id`는 현재 profile로 강제한다.
- messages 직접 UPDATE는 sender의 활성 message `content`만 허용한다. `room_id`, `parent_id`, `sender_id`, edit/deletion 감사 필드는 변경할 수 없다.
- message content는 trim 후 1 ~ 10,000자다.
- message reaction은 현재 room 멤버가 활성 message에만 수행하며 `user_id`는 현재 profile로 강제한다.
- `message_reads`는 현재 room 멤버가 자신의 활성 message read 행만 INSERT한다. UPDATE/DELETE는 허용하지 않는다.
- `chat_room_read_states`는 현재 room 멤버가 자신의 행만 INSERT/UPDATE한다. client는 `last_read_message_id`만 변경하고 trigger가 `last_read_at = now()`를 기록한다.
- group member 제거 transaction에서 해당 사용자의 `chat_room_read_states`와 그 room에 속한 모든 `message_reads`를 정리한다.

---

## 09. tables_notifications

파일 생성:

```bash
supabase migration new tables_notifications
```

데이터 모델 계약에 따라 `notifications`를 생성한다.

필수 처리:

- actor 및 target FK는 `ON DELETE SET NULL`
- 직접 INSERT 금지
- trusted RPC 또는 service role만 생성
- recipient는 자신의 notification만 조회
- recipient가 직접 변경 가능한 컬럼은 `read_at`만 허용
- 읽은 notification은 생성 후 30일 뒤 cleanup
- notification title은 최대 100자, body는 최대 1,000자이며 둘 중 하나 이상은 trim 후 non-empty여야 한다.
- `space_type`은 notification INSERT 시 parent space type에서 서버가 설정한다.

---

## 10. tables_utilities

파일 생성:

```bash
supabase migration new tables_utilities
```

데이터 모델 계약에 따라 생성:

- `gongangs`
- `song_requests`

필수 처리:

- gongangs에 generated stored `time_range int4range`, `validity_range daterange` 생성
- gongangs는 location/day/time/validity가 모두 겹치는 예약을 exclusion constraint로 차단
- gongangs owner는 현재 profile로 강제
- gongangs mutation은 `gongang` permission 보유자 본인 행만 허용
- song_requests는 처리 상태 없는 append-only 로그
- song request URL은 HTTPS, 최대 2,048자
- `time_range = int4range(start_minute, end_minute, '[)')`
- `validity_range = daterange(valid_from, valid_until, '[]')`
- gongang CHECK: `day_of_week BETWEEN 0 AND 6`, `start_minute BETWEEN 0 AND 1439`, `end_minute BETWEEN 1 AND 1440`, `start_minute < end_minute`, `valid_from <= valid_until`
- song_requests는 `karaoke` permission 보유자만 사용한다. INSERT의 `requester_id`는 현재 profile로 강제하며 client UPDATE/DELETE를 금지한다.

---

## 11. tables_clubs

파일 생성:

```bash
supabase migration new tables_clubs
```

데이터 모델 계약에 따라 생성:

- `clubs`
- `club_apply_rounds`
- `clubs_apply`

필수 처리:

- `club_apply_rounds.starts_at`, `ends_at`: NOT NULL
- generated stored `apply_range tstzrange` 생성
- 기간이 겹치는 application round를 exclusion constraint로 차단
- `clubs_apply`: `(round_id, user_id, club_id)` unique
- 신청은 accepted 사용자가 열린 round에 자신의 `user_id`로만 생성
- 신청 취소는 round 종료 전 본인 행 DELETE만 허용
- `apply_range = tstzrange(starts_at, ends_at, '[)')`
- clubs, apply round 생성·변경·삭제는 app admin RPC 전용이다.

---

## 12. indexes

파일 생성:

```bash
supabase migration new indexes
```

구현:

- 아래 이름·키·predicate대로 인덱스를 생성한다. PK 또는 UQ가 동일한 키의 인덱스를 이미 만들었다면 중복 생성하지 않는다.
- identity:
  - `idx_profiles_status_deleted_at`: profiles `(status, deleted_at)`
- 검색:
  - `idx_posts_search_vector`: posts `USING gin(search_vector)`
  - `idx_comments_search_vector`: comments `USING gin(search_vector)`
  - `idx_messages_search_vector`: messages `USING gin(search_vector)`
  - `idx_posts_title_trgm`: posts `USING gin(title gin_trgm_ops) WHERE deleted_at IS NULL`
  - `idx_posts_content_trgm`: posts `USING gin(content gin_trgm_ops) WHERE deleted_at IS NULL`
  - `idx_comments_content_trgm`: comments `USING gin(content gin_trgm_ops) WHERE deleted_at IS NULL`
  - `idx_messages_content_trgm`: messages `USING gin(content gin_trgm_ops) WHERE deleted_at IS NULL`
- spaces/membership:
  - `idx_spaces_active_directory`: spaces `(join_policy, member_count) WHERE deleted_at IS NULL`
  - `idx_space_members_user_joined_at`: space_members `(user_id, joined_at)`
  - `idx_space_members_space_role`: space_members `(space_id, role)`
  - `idx_space_members_active_user_space`: space_members `(user_id, space_id) WHERE banned_at IS NULL`
  - `idx_space_members_active_space_user_role`: space_members `(space_id, user_id, role) WHERE banned_at IS NULL`
- content:
  - `idx_posts_space_created_at`: posts `(space_id, space_type, created_at)`
  - `idx_posts_space_pinned_created_at`: posts `(space_id, is_pinned, pinned_at, created_at)`
  - `idx_posts_space_type_created_at`: posts `(space_type, created_at)`
  - `idx_posts_author_created_at`: posts `(author_id, created_at)`
  - `idx_posts_deleted_created_at`: posts `(deleted_at, created_at)`
  - `idx_posts_active_space_created_at`: posts `(space_id, created_at DESC, id DESC) WHERE deleted_at IS NULL`
  - `idx_posts_pinned`: posts `(space_id, pinned_at DESC) WHERE is_pinned = true AND deleted_at IS NULL`
  - `idx_comments_tree`: comments `(post_id, parent_id, created_at)`
  - `idx_comments_author_created_at`: comments `(author_id, created_at)`
  - `idx_comments_deleted_created_at`: comments `(deleted_at, created_at)`
  - `idx_comments_active_post_created_at`: comments `(post_id, created_at) WHERE deleted_at IS NULL`
  - `idx_comments_active_parent`: comments `(parent_id) WHERE deleted_at IS NULL`
- reactions:
  - `idx_post_reactions_type_count`: post_reactions `(post_id, reaction_type_id)`
  - `idx_post_reactions_user_created_at`: post_reactions `(user_id, created_at)`
  - `idx_comment_reactions_type_count`: comment_reactions `(comment_id, reaction_type_id)`
  - `idx_comment_reactions_user_created_at`: comment_reactions `(user_id, created_at)`
  - `idx_message_reactions_type_count`: message_reactions `(message_id, reaction_type_id)`
  - `idx_message_reactions_user_created_at`: message_reactions `(user_id, created_at)`
- chat:
  - `idx_direct_chat_pairs_user1_created_at`: direct_chat_pairs `(user1_id, created_at)`
  - `idx_direct_chat_pairs_user2_created_at`: direct_chat_pairs `(user2_id, created_at)`
  - `idx_chat_room_members_user_joined_at`: chat_room_members `(user_id, joined_at)`
  - `idx_chat_room_members_user_room`: chat_room_members `(user_id, room_id)`
  - `idx_messages_room_created_at`: messages `(room_id, created_at)`
  - `idx_messages_sender_created_at`: messages `(sender_id, created_at)`
  - `idx_messages_parent_created_at`: messages `(parent_id, created_at)`
  - `idx_messages_active_room_created_at`: messages `(room_id, created_at) WHERE deleted_at IS NULL`
  - `idx_message_reads_user_read_at`: message_reads `(user_id, read_at)`
  - `idx_chat_room_read_states_user_last_read_at`: chat_room_read_states `(user_id, last_read_at)`
- notifications/utilities/clubs/queue:
  - `idx_notifications_recipient_created_at`: notifications `(recipient_id, created_at)`
  - `idx_notifications_recipient_read_created_at`: notifications `(recipient_id, read_at, created_at)`
  - `idx_notifications_unread_recipient_created_at`: notifications `(recipient_id, created_at DESC) WHERE read_at IS NULL`
  - `idx_notifications_space_created_at`: notifications `(space_id, space_type, created_at)`
  - `idx_gongangs_owner`: gongangs `(owner_id)`
  - `idx_gongangs_location_time`: gongangs `(location, day_of_week, start_minute)`
  - `idx_song_requests_requester_requested_at`: song_requests `(requester_id, requested_at)`
  - `idx_song_requests_requested_at`: song_requests `(requested_at)`
  - `idx_club_apply_rounds_period`: club_apply_rounds `(starts_at, ends_at)`
  - `idx_clubs_apply_round_club_created_at`: clubs_apply `(round_id, club_id, created_at)`
  - `idx_clubs_apply_round_user_created_at`: clubs_apply `(round_id, user_id, created_at)`
  - `idx_attachment_cleanup_queue_pending`: private.attachment_cleanup_queue `(processed_at, available_at)`
- FK 보조 인덱스:
  - `profiles(status_updated_by)`
  - `user_permissions(permission_key)`, `user_permissions(granted_by)`
  - `spaces(created_by)`, `spaces(deleted_by)`
  - `space_members(banned_by)`
  - `posts(pinned_by)`, `posts(deleted_by)`
  - `comments(parent_id)`, `comments(deleted_by)`
  - post/comment/message reactions의 `reaction_type_id`
  - `chat_rooms(created_by)`
  - `messages(deleted_by)`
  - `chat_room_read_states(last_read_message_id)`
  - notifications의 `actor_id`, `post_id`, `comment_id`, `message_id`
  - `club_apply_rounds(created_by)`, `clubs_apply(user_id)`, `clubs_apply(club_id)`
- migration 적용 후 모든 FK 참조 컬럼에 단일 또는 선두 복합 인덱스가 존재하는지 진단하고 누락이 있으면 이 migration에 추가한다.

---

## 13. constraints

파일 생성:

```bash
supabase migration new constraints
```

구현:

- 아래에 명시한 모든 CHECK, unique, partial unique, exclusion constraint
- UQ:
  - profiles: `auth_user_id`, `pub_id`, `student_number`
  - spaces/posts: `pub_id`
  - reaction_types: `key`
  - post_reactions `(post_id, user_id)`, comment_reactions `(comment_id, user_id)`, message_reactions `(message_id, user_id)`
  - direct_chat_pairs `(user1_id, user2_id)`
  - post_attachments `(post_id, sort_order)`, `(storage_bucket, storage_path)`
  - message_attachments `(message_id, sort_order)`, `(storage_bucket, storage_path)`
  - clubs `name`
  - clubs_apply `(round_id, user_id, club_id)`
  - private.attachment_cleanup_queue `(storage_bucket, storage_path)`
- 활성 group 이름:
  - `lower(btrim(name))`
  - `WHERE type = 'group' AND deleted_at IS NULL`
- anonymous username:
  - unique index on `lower(btrim(anonymous_username))`
  - `WHERE anonymous_username IS NOT NULL`
- space owner partial unique: `UNIQUE(space_id) WHERE role = 'owner'`; owner 부재는 deferred constraint trigger로 차단한다.
- profiles CHECK:
  - `cohort IS NULL OR cohort BETWEEN 1 AND 100`
  - `class_no IS NULL OR class_no > 0`
  - `student_number IS NULL OR student_number  ~  '^\d{6}$'`
  - `phone_number IS NULL OR phone_number  ~  '^\+?[0-9]{8,15}$'`
  - `dorm_room IS NULL OR dorm_room > 0`
  - `deleted_at IS NOT NULL OR status = 'none' OR type <> 'student' OR (student_number IS NOT NULL AND cohort IS NOT NULL)`
- posts CHECK: `comment_count >= 0`, `reaction_count >= 0`
- attachment CHECK: `size_bytes IS NULL OR size_bytes >= 0`, `sort_order >= 0`, `width IS NULL OR width > 0`, `height IS NULL OR height > 0`
- comments/messages CHECK: `parent_id IS NULL OR parent_id <> id`
- direct_chat_pairs CHECK: `user1_id < user2_id`
- gongangs CHECK: `day_of_week BETWEEN 0 AND 6`, `start_minute BETWEEN 0 AND 1439`, `end_minute BETWEEN 1 AND 1440`, `start_minute < end_minute`, `valid_from <= valid_until`
- club_apply_rounds CHECK: `starts_at < ends_at`
- private.attachment_cleanup_queue CHECK: `attempts >= 0`
- exclusion:
  - gongangs: 동일 `location`, `day_of_week`에서 `time_range &&` 및 `validity_range &&` 동시 충돌 금지
  - club_apply_rounds: `apply_range &&` 충돌 금지
- 사용자 입력 text의 trim/non-empty/최대 길이 검증
- 감사 actor FK가 SET NULL된 이후에도 soft-delete/ban/pin 상태가 유효하도록 CHECK를 구성한다.
- `profiles`, `spaces`, `posts`의 `pub_id`: `NOT NULL UNIQUE DEFAULT gen_random_uuid()`
- 상태 일관성:
  - spaces/posts/comments/messages는 활성 행이면 `deleted_by IS NULL`; 삭제 행은 `deleted_at`을 유지하고 `deleted_by`는 nullable
  - `space_members.banned_by IS NOT NULL`이면 `banned_at IS NOT NULL`; unban은 둘 다 NULL
  - posts가 unpinned이면 `pinned_at`, `pinned_by` 모두 NULL; pinned이면 `pinned_at IS NOT NULL`
  - messages는 `(is_edited = false AND edited_at IS NULL) OR (is_edited = true AND edited_at IS NOT NULL)`
- attachment CHECK: `size_bytes >= 0`, `sort_order >= 0`, nullable `width/height > 0`, 고정 bucket 이름
- text bounds:
  - profile name 1 ~ 50, anonymous_username nullable 1 ~ 50, profile description 최대 2,000
  - space/club description 최대 5,000
  - chat room/club/round name 1 ~ 100
  - `ban_reason`, attachment `alt` 최대 1,000
  - attachment `file_name`, `content_type` 최대 255
- Storage path는 해당 bucket의 고정 prefix 형식과 최대 길이를 검증한다.

FK 원칙:

- `ON DELETE SET NULL`을 적용할 FK:
  - `profiles.auth_user_id`, `profiles.status_updated_by`
  - `user_permissions.granted_by`
  - `spaces.created_by`, `spaces.deleted_by`, `space_members.banned_by`
  - `posts.pinned_by`, `posts.deleted_by`, `comments.deleted_by`
  - `chat_rooms.created_by`, `messages.deleted_by`
  - `notifications.actor_id`, `notifications.space_id`, `notifications.post_id`, `notifications.comment_id`, `notifications.message_id`
  - `club_apply_rounds.created_by`
  - `private.attachment_cleanup_queue.requested_by`
- 위 목록을 제외한 모든 FK는 `ON DELETE RESTRICT`다. `notifications.recipient_id`, 콘텐츠 author/sender, membership, parent, reaction, attachment, read state, application FK도 RESTRICT다.

---

## 14. triggers

파일 생성:

```bash
supabase migration new triggers
```

생성:

| trigger                                                                                                 | table/event                                                | 계약                                                                                                                     |
| ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Auth profile create/delete lifecycle                                                                    | `auth.users` INSERT/DELETE                                 | 신뢰된 profile 생성; 삭제 전 owner/app admin 검사 후 withdrawn 익명화                                                    |
| `trg_stamp_post_identity`                                                                               | posts BEFORE INSERT                                        | authenticated 요청이면 `auth.uid()`로 조회한 현재 profile ID를 `author_id`에 기록하고 parent space에서 `space_type` 설정 |
| `trg_stamp_comment_identity`                                                                            | comments BEFORE INSERT                                     | authenticated 요청이면 현재 profile ID를 `author_id`에 기록                                                              |
| `trg_stamp_post_reaction_identity`                                                                      | post_reactions BEFORE INSERT                               | authenticated 요청이면 현재 profile ID를 `user_id`에 기록                                                                |
| `trg_stamp_comment_reaction_identity`                                                                   | comment_reactions BEFORE INSERT                            | authenticated 요청이면 현재 profile ID를 `user_id`에 기록                                                                |
| `trg_stamp_message_identity`                                                                            | messages BEFORE INSERT                                     | authenticated 요청이면 현재 profile ID를 `sender_id`에 기록                                                              |
| `trg_stamp_message_reaction_identity`                                                                   | message_reactions BEFORE INSERT                            | authenticated 요청이면 현재 profile ID를 `user_id`에 기록                                                                |
| `trg_stamp_message_read_identity`                                                                       | message_reads BEFORE INSERT                                | authenticated 요청이면 현재 profile ID를 `user_id`에 기록                                                                |
| `trg_stamp_room_read_state_identity`                                                                    | chat_room_read_states BEFORE INSERT                        | authenticated 요청이면 현재 profile ID를 `user_id`에 기록                                                                |
| `trg_stamp_gongang_identity`                                                                            | gongangs BEFORE INSERT                                     | authenticated 요청이면 현재 profile ID를 `owner_id`에 기록                                                               |
| `trg_stamp_song_request_identity`                                                                       | song_requests BEFORE INSERT                                | authenticated 요청이면 현재 profile ID를 `requester_id`에 기록                                                           |
| `trg_stamp_club_apply_identity`                                                                         | clubs_apply BEFORE INSERT                                  | authenticated 요청이면 현재 profile ID를 `user_id`에 기록                                                                |
| `trg_sync_post_space_type`                                                                              | posts BEFORE INSERT/UPDATE OF space_id                     | parent `spaces.type`을 `space_type`에 기록                                                                               |
| `trg_sync_notification_space_type`                                                                      | notifications BEFORE INSERT                                | parent space type 기록                                                                                                   |
| `trg_propagate_space_type`                                                                              | spaces AFTER UPDATE OF type                                | 해당 posts/notifications에 type 전파                                                                                     |
| `trg_validate_comment_parent`                                                                           | comments BEFORE INSERT/UPDATE                              | 동일 post의 활성 최상위 comment만 parent 허용                                                                            |
| `trg_validate_message_parent`                                                                           | messages BEFORE INSERT/UPDATE                              | 동일 room의 활성 최상위 message만 parent 허용                                                                            |
| `trg_validate_direct_chat` deferred constraint triggers                                                 | direct_chat_pairs와 chat_room_members INSERT/UPDATE/DELETE | commit 시 pair와 정확히 두 membership 일치                                                                               |
| `trg_update_post_comment_count`                                                                         | comments AFTER INSERT/UPDATE/DELETE                        | OLD/NEW post_id와 deleted_at 변경을 반영해 활성 comment count 증감                                                       |
| `trg_update_post_reaction_count`                                                                        | post_reactions AFTER INSERT/UPDATE/DELETE                  | OLD/NEW post_id 변경만 반영; reaction type 변경은 count 유지                                                             |
| `trg_update_space_member_count`                                                                         | space_members AFTER INSERT/DELETE                          | member_count 원자적 증감                                                                                                 |
| `trg_validate_chat_read_state`                                                                          | chat_room_read_states BEFORE INSERT/UPDATE                 | 동일 room 활성 message 및 단조 증가 검증, last_read_at 서버 기록                                                         |
| `trg_profiles_updated_at`, `trg_posts_updated_at`, `trg_comments_updated_at`, `trg_spaces_updated_at`   | 각 테이블 BEFORE UPDATE                                    | `updated_at = now()`                                                                                                     |
| `trg_post_reactions_updated_at`, `trg_comment_reactions_updated_at`, `trg_message_reactions_updated_at` | 각 reaction 테이블 BEFORE UPDATE                           | `updated_at = now()`                                                                                                     |
| `trg_mark_message_edited`                                                                               | messages BEFORE UPDATE OF content                          | 일반 content 수정에만 `is_edited = true`, `edited_at = now()`                                                            |

`messages`에는 `updated_at`이 없으므로 `trg_messages_updated_at`을 만들지 않는다.

캐시 규칙:

- count 증감은 parent 행을 원자적으로 UPDATE한다.
- count trigger에서 매 이벤트마다 `count(*)` 전체 재계산을 하지 않는다.
- comment count는 INSERT, DELETE, post 변경, soft-delete 상태 변경을 처리한다.
- post reaction count는 INSERT, DELETE, post 변경을 처리한다.
- space member count는 membership INSERT/DELETE를 처리한다.
- comment/message reaction count trigger는 만들지 않는다.
- 매일 cache reconciliation은 `spaces.member_count = space_members 전체 행 수`, `posts.comment_count = deleted_at IS NULL인 comments 수`, `posts.reaction_count = post_reactions 수`로 재조정한다.

직접 INSERT identity 규칙:

- authenticated에는 identity 컬럼의 INSERT 권한을 부여하지 않는다.
- 위 stamp trigger는 `auth.uid()`가 존재하는 요청에서 client payload와 무관하게 현재 profile ID로 identity 컬럼을 덮어쓴다. 대응 profile이 없으면 INSERT를 거부한다.
- stamp trigger와 RLS `WITH CHECK`를 함께 적용해 다른 사용자 ID 가장과 NULL identity INSERT를 모두 차단한다.
- service role 또는 trusted RPC가 명시적인 identity를 보존해야 하는 내부 작업은 직접 client INSERT 경로와 분리한다.

---

## 15. rpc_functions

파일 생성:

```bash
supabase migration new rpc_functions
```

구현할 주요 RPC:

- `create_direct_chat`
- `create_space`
- `create_group_chat`
- `add_group_member`
- `remove_group_member`
- `update_space`
- `join_space`
- `add_space_member`
- `leave_space`
- `set_space_member_role`
- `set_space_member_ban`
- `set_post_pin`
- `submit_onboarding`
- `review_profile`
- `set_anonymous_username`
- `change_profile_status`
- `change_app_role`
- `transfer_space_owner`
- `soft_delete_space`
- `soft_delete_post`
- `soft_delete_comment`
- `soft_delete_message`
- `withdraw_profile`
- `finalize_post_attachment`
- `finalize_message_attachment`
- `finalize_avatar`
- `finalize_space_image`
- `search_posts`
- `search_messages`
- service-role 전용 DB-only purge/notification cleanup 함수
- `request_attachment_removal`은 queue 생성 이후인 section 17에서 생성한다.

공통 규칙:

- 모든 mutation은 호출자·활성 상태·소유권·membership·permission을 함수 내부에서 다시 검증한다.
- 모든 사용자 호출 RPC는 caller를 입력 ID로 받지 않고 `(SELECT auth.uid())`에서 현재 profile을 유도한다.
- 관계 변경과 count 변경은 하나의 transaction에서 처리한다.
- `create_direct_chat()`은 transaction advisory lock으로 unique 경합을 직렬화하고 기존 room을 반환한다.
- 검색 RPC는 `SECURITY INVOKER`를 사용한다.
- 검색 RPC는 삭제되었거나 접근할 수 없는 parent를 제외하고 익명 표시에 `private.display_author_name()`을 사용한다.
- RLS 우회가 필요한 mutation만 `SECURITY DEFINER SET search_path = ''`를 사용한다.
- 사용자 호출 SECURITY DEFINER RPC는 `auth.uid()`와 현재 profile 상태·권한을 검사한다. service-role 전용 RPC는 `auth.uid()`를 요구하지 않고 DB 호출 역할이 `service_role`인지 검사한다.
- section 15 함수는 section 16에서 생성할 private RLS helper에 의존하지 않고 필요한 검사를 함수 내부에서 수행한다.
- 생성 직후 함수 EXECUTE를 `PUBLIC`, `anon`, `authenticated`, `service_role`에서 회수하고 필요한 역할에만 재부여한다.

EXECUTE grant 계약:

- `authenticated`: 사용자·관리자 권한을 함수 내부에서 검사하는 아래 RPC에 EXECUTE를 부여한다.
  - `create_direct_chat`, `create_space`, `update_space`, `join_space`, `add_space_member`, `leave_space`, `set_space_member_role`, `set_space_member_ban`, `transfer_space_owner`
  - `create_group_chat`, `add_group_member`, `remove_group_member`, `set_post_pin`
  - `submit_onboarding`, `review_profile`, `set_anonymous_username`, `change_profile_status`, `change_app_role`, `withdraw_profile`
  - `soft_delete_space`, `soft_delete_post`, `soft_delete_comment`, `soft_delete_message`
  - `finalize_post_attachment`, `finalize_message_attachment`, `finalize_avatar`, `finalize_space_image`
  - `search_posts`, `search_messages`
  - `grant_user_permission`, `revoke_user_permission`, `upsert_permission`, `upsert_reaction_type`
  - `create_club`, `update_club`, `delete_club`, `create_club_apply_round`, `update_club_apply_round`, `delete_club_apply_round`
- `service_role`: `create_notification`, `purge_deleted_content`, `cleanup_notifications`, `bootstrap_first_app_admin`에만 EXECUTE를 부여한다.
- `anon`과 `PUBLIC`: 위 RPC 모두 EXECUTE를 부여하지 않는다.

필수 RPC 계약:

| 함수                                                                                                                                                                                                                                       | 반환                     | 필수 동작                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `create_direct_chat(p_other_user_id bigint)`                                                                                                                                                                                               | `bigint room_id`         | caller/상대 accepted 검사, pair 정규화, transaction advisory lock, 기존 pair 반환 또는 room/pair/members 2건 원자 생성 |
| `create_space(p_type space_type, p_name text, p_description text, p_join_policy space_join_policy)`                                                                                                                                        | `bigint space_id`        | community는 accepted 사용자, group은 app admin만 생성; caller owner membership과 원자 생성                             |
| `update_space(p_space_id bigint, p_name text, p_description text, p_join_policy space_join_policy, p_type space_type default null)`                                                                                                        | `void`                   | owner/admin은 name/description/join_policy, app admin만 type 변경                                                      |
| `join_space(p_space_id bigint)`                                                                                                                                                                                                            | `void`                   | accepted caller의 활성 `auto_join` space 자기 가입; invite_only/중복/차단 membership 거부                              |
| `add_space_member(p_space_id bigint, p_user_id bigint)`                                                                                                                                                                                    | `void`                   | owner/admin이 accepted 사용자를 member로 추가                                                                          |
| `leave_space(p_space_id bigint)`                                                                                                                                                                                                           | `void`                   | caller membership 제거; owner는 거부                                                                                   |
| `set_space_member_role(p_space_id bigint, p_user_id bigint, p_role member_role)`                                                                                                                                                           | `void`                   | owner만 non-owner를 admin/manager/member로 변경; owner 양도 금지                                                       |
| `set_space_member_ban(p_space_id bigint, p_user_id bigint, p_banned boolean, p_reason text default null)`                                                                                                                                  | `void`                   | owner/admin이 하위 역할만 ban/unban; 자기 자신, owner, 동급·상위 역할 금지                                             |
| `transfer_space_owner(p_space_id bigint, p_new_owner_id bigint)`                                                                                                                                                                           | `void`                   | 대상은 accepted·비차단 기존 멤버; 관련 행 잠금; 기존 owner→admin, 신규 owner→owner; commit 시 owner 정확히 1명         |
| `create_group_chat(p_name text)`                                                                                                                                                                                                           | `bigint room_id`         | accepted caller를 creator/최초 member로 원자 생성                                                                      |
| `add_group_member(p_room_id bigint, p_user_id bigint)`                                                                                                                                                                                     | `void`                   | 현재 group room 멤버가 accepted 비멤버 추가                                                                            |
| `remove_group_member(p_room_id bigint, p_user_id bigint)`                                                                                                                                                                                  | `void`                   | 본인 탈퇴 또는 creator/app admin 강제 제거; membership/read state 정리                                                 |
| `set_post_pin(p_post_id bigint, p_is_pinned boolean)`                                                                                                                                                                                      | `void`                   | 활성 space owner/admin/manager만 호출; pin 감사 필드 원자 설정/해제                                                    |
| `submit_onboarding(p_name text, p_type profile_type, p_student_number char(6), p_class_no int2, p_cohort int2, p_gender profile_gender, p_phone_number text, p_birthday date, p_description text, p_dorm_room int2)`                       | `void`                   | status none/rejected 본인만; 허용 payload 검증; 학생 필수값 검사;`onboarding_completed_at = now()`, status pending     |
| `review_profile(p_profile_id bigint, p_status profile_status)`                                                                                                                                                                             | `void`                   | app admin만 pending을 `accepted` 또는 `rejected`로 변경하고 status 감사 기록                                           |
| `set_anonymous_username(p_value text)`                                                                                                                                                                                                     | `void`                   | withdrawn 아닌 본인; NULL 허용; non-NULL trim/길이/정규화 unique 검사                                                  |
| `change_profile_status(p_profile_id bigint, p_status profile_status)`                                                                                                                                                                      | `void`                   | app admin 전용; owner/app admin을 inactive 상태로 바꾸기 전 이관 검사                                                  |
| `change_app_role(p_profile_id bigint, p_role app_role)`                                                                                                                                                                                    | `void`                   | app admin 전용; accepted app admin이 최소 1명 남도록 잠금·검사                                                         |
| `soft_delete_space/post/comment/message(p_id bigint)`                                                                                                                                                                                      | `void`                   | idempotent soft delete; 권한과 활성 parent 재검사; 대상/관련 membership 잠금                                           |
| `withdraw_profile()`                                                                                                                                                                                                                       | `void`                   | 본인 profile 잠금; owner/app admin이면 거부; 개인정보 익명화; withdrawn/deleted_at 기록                                |
| `finalize_post_attachment(p_post_id bigint, p_storage_path text, p_file_name text, p_content_type text, p_size_bytes int8, p_sort_order int4, p_alt text, p_width int4, p_height int4)`                                                    | `bigint attachment_id`   | bucket은 `post-files`로 고정; 활성 post 작성자만; object/path/MIME/크기 검사 후 행 생성                                |
| `finalize_message_attachment(p_message_id bigint, p_storage_path text, p_file_name text, p_content_type text, p_size_bytes int8, p_sort_order int4, p_width int4, p_height int4)`                                                          | `bigint attachment_id`   | bucket은 `message-files`로 고정; 활성 message 작성자이자 현재 room 멤버만; object 검증 후 행 생성                      |
| `finalize_avatar(p_storage_path text)`                                                                                                                                                                                                     | `void`                   | 본인 prefix의 실제 안전한 image만 profile에 연결                                                                       |
| `finalize_space_image(p_space_id bigint, p_storage_path text)`                                                                                                                                                                             | `void`                   | 활성 space owner/admin만 해당 prefix image 연결                                                                        |
| `create_notification(p_recipient_id bigint, p_title text, p_body text, p_actor_id bigint default null, p_space_id bigint default null, p_post_id bigint default null, p_comment_id bigint default null, p_message_id bigint default null)` | `bigint notification_id` | trusted mutation RPC 또는 service role만 호출; accepted recipient와 target 관계를 검증하고 space_id/space_type을 서버에서 유도 |
| `search_posts(p_query text, p_space_type space_type default null, p_space_id bigint default null)`                                                                                                                                         | table                    | trim 후 query 1 ~ 200자; 접근 가능한 활성 post/comment만 검색                                                          |
| `search_messages(p_query text, p_room_id bigint)`                                                                                                                                                                                          | table                    | trim 후 query 1 ~ 200자; 현재 room 멤버만 활성 message 검색                                                            |

soft delete 세부 계약:

- space: owner/admin만 호출, content 변경 없이 `deleted_at`, `deleted_by` 기록
- post: 작성자 또는 해당 space owner/admin만 호출, content 변경 없이 삭제 감사 기록
- comment: 작성자 또는 해당 space owner/admin만 호출, 고정 placeholder로 content 교체 후 삭제 감사 기록
- message: sender 본인만 호출, content 변경 없이 삭제 감사 기록
- space 삭제 직후 하위 post/comment/reaction/attachment 읽기·쓰기를 차단한다.
- post 삭제 직후 새 comment/reaction/attachment 쓰기를 차단한다.

관리용 RPC:

- permissions/user_permissions, reaction_types, clubs, club_apply_rounds의 생성·변경은 app admin 전용 RPC로 구현한다.
- `grant_user_permission(p_user_id bigint, p_permission_key text)`와 `revoke_user_permission(p_user_id bigint, p_permission_key text)`을 제공하고 `granted_by`를 caller로 기록한다.
- `upsert_permission(p_key text, p_name text, p_description text)`을 제공하고 registry 삭제는 하지 않는다.
- `upsert_reaction_type(p_id bigint, p_key text, p_name text, p_icon text, p_sort_order int4)`을 제공하고 registry 삭제는 하지 않는다.
- club RPC는 `create_club(p_name text, p_description text, p_type club_type) → bigint`, `update_club(p_club_id bigint, p_name text, p_description text, p_type club_type) → void`, `delete_club(p_club_id bigint) → void`로 고정한다.
- round RPC는 `create_club_apply_round(p_name text, p_starts_at timestamptz, p_ends_at timestamptz) → bigint`, `update_club_apply_round(p_round_id bigint, p_name text, p_starts_at timestamptz, p_ends_at timestamptz) → void`, `delete_club_apply_round(p_round_id bigint) → void`로 고정한다.
- club/round RPC는 app admin 전용이며 FK RESTRICT 대상이 남아 있으면 삭제를 거부한다.
- reaction type registry 행은 삭제하지 않는다.
- 최초 app admin bootstrap은 `bootstrap_first_app_admin(p_profile_id bigint)` service-role 전용 RPC로 수행한다. app admin이 이미 존재하면 거부한다.

검색 반환 계약:

- `search_posts`: `post_id`, `title`, `content_snippet`, `author_name`, `space_name`, `created_at`, `match_type`
- `search_posts`는 title/content 및 접근 가능한 활성 comments content를 `ILIKE '%query%'`로 검색한다.
- `search_messages`는 지정 room의 활성 message content를 검색한다.
- `search_messages` 반환 컬럼은 `message_id`, `content_snippet`, `sender_name`, `created_at`으로 고정한다.

service-role 작업:

- `purge_deleted_content(p_entity_type text, p_entity_id bigint) → void`: entity type은 `space`, `post`, `comment`, `message`만 허용; worker가 Storage object와 attachment 행을 먼저 정리한 soft-deleted 대상만 잠금 → 남은 RESTRICT 자식 제거 → parent hard delete
- `cleanup_notifications() → bigint`: 읽었고 생성 후 30일 지난 notification을 삭제하고 삭제 수 반환
- DB-only cleanup은 멱등으로 구현한다. Storage cleanup은 section 17 worker가 실패를 기록하고 재시도한다.

---

## 16. rls_and_grants

파일 생성:

```bash
supabase migration new rls_and_grants
```

공통 구현:

- 모든 public 테이블에 RLS 활성화
- 모든 정책에 대상 역할을 명시
- UPDATE 정책에 SELECT policy, `USING`, `WITH CHECK` 구성
- ownership ID는 현재 profile ID로 강제
- private helper를 사용해 membership table 재귀를 방지
- withdrawn, non-accepted, deleted parent, banned membership 접근 차단
- `anon`에는 도메인 테이블 권한을 부여하지 않는다.

private helper:

| 함수                                                                                                                       | 반환      |
| -------------------------------------------------------------------------------------------------------------------------- | --------- |
| `private.current_profile_id()`                                                                                             | `bigint`  |
| `private.is_accepted_user()`                                                                                               | `boolean` |
| `private.is_app_admin()`                                                                                                   | `boolean` |
| `private.is_space_member(p_space_id bigint, p_allowed_roles member_role[] default null)`                                   | `boolean` |
| `private.is_room_member(p_room_id bigint)`                                                                                 | `boolean` |
| `private.can_manage_space(p_space_id bigint, p_allowed_roles member_role[] default ARRAY['owner','admin']::member_role[])` | `boolean` |
| `private.can_access_post(p_post_id bigint)`                                                                                | `boolean` |
| `private.can_access_comment(p_comment_id bigint)`                                                                          | `boolean` |
| `private.can_access_message(p_message_id bigint)`                                                                          | `boolean` |
| `private.has_active_direct_reply(p_comment_id bigint)`                                                                     | `boolean` |
| `private.has_permission(p_permission_key text)`                                                                            | `boolean` |
| `private.is_club_round_open(p_round_id bigint)`                                                                            | `boolean` |
| `private.display_author_name(p_author_id bigint, p_is_anonymous boolean)`                                                  | `text`    |

helper 계약:

- `private.current_profile_id()`는 상태와 무관하게 현재 auth user의 profile id를 반환하며 profile이 없으면 NULL을 반환한다. 이 helper만 accepted 상태를 요구하지 않는다.
- 권한 판정 helper는 현재 profile의 `status = 'accepted' AND deleted_at IS NULL`을 기본 조건으로 요구한다.
- `private.is_space_member(p_space_id, p_allowed_roles default null)`는 활성 space, 비차단 membership, optional role 조건을 검사한다.
- `private.is_room_member(p_room_id)`는 현재 membership 존재를 매 호출 시 검사한다.
- `private.can_access_post/comment/message()`는 활성 parent와 현재 membership을 함께 검사한다.
- `private.has_active_direct_reply(p_comment_id)`는 삭제 comment placeholder 노출 판단만 수행하고 comments RLS를 재귀 호출하지 않는다.
- `private.display_author_name(author_id, is_anonymous)`은 실명 또는 anonymous_username, NULL이면 `익명 {author_id}`를 반환한다.
- helper는 private schema에 두고 임의 Data API 호출을 허용하지 않는다. `authenticated`에 private schema USAGE와 위 helper EXECUTE만 부여하고, `anon`과 `PUBLIC`에는 부여하지 않는다.

직접 Data API 허용 범위:

| 테이블                                           | authenticated 직접 허용                               |
| ------------------------------------------------ | ----------------------------------------------------- |
| profiles                                         | SELECT, 허용 컬럼 UPDATE                              |
| permissions                                      | SELECT                                                |
| user_permissions                                 | SELECT                                                |
| spaces                                           | 공개 메타데이터 컬럼 SELECT                           |
| space_members                                    | SELECT, 자기 `notification_setting` UPDATE            |
| posts                                            | SELECT, INSERT, 허용 컬럼 UPDATE                      |
| post_attachments                                 | SELECT                                                |
| comments                                         | SELECT, INSERT,`content` UPDATE                       |
| reaction_types                                   | SELECT                                                |
| post_reactions, comment_reactions                | SELECT, INSERT,`reaction_type_id` UPDATE, 본인 DELETE |
| chat_rooms, direct_chat_pairs, chat_room_members | SELECT                                                |
| messages                                         | SELECT, INSERT,`content` UPDATE                       |
| message_attachments                              | SELECT                                                |
| message_reactions                                | SELECT, INSERT,`reaction_type_id` UPDATE, 본인 DELETE |
| message_reads                                    | SELECT, INSERT                                        |
| chat_room_read_states                            | SELECT, INSERT,`last_read_message_id` UPDATE          |
| notifications                                    | SELECT,`read_at` UPDATE                               |
| gongangs                                         | permission 보유 본인 행 CRUD                          |
| song_requests                                    | SELECT, INSERT                                        |
| clubs, club_apply_rounds                         | SELECT                                                |
| clubs_apply                                      | SELECT, INSERT, 본인 DELETE                           |

column-level allowlist:

- 아래 INSERT/UPDATE allowlist는 column-level GRANT로 구현한다. 해당 테이블에 table-level INSERT/UPDATE를 추가로 부여하지 않는다.
- spaces 직접 SELECT: `pub_id`, `type`, `name`, `description`, `image_url`, `join_policy`, `member_count`
- posts 직접 INSERT: `space_id`, `title`, `content`, `is_anonymous`
- comments 직접 INSERT: `post_id`, `parent_id`, `content`, `is_anonymous`
- post_reactions 직접 INSERT: `post_id`, `reaction_type_id`
- comment_reactions 직접 INSERT: `comment_id`, `reaction_type_id`
- messages 직접 INSERT: `room_id`, `parent_id`, `content`
- message_reactions 직접 INSERT: `message_id`, `reaction_type_id`
- message_reads 직접 INSERT: `message_id`
- chat_room_read_states 직접 INSERT: `room_id`, `last_read_message_id`
- gongangs 직접 INSERT: `location`, `day_of_week`, `start_minute`, `end_minute`, `valid_from`, `valid_until`
- song_requests 직접 INSERT: `url`
- clubs_apply 직접 INSERT: `round_id`, `club_id`
- profiles 직접 UPDATE: `name`, `gender`, `phone_number`, `birthday`, `description`
- `anonymous_username`: `set_anonymous_username()`만 변경
- identity/onboarding 필드: `submit_onboarding()` 또는 admin 검증 RPC만 변경
- `avatar_url`: `finalize_avatar()`만 변경
- posts 직접 UPDATE: `title`, `content`, `is_anonymous`
- comments/messages 직접 UPDATE: `content`
- reactions 직접 UPDATE: `reaction_type_id`
- space_members 직접 UPDATE: 자기 행의 `notification_setting`
- chat_room_read_states 직접 UPDATE: `last_read_message_id`
- notifications 직접 UPDATE: `read_at`
- gongangs 직접 UPDATE: 자기 행의 `location`, `day_of_week`, `start_minute`, `end_minute`, `valid_from`, `valid_until`
- 식별자, owner/author/sender/user ID, 역할, 상태, 감사, soft-delete, cache 컬럼은 직접 변경하지 않는다.

RLS 행 계약:

| 테이블                          | SELECT                                                                                             | INSERT/UPDATE/DELETE                                                                   |
| ------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| profiles                        | 본인은 상태와 무관하게 조회; accepted 사용자는 accepted profile 조회                               | accepted 본인의 허용 컬럼 UPDATE만; INSERT/DELETE 없음                                 |
| permissions                     | accepted 사용자                                                                                    | client mutation 없음                                                                   |
| user_permissions                | 본인 행                                                                                            | client mutation 없음                                                                   |
| spaces                          | accepted 사용자가 활성 space 공개 컬럼 조회                                                        | client mutation 없음                                                                   |
| space_members                   | 현재 활성·비차단 해당 space 멤버                                                                   | 자기 notification_setting UPDATE만                                                     |
| posts                           | accepted·비차단 해당 space 멤버가 활성 post 조회                                                   | 같은 멤버가 자기 author_id로 INSERT; 작성자가 활성 post 허용 컬럼 UPDATE; DELETE 없음  |
| post_attachments                | `private.can_access_post(post_id)`                                                                 | client mutation 없음                                                                   |
| comments                        | `private.can_access_post(post_id)`이며 활성 comment 또는 활성 direct reply가 있는 삭제 placeholder | 같은 멤버가 자기 author_id로 INSERT; 작성자가 활성 comment content UPDATE; DELETE 없음 |
| reaction_types                  | accepted 사용자                                                                                    | client mutation 없음                                                                   |
| post/comment reactions          | 대응 활성 parent 접근 가능                                                                         | 현재 profile user_id로 INSERT; 본인 reaction_type_id UPDATE/DELETE                     |
| chat_rooms/direct pairs/members | 현재 room 멤버                                                                                     | client mutation 없음                                                                   |
| messages                        | accepted 현재 room 멤버가 활성 message 조회                                                        | 현재 profile sender_id로 INSERT; sender가 생성 후 15분 내 content UPDATE; DELETE 없음  |
| message_attachments             | `private.can_access_message(message_id)`                                                           | client mutation 없음                                                                   |
| message_reactions               | 현재 room 멤버가 활성 message reaction 조회                                                        | 현재 profile user_id로 INSERT; 본인 reaction_type_id UPDATE/DELETE                     |
| message_reads                   | 현재 room 멤버                                                                                     | 자신의 활성 message read INSERT만                                                      |
| chat_room_read_states           | 현재 room 멤버가 자신의 행 조회                                                                    | 자신의 행 INSERT 및 last_read_message_id UPDATE                                        |
| notifications                   | recipient 본인                                                                                     | read_at UPDATE만; INSERT/DELETE 없음                                                   |
| gongangs                        | `gongang` permission 보유 accepted 사용자                                                          | 본인 owner_id로 CRUD                                                                   |
| song_requests                   | permission 보유 accepted 사용자                                                                    | 본인 requester_id로 INSERT만                                                           |
| clubs/rounds                    | accepted 사용자                                                                                    | client mutation 없음                                                                   |
| clubs_apply                     | accepted 사용자가 조회                                                                             | 열린 round에 본인 INSERT; round 종료 전 본인 DELETE                                    |

RLS 구현 주의:

- `space_members` 및 삭제 comment reply 존재 검사는 재귀를 피하는 private SECURITY DEFINER helper를 사용한다.
- parent가 soft-delete되거나 membership이 제거·차단되면 다음 요청부터 하위 데이터 접근을 거부한다.
- posts `is_anonymous` false↔true UPDATE를 모두 허용하되 다른 immutable 컬럼이 유지되는지 `WITH CHECK`한다.
- direct REST/SDK 호출로 다른 사용자의 owner ID를 공급해도 항상 거부한다.
- posts INSERT/UPDATE `WITH CHECK`: `author_id = private.current_profile_id()`, 활성 space, accepted·비차단 membership.
- messages INSERT/UPDATE `WITH CHECK`: `sender_id = private.current_profile_id()`, accepted 현재 room membership.
- comments placeholder SELECT predicate: `private.can_access_post(post_id) AND (deleted_at IS NULL OR EXISTS(active direct reply))`; reply 검사는 재귀 방지 helper를 사용한다.
- 익명 post/comment의 원본 `author_id`는 DB에서 마스킹하지 않는다.

space directory:

- accepted 사용자는 가입 여부와 무관하게 활성 space의 `pub_id`, `type`, `name`, `description`, `image_url`, `join_policy`, `member_count`를 조회할 수 있다.
- membership 목록과 하위 콘텐츠는 현재 멤버만 조회한다.

service role:

- schema `public`, `private`에 USAGE
- 아래 public domain table에 `SELECT, INSERT, UPDATE, DELETE`:
  - profiles, permissions, user_permissions, spaces, space_members
  - posts, post_attachments, comments, reaction_types, post_reactions, comment_reactions
  - chat_rooms, direct_chat_pairs, chat_room_members, messages, message_attachments, message_reactions, message_reads, chat_room_read_states
  - notifications, gongangs, song_requests, clubs, club_apply_rounds, clubs_apply
- 아래 sequence에 `USAGE, SELECT`:
  - `profiles_id_seq`, `spaces_id_seq`, `posts_id_seq`, `post_attachments_id_seq`, `comments_id_seq`
  - `reaction_types_id_seq`, `post_reactions_id_seq`, `comment_reactions_id_seq`
  - `chat_rooms_id_seq`, `messages_id_seq`, `message_attachments_id_seq`, `message_reactions_id_seq`
  - `notifications_id_seq`, `gongangs_id_seq`, `song_requests_id_seq`
  - `clubs_id_seq`, `club_apply_rounds_id_seq`, `clubs_apply_id_seq`
- `create_notification`, `purge_deleted_content`, `cleanup_notifications`, `bootstrap_first_app_admin`에만 EXECUTE
- private 객체와 service 전용 함수는 `anon`, `authenticated`에 부여하지 않는다.
- 이후 migration이 만드는 새 객체는 해당 migration에서 service-role GRANT를 추가한다.
- authenticated에는 직접 INSERT를 허용한 다음 sequence에만 `USAGE, SELECT`를 부여한다: `posts_id_seq`, `comments_id_seq`, `post_reactions_id_seq`, `comment_reactions_id_seq`, `messages_id_seq`, `message_reactions_id_seq`, `gongangs_id_seq`, `song_requests_id_seq`, `clubs_apply_id_seq`.
- RPC 전용 INSERT 테이블의 sequence는 authenticated에 부여하지 않는다.

---

## 17. storage_buckets

파일 생성:

```bash
supabase migration new storage_buckets
```

private bucket:

| bucket          | 최대 크기 |
| --------------- | --------- |
| `avatars`       | 5 MiB     |
| `space-images`  | 10 MiB    |
| `post-files`    | 25 MiB    |
| `message-files` | 25 MiB    |

경로:

- avatars: `{auth_uid}/{random_object_id}`
- space-images: `{space_pub_id}/{random_object_id}`
- post-files: `{post_pub_id}/{uploader_auth_uid}/{random_object_id}`
- message-files: `{room_id}/{message_id}/{uploader_auth_uid}/{random_object_id}`

구현:

- 모든 bucket은 private으로 생성한다.
- authenticated의 `storage.objects` 직접 INSERT/UPDATE/DELETE를 허용하지 않는다.
- trusted server가 검증 후 짧은 수명의 signed upload URL을 발급한다.
- finalize RPC가 object 존재, parent 권한, 경로, 크기, MIME, 허용 형식을 검증한다.
- SVG/HTML 및 실행 가능한 위험 형식을 거부한다.
- SELECT는 parent post/message/space/avatar 접근 권한을 상속한다.
- attachment 제거는 cleanup queue와 service-role worker만 수행한다.
- signed upload 발급 endpoint는 accepted 상태, parent 작성자, 고정 prefix, 파일당 크기, MIME allowlist, 사용자 quota/rate limit을 검사한다.
- avatar/space image는 안전한 raster image만 허용한다. post/message의 허용 MIME 외 실행·스크립트 가능 형식은 거부하고, raster image 외 허용 파일은 signed download 응답에서 attachment disposition으로 제공한다. 운영 환경에서는 악성 파일 검사 후 finalize한다.
- MIME allowlist:
  - avatars/space-images: `image/jpeg`, `image/png`, `image/webp`
  - post-files/message-files: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`, `text/plain`
- Storage object path는 최대 1,024자다.

bucket별 접근:

- avatars SELECT: accepted 사용자. write authorization/finalize: 본인 prefix만.
- space-images SELECT: accepted 사용자의 활성 space directory 권한. write authorization/finalize: 활성 space owner/admin만.
- post-files SELECT: 현재 활성 post 접근 권한. write authorization/finalize: 활성 post 작성자만.
- message-files SELECT: 현재 room membership 및 활성 message 접근 권한. write authorization/finalize: 활성 message sender이자 현재 room 멤버만.
- object는 immutable하게 취급하고 동일 경로 UPDATE/upsert를 허용하지 않는다.

cleanup queue:

- `private.attachment_cleanup_queue`를 생성한다:
  - `id bigserial primary key`
  - `storage_bucket text NOT NULL`
  - `storage_path text NOT NULL`
  - `requested_by bigint NULL REFERENCES profiles(id) ON DELETE SET NULL`
  - `requested_at timestamptz NOT NULL DEFAULT now()`
  - `available_at timestamptz NOT NULL DEFAULT now()`
  - `attempts int4 NOT NULL DEFAULT 0 CHECK (attempts >= 0)`
  - `last_error text NULL`
  - `processed_at timestamptz NULL`
  - unique `(storage_bucket, storage_path)`
  - pending dequeue index `(processed_at, available_at)`
- queue table에 `SELECT, INSERT, UPDATE, DELETE`를 service role에 부여한다.
- `private.attachment_cleanup_queue_id_seq`에 `USAGE, SELECT`를 service role에 부여한다.
- queue 객체 권한을 `PUBLIC`, `anon`, `authenticated`에서 회수한다.
- attachment tables의 `(storage_bucket, storage_path)` unique를 유지하고 client가 bucket/path를 직접 기록하지 못하게 한다.
- queue 생성 후 `request_attachment_removal(p_attachment_kind text, p_attachment_id bigint) → void`를 생성한다. post/message attachment만 허용하고, 활성 parent 작성자 권한을 재검사한 뒤 queue에 멱등 enqueue한다.
- `request_attachment_removal` 생성 직후 EXECUTE를 `PUBLIC`, `anon`, `authenticated`, `service_role`에서 회수하고 `authenticated`에만 다시 부여한다.

background jobs:

| Job                                | 실행 기준                      |
| ---------------------------------- | ------------------------------ |
| orphan Storage cleanup             | 생성 후 24시간, DB 참조 없음   |
| deleted post attachment cleanup    | post 삭제 후 7일               |
| deleted message attachment cleanup | message 삭제 후 7일            |
| deleted space image cleanup        | space 삭제 후 7일              |
| explicit attachment removal        | queue 요청                     |
| read notification cleanup          | 읽은 notification 생성 후 30일 |
| hard purge                         | 운영자 실행 또는 별도 일정     |
| cache reconciliation               | 매일                           |

Storage object 삭제 성공 후에만 대응 DB 행을 삭제한다. 실패 항목은 재시도한다.
Storage object 삭제는 scheduled Edge Function/service-key worker가 수행한다. SQL에서 Storage 메타데이터 행을 직접 삭제하지 않는다.
orphan Storage cleanup도 SQL 함수가 아니라 같은 worker가 수행한다.

---

## SQL 외 운영 필수사항

- 01 ~ 17 migration은 DB·RLS·Storage policy까지만 구현한다.
- 배포 전 trusted upload authorization endpoint, signed download endpoint, service-role cleanup worker, 스케줄러를 별도 서버 코드로 구현한다.
- upload authorization endpoint는 사용자별 quota/rate limit과 짧은 signed URL 만료시간을 운영 설정으로 받는다. 이 값은 migration SQL에 임의로 고정하지 않는다.
- finalize 전에 server-detected MIME, 허용 확장자, 악성 파일 검사 결과를 확인한다.
- trusted mutation RPC가 notification을 만들 때는 외부 EXECUTE 없이 내부에서 `create_notification()`을 호출한다.

## 확정된 동작상 절충

- 익명 표시는 전역 pseudonym이며 권한 있는 사용자는 원본 `author_id`를 볼 수 있다.
- 익명 이름 변경은 기존 익명 콘텐츠에도 반영되고, 이름이 없으면 `익명 {author_id}`를 표시한다.
- feed keyset pagination은 페이지 사이 완전한 snapshot 일관성을 제공하지 않는다.
- message는 15분 이후 편집할 수 없지만 sender가 언제든 soft delete할 수 있다.
- 삭제 message의 답글은 유지하고 parent 본문은 숨긴다.
- space admin/manager는 역할 이관 없이 withdrawal할 수 있다.
- group chat creator가 비활성화되면 타인 강제 제거는 app admin이 담당한다.
- song_requests는 처리 상태 없는 append-only 로그다.
- accepted 사용자가 조회 가능한 profile 컬럼은 마스킹하지 않는다.

---

## 검증 절차

1. 전체 migration을 빈 local DB에 순서대로 적용한다.
2. migration 재적용 및 reset이 성공하는지 확인한다.
3. public 테이블 전체의 RLS 활성화를 확인한다.
4. `anon`, `authenticated`, `service_role`의 table/sequence/function GRANT를 확인한다.
5. `anon` 도메인 접근과 authenticated의 비허용 컬럼 변경이 거부되는지 확인한다.
6. 다른 사용자의 `author_id`, `sender_id`, `user_id` 가장이 거부되는지 확인한다.
7. withdrawn/non-accepted/banned 사용자의 접근이 거부되는지 확인한다.
8. direct chat 동시 생성 시 방이 하나만 생성되는지 확인한다.
9. space owner가 정확히 한 명인지 확인한다.
10. `auto_join`, `invite_only`, space directory 조회를 확인한다.
11. comments/message parent의 1레벨 제한을 확인한다.
12. soft delete 후 RLS, placeholder, count cache를 확인한다.
13. post/comment/message reaction 권한과 post reaction cache를 확인한다.
14. gongang 및 club round 동시 중복 생성이 차단되는지 확인한다.
15. message edit 15분 제한과 무기한 soft delete를 확인한다.
16. room/space membership 제거 직후 접근이 차단되는지 확인한다.
17. Storage 직접 쓰기 거부, signed upload, finalize, cleanup 재시도를 확인한다.
18. service-role cleanup, purge, notification 생성, sequence INSERT를 확인한다.
19. FK가 예상하지 않은 CASCADE 없이 RESTRICT/SET NULL로 동작하는지 확인한다.
20. cache reconciliation 결과를 확인한다.
21. `supabase gen types typescript --local`을 실행한다.
22. database advisors를 실행하고 오류를 수정한다.

완료 조건:

- 모든 검증 통과
- open TODO 없음
- SQL migration과 이 문서의 데이터 모델·권한·동작 계약 불일치 없음
