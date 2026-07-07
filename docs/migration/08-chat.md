
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
- deleted message나 content/attachment가 모두 사라진 빈 message에는 reaction을 달 수 없다.

### 읽음 구조

- `chat_room_read_states`는 방 단위 마지막 읽음 위치와 읽음 시각을 저장한다.
- unread 계산은 `last_read_message_id`를 기준으로 처리한다.
- `mark_chat_read()`는 이 room read-state를 앞으로만 이동시킨다.
- `send_message()`와 `send_message_with_attachment()`는 sender 자신의 새 메시지를 즉시 읽은 상태로 room read-state를 최신화한다.
- `get_chat_messages()`의 `reads` JSON은 room read-state에서 이 메시지까지 읽은 멤버를 계산해서 만든다.

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
- `chat_room_read_states`는 현재 room 멤버 전체가 직접 SELECT할 수 있다.

## 현재 주의점

- 이 프로젝트는 `chat_room_read_states` 하나를 읽음 정본으로 사용한다.
- 실제 unread 계산은 `chat_room_read_states.last_read_message_id` 기준이다.
- message soft delete는 `deleted_at`/`deleted_by`를 기록하고 `content`를 `null`로 비우는 방식이다. 이때 연결된 message attachment metadata와 message reaction은 즉시 제거되고, 실제 blob 삭제는 cleanup worker가 비동기로 처리한다.
- attachment-only message를 허용하기 때문에 `messages.content`는 nullable이다.
- 사용자 기준으로는 message attachment를 기존 메시지에 나중에 추가할 수 없고, 메시지 생성 시 `send_message_with_attachment()`로만 첨부를 붙일 수 있다.
- attachment 제거는 `request_attachment_removal()`로 가능하다. 이 RPC는 attachment metadata row를 즉시 지우고 관련 message reaction도 지운 뒤, 실제 blob 삭제는 cleanup queue로 넘긴다. 마지막 attachment가 지워져 빈 message가 되면 그 message는 `content=null` soft delete로 전환한다.

## 미구현 / 계약과 차이

- direct pair canonical order, unique pair, direct room shape 검증은 later constraint/trigger migration에서 완성된다.
- read-state monotonicity, message parent 1레벨 제한, edited stamp도 later trigger migration에서 강제된다.
- SQL 안에는 `finalize_message_attachment()` 함수가 남아 있지만, 현재 authenticated 사용자에게는 execute가 부여되지 않는다.

## 기존 합의 세부 규칙

- direct pair는 `user1_id < user2_id` 정규화를 따른다.
- direct room은 정확히 두 멤버를 가져야 하고 pair 사용자와 일치해야 한다.
- 1:1 방 멤버는 create_direct_chat이 만든 두 명으로 고정하고, 임의 직접 추가/삭제는 허용하지 않는 방향을 유지한다.
- direct room 이름은 NULL, group room 이름은 trim 후 1~100자를 기준으로 한다.
- message parent는 같은 room의 활성 최상위 message만 허용하는 방향을 유지한다.
- message 수정은 작성 후 15분까지만 허용하고, soft delete는 시간 제한 없이 sender 본인에게 허용한다.
- 삭제 message는 `deleted_at`로 구분하고 답글은 유지한다. deleted UI 표시는 클라이언트가 `deleted_at` 기준으로 결정한다.
- `chat_room_read_states`는 room별 마지막 읽음 위치와 읽음 시각을 저장한다. 메시지별 읽은 사람 표시는 여기서 유도한다.
- `search_messages()`는 현재 SQL 기준 group room만이 아니라 모든 room에서 동작한다.
- group chat 검색은 content가 있는 활성 message만 대상으로 하고, query는 공백 제거 + 소문자화 기준으로 비교하는 방향을 유지한다.
- group room의 일반 멤버는 accepted 사용자를 초대하고 본인만 나갈 수 있으며, 타인 제거는 creator 또는 app admin이 수행하는 방향을 유지한다.
- unread 기준은 room별 마지막 읽은 위치와 message id 순서를 바탕으로 계산한다.
