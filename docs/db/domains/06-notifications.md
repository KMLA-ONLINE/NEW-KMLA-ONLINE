# 06. Notifications

Source: [`supabase/schemas/06-notifications.sql`](../../../supabase/schemas/06-notifications.sql)

recipient 중심 알림 inbox. actor와 대상(space/post/comment/message)은 nullable FK로 연결한다.

## 테이블

- `notifications` — recipient/actor, title/body, 대상 FK 4종 (message 대상은 다른 대상과 혼합 금지 제약), `read_at`

## RPC

현재 생성/정리 경로가 없다.

## Private helper

없음.

## Trigger

없음.

## 주의

- authenticated는 본인 수신 알림 select와 `read_at` update만 가능하다.
- `notification_level` enum은 [00-foundation](00-foundation.md)으로 옮겼다 — 05-chat의 `chat_notification_settings`가 먼저 필요로 하기 때문이다.
- 알림을 **생성하는 경로가 아직 없다**: insert grant도 trigger도 RPC도 없다.
- 채팅은 메시지마다 알림 행을 만들지 않는다. 안 읽음 배지는 `chat_read_states`에서 파생되고(`list_conversations().unread_count`), 푸시는 저장하지 않는 일시적 전달이다. 메시지당 수신자당 행을 쌓으면 배지를 중복 저장하면서 팬아웃이 터진다. `notifications.message_id`는 **멘션**처럼 실제로 지속되어야 하는 알림에만 쓴다 — 그때 `notification_level`이 의미를 갖는다.
