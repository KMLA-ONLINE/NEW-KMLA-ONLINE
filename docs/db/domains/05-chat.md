# 05. Chat

Source: [`supabase/schemas/05-chat.sql`](../../../supabase/schemas/05-chat.sql)

1:1 direct chat과 그룹 chat room을 분리해서 관리한다. 1:1은 `direct_chats`, 그룹은 `chat_rooms` + `chat_room_members`가 기준이다.

## 테이블

- `direct_chats` — 1:1 채팅. `(user1_id < user2_id)`, `(user1_id, user2_id)` unique로 같은 두 유저 조합은 하나만 존재
- `chat_rooms` — 그룹 채팅 전용. `name` 필수
- `chat_room_members` — 그룹 채팅 멤버십 (`chat_room_id`, `user_id` PK)
- `messages` — `direct_chat_id` 또는 `chat_room_id` 중 정확히 하나를 참조. `parent_id` 답글(1레벨), 편집/soft delete 상태
- `message_attachments` — 메시지 첨부 metadata (blob은 Storage `message-files`)
- `message_reactions` — `(message_id, user_id)` unique
- `chat_read_states` — direct/group 공통 사용자별 마지막 읽은 메시지 포인터. `created_at`, `last_read_at` 보유

## RPC

| 함수 | 인증 | 쓰기 | 목적 |
| --- | --- | --- | --- |
| `remove_group_member(chat_room_id, user_id)` | 본인 탈퇴 또는 방 생성자/app admin | O | 그룹 멤버 제거 + 읽음/반응 정리 |
| `soft_delete_message(id)` | 보낸 본인 | O | 메시지 soft delete + 첨부/반응 제거 + blob 삭제 큐 등록 |
| `send_direct_message_with_attachment(direct_chat_id, path, ...)` | direct chat 멤버 | O | 업로드된 object 검증 후 direct 메시지+첨부를 한 트랜잭션으로 생성 |
| `send_room_message_with_attachment(chat_room_id, path, ...)` | 그룹 방 멤버 | O | 업로드된 object 검증 후 그룹 메시지+첨부를 한 트랜잭션으로 생성 |
| `list_chat_rooms()` | accepted | X | direct/group 통합 목록 (표시명, 마지막 메시지, unread 수, 멤버 수) |
| `get_chat_messages(direct_chat_id?, chat_room_id?, before_id?, limit)` | target 멤버 | X | 메시지 keyset 페이지네이션 (sender/parent/첨부/반응/읽음 포함). direct/group 중 하나만 지정 |
| `search_messages(query, direct_chat_id?, chat_room_id?)` | RLS 기반 (SECURITY INVOKER) | X | target 내 공백 무시 메시지 검색. direct/group 중 하나만 지정 |
| `cleanup_direct_chat(direct_chat_id)` | service_role | O | 1:1 direct chat 하드 정리 (첨부가 남아 있으면 거부) |

## Private helper

| 함수 | 용도 |
| --- | --- |
| `private.is_direct_chat_member(direct_chat_id)` | accepted + direct chat 참여자인지 |
| `private.is_room_member(chat_room_id)` | accepted + 그룹 방 멤버인지 |
| `private.can_access_message(message_id)` | 활성 메시지 + direct/group target 멤버 여부 |
| `private.is_valid_message_parent(parent_id, direct_chat_id, chat_room_id)` | 답글 부모 유효성 |
| `private.has_active_message_reply(message_id)` | 활성 답글 존재 여부 (삭제 메시지 placeholder 노출 판단) |

## Trigger

| 트리거 | 테이블 | 이벤트 | side effect |
| --- | --- | --- | --- |
| `trg_validate_message_parent` | `messages` | BEFORE INSERT/UPDATE of `direct_chat_id`,`chat_room_id`,`parent_id` | 답글 부모가 같은 target의 활성 최상위 메시지가 아니면 예외 |
| `trg_mark_message_edited` | `messages` | BEFORE UPDATE of `content` | 내용 trim, 내용이 바뀌면 `is_edited=true`, `edited_at=now()` 스탬프 |
| `trg_mark_message_reaction_updated` | `message_reactions` | BEFORE UPDATE of `reaction_type_id` | 반응 교체 시 `updated_at=now()` 스탬프 |
| `trg_validate_chat_read_state` | `chat_read_states` | BEFORE INSERT/UPDATE of `direct_chat_id`,`chat_room_id`,`last_read_message_id` | 읽음 포인터는 같은 target의 활성 메시지로 전진만 허용 + `last_read_at` 갱신 |
| `trg_add_chat_room_creator_member` | `chat_rooms` | AFTER INSERT | 그룹 방 생성자를 `chat_room_members`에 자동 추가 |
| `trg_mark_sender_chat_read` | `messages` | AFTER INSERT | 메시지 작성자의 `chat_read_states`를 자동 전진 |

## 주의

- direct chat 생성, 그룹 방 생성, 그룹 멤버 추가, 일반 메시지 작성, 메시지 수정, 읽음 포인터 전진, 메시지 반응 insert/update/delete는 direct table access + RLS + column grant로 처리한다.
- 첨부 메시지 생성, 메시지 삭제, 그룹 멤버 제거, direct chat 하드 정리는 multi-table/cleanup 작업이라 RPC로 처리한다.
- `message-files` 업로드 provisional path는 `direct/{direct_chat_id}/{auth_uid}/{uuid}` 또는 `room/{chat_room_id}/{auth_uid}/{uuid}`다.
- 삭제된 메시지는 활성 답글이 있으면 select에 노출된다(placeholder 렌더링용) — `messages_select` policy 참고.
- 메시지 검색 인덱스는 공백 제거 + `lower()` + trgm 기반.
