# 09. Notifications

- SQL 파일: `supabase/migrations/20260612120420_tables_notifications.sql`

## 역할

이 파일은 사용자 inbox 역할을 하는 `notifications` 테이블을 만든다. 알림은 recipient 중심으로 저장되고, actor와 target은 선택적으로 연결된다.

## 관련 스키마

```text
notifications(
  id bigserial PK,
  recipient_id bigint -> profiles.id,
  actor_id bigint? -> profiles.id,
  title text?,
  body text?,
  space_id bigint? -> spaces.id,
  post_id bigint? -> posts.id,
  comment_id bigint? -> comments.id,
  message_id bigint? -> messages.id,
  read_at timestamptz?,
  created_at timestamptz
)
```

## 현재 작동 방식

- 한 notification은 반드시 `recipient_id`를 가진다.
- 누가 발생시켰는지는 `actor_id`로 표현한다.
- 어떤 대상과 연결되는지는 아래 nullable FK로 표현한다.
  - `space_id`
  - `post_id`
  - `comment_id`
  - `message_id`
- 읽음 여부는 `read_at`이 null인지 아닌지로 구분한다.

즉 현재 모델은 “recipient inbox + optional target pointers” 구조다.

## 현재 사용하는 RPC

- `create_notification()`: service-role 또는 trusted 내부 경로에서 notification row를 만든다.
- `cleanup_notifications()`: 읽은 뒤 30일 지난 notification을 정리한다.

## 권한과 쓰기 경로

- direct insert는 기본 경로가 아니다.
- 실제 생성은 later RPC migration의 `create_notification()`이 맡는다.
- 읽기와 읽음 처리 update는 later RLS migration에서 recipient 본인 기준으로 제한된다.

## 현재 주의점

- notification target 관계 검증과 suppression 로직은 테이블 정의가 아니라 RPC에서 처리한다.

## 미구현 / 계약과 차이

- 문서 계약에 있던 `space_type` 컬럼은 현재 SQL에 없다.
- title/body non-empty check와 message-target 혼합 금지는 later constraint migration에서 보강된다.

## 기존 합의 세부 규칙

- notification은 trusted RPC 또는 service-role 경로로만 생성하는 방향을 유지한다.
- recipient는 자신의 notification만 읽고 `read_at`만 직접 수정할 수 있어야 한다.
- 읽은 notification은 생성 후 30일 뒤 cleanup하는 정책을 유지한다.
- title은 최대 200자, body는 최대 2000자이며 둘 중 하나 이상 non-empty여야 한다.
- `notification_level`은 저장 컬럼이 아니라 생성 시 필터링 입력값으로 취급하는 방향을 유지한다.
- 원래 계약상 `space_type`은 parent에서 유도되는 비정규화 값으로 취급했다.
- message target은 content target(space/post/comment)과 혼합하지 않는 것이 원래 합의다.
- 잘못된 target 관계, 접근 불가 recipient, non-accepted recipient는 생성 거부를 목표로 한다.

- space/post/comment 알림은 recipient의 `space_members.notification_setting`을 적용하는 방향을 유지한다.
