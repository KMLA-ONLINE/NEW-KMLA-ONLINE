# 05. Chat

Source: [`supabase/schemas/05-chat.sql`](../../../supabase/schemas/05-chat.sql)

1:1 대화와 그룹 대화를 단일 `conversations` 상위 테이블로 통합한다. `conversations.type` 이 `direct` / `group` 을 구분하고, 하위 테이블·메시지·읽음 상태는 모두 단일 `conversation_id` 를 참조한다. 멤버십만 종류별로 갈라진다: 1:1은 `direct_conversations` 쌍 테이블, 그룹은 `conversation_members`.

## 테이블

- `conversations` — 대화 컨테이너. `type='group'` 이면 `name` 필수, `type='direct'` 이면 `name` 은 null (`conversations_shape_check`)
- `direct_conversations` — 1:1 대화의 멤버십 + 유일성. `conversation_id` PK, `(user1_id < user2_id)`, `(user1_id, user2_id)` unique로 같은 두 유저 조합은 하나만 존재
- `conversation_members` — 그룹 대화 멤버십 (`conversation_id`, `user_id` PK)
- `messages` — 단일 `conversation_id` 참조. `parent_id` 답글(1레벨), `edited_at`/soft delete 상태. 편집 여부는 `edited_at is not null` 로 파생 (별도 boolean 없음). `pinned_at`/`pinned_by` 로 고정 상태 표현 (`messages_pinned_state_check`: `pinned_at is not null or pinned_by is null`) — 대화 멤버라면 누구나(발신자가 아니어도) 고정/해제 가능하고, 한 대화에 여러 메시지를 동시에 고정할 수 있다
- `message_attachments` — 메시지 첨부 metadata (blob은 Storage `message-files`)
- `message_reactions` — `(message_id, user_id)` 자연 PK (surrogate id 없음)
- `chat_read_states` — 사용자별 마지막 읽은 메시지 포인터. `(conversation_id, user_id)` 자연 PK

## RPC

| 함수                                                              | 인증                               | 쓰기 | 목적                                                                             |
| ----------------------------------------------------------------- | ------------------------------------ | ------ | --------------------------------------------------------------------------------- |
| `create_direct_conversation(peer_id)`                           | accepted                           | O    | 두 유저 조합의 1:1 대화 생성(멱등: 이미 있으면 기존 id 반환)                     |
| `remove_group_member(conversation_id, user_id)`                 | 본인 탈퇴 또는 생성자/app admin    | O    | 그룹 멤버 제거 + 읽음/반응 정리                                                  |
| `soft_delete_message(id)`                                       | 보낸 본인                          | O    | 메시지 soft delete + 첨부/반응 제거 + blob 삭제 큐 등록                          |
| `send_message_with_attachment(conversation_id, path, ...)`      | 대화 멤버                          | O    | 업로드된 object 검증 후 메시지+첨부를 한 트랜잭션으로 생성 (direct/group 공통)   |
| `list_conversations()`                                          | accepted                           | X    | direct/group 통합 목록 (표시명, 마지막 메시지, unread 수, 멤버 수)               |
| `get_chat_messages(conversation_id, before_id?, limit)`         | 대화 멤버                          | X    | 메시지 keyset 페이지네이션 (sender/parent/첨부/반응/읽음/고정 상태 포함)         |
| `search_messages(query, conversation_id)`                       | RLS 기반 (SECURITY INVOKER)        | X    | 대화 내 공백 무시 메시지 검색                                                    |
| `cleanup_conversation(conversation_id)`                         | service_role                       | O    | 대화 하드 정리 (첨부가 남아 있으면 거부)                                         |

## Private helper

| 함수                                                    | 용도                                                    |
| --------------------------------------------------------- | --------------------------------------------------------- |
| `private.is_conversation_member(conversation_id)`       | accepted + 해당 대화 참여자인지 (direct 쌍 또는 그룹 멤버) |
| `private.can_access_message(message_id)`                | 활성 메시지 + 대화 멤버 여부                             |
| `private.is_valid_message_parent(parent_id, conversation_id)` | 답글 부모 유효성                                    |
| `private.has_active_message_reply(message_id)`          | 활성 답글 존재 여부 (삭제 메시지 placeholder 노출 판단) |
| `private.is_allowed_message_mime(content_type)`         | 첨부 허용 MIME 목록 (단일 정의, send RPC에서 사용)      |

## Trigger

| 트리거                              | 테이블              | 이벤트                                                       | side effect                                                       |
| ------------------------------------- | --------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------ |
| `trg_validate_message_parent`       | `messages`          | BEFORE INSERT/UPDATE of `conversation_id`,`parent_id`        | 답글 부모가 같은 대화의 활성 최상위 메시지가 아니면 예외         |
| `trg_mark_message_edited`           | `messages`          | BEFORE UPDATE of `content`                                   | 내용 trim, 내용이 바뀌면 `edited_at=now()` 스탬프. `messages_pin_update` 정책이 비발신자에게도 행 단위 접근을 열어주므로, 실제 발신자·15분 이내 여부는 RLS가 아니라 여기서 재검증 (아니면 예외) |
| `trg_stamp_message_pinned_by`       | `messages`          | BEFORE UPDATE of `pinned_at`                                 | `pinned_by`를 호출자로 스탬프(고정 시)하거나 null로 정리(해제 시) — 클라이언트가 다른 사람이 고정한 것처럼 조작 불가 |
| `trg_mark_message_reaction_updated` | `message_reactions` | BEFORE UPDATE of `reaction_type_id`                          | 반응 교체 시 `updated_at=now()` 스탬프                          |
| `trg_validate_chat_read_state`      | `chat_read_states`  | BEFORE INSERT/UPDATE of `conversation_id`,`last_read_message_id` | 읽음 포인터는 같은 대화의 활성 메시지로 전진만 허용 + `last_read_at` 갱신 |
| `trg_add_conversation_creator_member` | `conversations`   | AFTER INSERT                                                 | 그룹 대화 생성자를 `conversation_members`에 자동 추가            |
| `trg_mark_sender_chat_read`         | `messages`          | AFTER INSERT                                                 | 메시지 작성자의 `chat_read_states`를 자동 전진                   |

## 주의

- 그룹 대화 생성(`conversations` insert), 그룹 멤버 추가, 일반 메시지 작성, 메시지 수정, 메시지 고정/해제, 읽음 포인터 전진, 메시지 반응 insert/update/delete는 direct table access + RLS + column grant로 처리한다.
- `messages`에는 UPDATE permissive policy가 두 개다: `messages_update`(발신자 본인 + 15분 이내, `content` 등)와 `messages_pin_update`(대화 멤버 전원, `pinned_at`만). Postgres RLS는 permissive policy를 행 단위로 OR 결합하므로, 이 두 번째 정책이 사실상 모든 활성 메시지에 대해 UPDATE 문 전체의 행 가시성을 열어준다 — 즉 `content` 컬럼 grant가 있는 한 RLS만으로는 "발신자만 수정 가능"이 더 이상 보장되지 않는다. 그래서 `trg_mark_message_edited`가 OLD/NEW를 직접 비교해 실제 권한(발신자·15분 이내)을 다시 검증한다. 이 패턴을 깨지 않으려면: `messages`에 새 permissive UPDATE 정책이나 새 컬럼 grant를 추가할 때마다 트리거 가드도 같이 검토할 것.
- 1:1 대화 생성은 `conversations` + `direct_conversations` + 멤버십을 원자적으로 만들어야 해서 `create_direct_conversation` RPC로만 처리한다(`direct_conversations` 에는 insert grant 없음).
- 첨부 메시지 생성, 메시지 삭제, 그룹 멤버 제거, 대화 하드 정리는 multi-table/cleanup 작업이라 RPC로 처리한다.
- `message-files` 업로드 provisional path는 `{conversation_id}/{auth_uid}/{uuid}` 다 (direct/room 구분 없음). object 경로 검증은 `private.has_uuid_object_suffix` 헬퍼로 통일.
- 삭제된 메시지는 활성 답글이 있으면 select에 노출된다(placeholder 렌더링용) — `messages_select` policy 참고.
- 메시지 검색 인덱스는 공백 제거 + `lower()` + trgm 기반.
