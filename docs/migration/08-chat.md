# 08. Chat

- SQL 파일: `supabase/migrations/20260612120417_tables_chat.sql`

## 역할

이 파일은 채팅 도메인의 기본 구조를 만든다. direct chat과 group chat 모두 같은 room 모델을 공유하고, 그 위에 membership, message, attachment, reaction, read tracking을 쌓는 형태다.

## 관련 스키마

```text
chat_rooms(
  id bigserial PK,
  name text?,
  is_group boolean,
  created_by bigint? -> profiles.id,
  created_at timestamptz
)

direct_chat_pairs(
  room_id bigint PK -> chat_rooms.id,
  user1_id bigint -> profiles.id,
  user2_id bigint -> profiles.id,
  created_at timestamptz
)

chat_room_members(
  room_id bigint -> chat_rooms.id,
  user_id bigint -> profiles.id,
  joined_at timestamptz,
  PK(room_id, user_id)
)

messages(
  id bigserial PK,
  room_id bigint -> chat_rooms.id,
  sender_id bigint -> profiles.id,
  parent_id bigint? -> messages.id,
  content text?,
  is_edited boolean,
  edited_at timestamptz?,
  deleted_at timestamptz?,
  deleted_by bigint? -> profiles.id,
  created_at timestamptz
)

message_attachments(
  id bigserial PK,
  message_id bigint -> messages.id,
  storage_bucket text,
  storage_path text,
  file_name text,
  content_type text,
  size_bytes int8?,
  sort_order int4,
  width int4?,
  height int4?,
  created_at timestamptz
)

message_reactions(
  id bigserial PK,
  message_id bigint -> messages.id,
  user_id bigint -> profiles.id,
  reaction_type_id bigint -> reaction_types.id,
  created_at timestamptz,
  updated_at timestamptz?
)

message_reads(
  message_id bigint -> messages.id,
  user_id bigint -> profiles.id,
  read_at timestamptz,
  PK(message_id, user_id)
)

chat_room_read_states(
  room_id bigint -> chat_rooms.id,
  user_id bigint -> profiles.id,
  last_read_message_id bigint? -> messages.id,
  last_read_at timestamptz,
  PK(room_id, user_id)
)
```

## 현재 작동 방식

### 방 구조

- 모든 채팅은 `chat_rooms`에서 시작한다.
- room은 `is_group`으로 direct/group을 구분한다.
- direct chat은 `direct_chat_pairs`가 room과 두 사용자의 조합을 연결한다.
- group/direct 모두 실제 참여자는 `chat_room_members`에서 관리한다.

즉 구조적으로는:

- room 1개
- 그 room에 속한 membership 여러 개
- direct chat인 경우 pair row 1개

형태다.

### 메시지 구조

- `messages`는 특정 room에 속한다.
- `sender_id`는 profile 기준 작성자다.
- `parent_id`가 있어서 reply 형태를 표현할 수 있다.
- `content`가 nullable이라 첨부만 있는 메시지도 저장할 수 있다.
- 수정 상태는 `is_edited`, `edited_at`로 기록한다.
- 삭제 상태는 `deleted_at`, `deleted_by`로 기록한다.

### 첨부와 반응

- `message_attachments`는 실제 파일이 아니라 message에 연결된 attachment metadata다.
- `message_reactions`는 특정 사용자의 특정 message 반응을 담는다.

### 읽음 구조

- `message_reads`는 메시지 단위 읽음 상세 row다.
  - 누가 어떤 메시지를 읽었는지와 `read_at`을 여기에 기록한다.
- `chat_room_read_states`는 방 단위 마지막 읽음 위치를 저장하는 cache다.
  - unread 계산은 현재 이 cache를 기준으로 빠르게 처리한다.
- `mark_chat_read()`는 읽음 범위를 `message_reads`에 기록하고, 동시에 `chat_room_read_states` cache도 최신 위치로 올린다.
- `send_message()`와 `send_message_with_attachment()`는 sender 자신의 새 메시지를 즉시 읽은 것으로 `message_reads`에 기록한다.
- `get_chat_messages()`는 `reads` JSON을 `message_reads`에서 만든다.

## 현재 사용하는 RPC

- room 생성/멤버십
  - `create_direct_chat()`
  - `create_group_chat()`
  - `create_group_chat_with_members()`
  - `add_group_member()`
  - `remove_group_member()`
- message lifecycle
  - `send_message()`
  - `update_message()`
  - `soft_delete_message()`
  - `send_message_with_attachment()`
- 읽기/반응
  - `mark_chat_read()`
  - `set_message_reaction()`
  - `list_chat_rooms()`
  - `get_chat_messages()`
  - `search_messages()`
- service cleanup
  - `cleanup_direct_chat_room()`

## 권한과 쓰기 경로

- 현재 프로젝트에서 message 관련 직접 table write는 기본 경로가 아니다.
- 실제 채팅 동작은 위 RPC들이 담당한다.
- 현재 읽기 권한은 later RLS migration에서 room membership 기준으로 제한된다.

## 현재 주의점

- 이 프로젝트는 `message_reads`를 읽음 정본으로 두고, `chat_room_read_states`는 unread 계산용 cache로 유지한다.
- 실제 unread 계산은 현재 `chat_room_read_states.last_read_message_id` cache 기준이다.
- message soft delete는 현재 본문을 숨기는 게 아니라 placeholder 문자열로 바꾸는 방식이다.
- attachment-only message를 허용하기 때문에 `messages.content`는 nullable이다.
- 사용자 기준으로는 message attachment를 기존 메시지에 나중에 추가할 수 없고, 메시지 생성 시 `send_message_with_attachment()`로만 첨부를 붙일 수 있다.
- attachment 제거는 `request_attachment_removal()`로 가능하다.

## 미구현 / 계약과 차이

- direct pair canonical order, unique pair, direct room shape 검증은 later constraint/trigger migration에서 완성된다.
- read-state monotonicity, message parent 1레벨 제한, edited stamp도 later trigger migration에서 강제된다.
- SQL 안에는 `finalize_message_attachment()` 함수가 남아 있지만, 현재 authenticated 사용자에게는 execute가 부여되지 않는다.
