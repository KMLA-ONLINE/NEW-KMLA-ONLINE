# 06. Notifications

Source: [`supabase/schemas/06-notifications.sql`](../../../supabase/schemas/06-notifications.sql)

recipient 중심 알림 inbox. actor와 대상(space/post/comment/message)은 nullable FK로 연결한다.

## 테이블

- `notifications` — recipient/actor, title/body, 대상 FK 4종 (message 대상은 다른 대상과 혼합 금지 제약), `read_at`

## RPC

없음. 생성을 맡던 `create_notification()`(service-role, 대상 관계 검증 + 알림 설정 suppression)과 정리용 `cleanup_notifications()`는 2026-07 정리에서 제거됐다 — 현재 생성/정리 경로가 없다.

## Private helper

없음.

## Trigger

없음.

## 주의

- authenticated는 본인 수신 알림 select와 `read_at` update만 가능하다.
- `notification_level` enum은 남아 있지만 이를 쓰던 RPC가 제거돼 현재 미사용이다.
