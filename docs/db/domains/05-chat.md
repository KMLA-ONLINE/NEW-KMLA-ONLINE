# 05. Chat

Source: [`supabase/schemas/05-chat.sql`](../../../supabase/schemas/05-chat.sql)

1:1/그룹 채팅 전체: 방, 멤버십, 메시지, 첨부, 반응, 읽음 상태. 앱에서 RPC 표면이 가장 넓은 도메인.

## 테이블

- `chat_rooms` — `is_group` 플래그. 1:1 방은 `name` null 강제
- `direct_chat_pairs` — `(user1_id < user2_id)` unique로 1:1 방 중복 방지
- `chat_room_members` — `(room_id, user_id)` PK
- `messages` — `parent_id` 답글(1레벨), 편집/soft delete 상태
- `message_attachments` — 메시지 첨부 metadata (blob은 Storage `message-files`)
- `message_reactions` — `(message_id, user_id)` unique
- `chat_room_read_states` — 사용자별 마지막 읽은 메시지 포인터

## RPC

| 함수 | 인증 | 쓰기 | 목적 |
| --- | --- | --- | --- |
| `create_direct_chat(other_user_id)` | accepted | O | 1:1 방 생성 또는 기존 방 재사용 (advisory lock으로 중복 방지) |
| `create_group_chat(name)` | accepted | O | 그룹 방 생성 + 본인 멤버십 |
| `create_group_chat_with_members(name, member_ids)` | accepted | O | 그룹 방 + 멤버 일괄 추가 (전원 accepted 검증) |
| `add_group_member(room_id, user_id)` | 해당 그룹 멤버 | O | accepted 사용자를 그룹에 추가 |
| `remove_group_member(room_id, user_id)` | 본인 탈퇴 또는 방 생성자/app admin | O | 멤버 제거 + 읽음/반응 정리 |
| `send_message(room_id, content, parent_id?)` | 방 멤버 | O | 메시지 전송 (1 ~ 10000자) + 본인 읽음 포인터 갱신 |
| `send_message_with_attachment(room_id, path, ...)` | 방 멤버 | O | 업로드된 object 검증 후 메시지+첨부를 한 트랜잭션으로 생성 |
| `update_message(message_id, content)` | 보낸 본인, 15분 이내 | O | 메시지 수정 (trigger가 edited 스탬프) |
| `mark_chat_read(room_id, last_read_message_id)` | 방 멤버 | O | 읽음 포인터 전진 |
| `set_message_reaction(message_id, reaction_type_id?)` | 방 멤버 | O | 반응 설정/교체, null이면 제거 |
| `soft_delete_message(id)` | 보낸 본인 | O | 메시지 soft delete + 첨부/반응 제거 + blob 삭제 큐 등록 |
| `list_chat_rooms()` | accepted | X | 방 목록 (표시명, 마지막 메시지, unread 수, 멤버 수) |
| `get_chat_messages(room_id, before_id?, limit)` | 방 멤버 | X | 메시지 keyset 페이지네이션 (sender/parent/첨부/반응/읽음 포함) |
| `search_messages(query, room_id)` | RLS 기반 (SECURITY INVOKER) | X | 방 내 공백 무시 메시지 검색 |
| `finalize_message_attachment(...)` | (어느 role에도 미부여 — 현재 미사용) | O | 기존 메시지에 첨부 추가 |
| `cleanup_direct_chat_room(room_id)` | service_role | O | 1:1 방 하드 정리 (첨부가 남아 있으면 거부) |

## Private helper

| 함수 | 용도 |
| --- | --- |
| `private.is_room_member(room_id)` | accepted + 방 멤버 여부 |
| `private.can_access_message(message_id)` | 활성 메시지 + 방 멤버 여부 |
| `private.is_valid_message_parent(parent_id, room_id)` | 답글 부모 유효성 |
| `private.has_active_message_reply(message_id)` | 활성 답글 존재 여부 (삭제 메시지 placeholder 노출 판단) |

## Trigger

| 트리거 | 테이블 | 이벤트 | side effect |
| --- | --- | --- | --- |
| `trg_validate_message_parent` | `messages` | BEFORE INSERT/UPDATE of `room_id`,`parent_id` | 답글 부모가 같은 방의 활성 최상위 메시지가 아니면 예외 |
| `trg_mark_message_edited` | `messages` | BEFORE UPDATE of `content` | 내용이 바뀌면 `is_edited=true`, `edited_at=now()` 스탬프 |
| `trg_validate_direct_chat_pair` | `direct_chat_pairs` | AFTER INSERT/UPDATE/DELETE (deferred constraint) | 방이 존재하는 동안 pair 삭제 금지, pair는 name 없는 1:1 방만 참조 |
| `trg_validate_direct_chat_member` | `chat_room_members` | AFTER INSERT/UPDATE/DELETE (deferred constraint) | 1:1 방 멤버십이 pair 두 명과 정확히 일치하도록 강제 |
| `trg_validate_direct_chat_room` | `chat_rooms` | BEFORE UPDATE of `is_group`,`name` | 1:1 방을 그룹으로 바꾸거나 이름 붙이는 변조 금지 |
| `trg_validate_chat_read_state` | `chat_room_read_states` | BEFORE INSERT/UPDATE of `room_id`,`last_read_message_id` | 읽음 포인터는 같은 방 활성 메시지로 전진만 허용 + `last_read_at` 갱신 |

## 주의

- 채팅 쓰기는 전부 RPC 경로다. direct insert grant는 없다.
- 삭제된 메시지는 활성 답글이 있으면 select에 노출된다(placeholder 렌더링용) — `messages_select` policy 참고.
- 메시지 검색 인덱스는 공백 제거 + `lower()` + trgm 기반.
