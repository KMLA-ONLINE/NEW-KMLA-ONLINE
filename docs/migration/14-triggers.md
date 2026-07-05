# 14. Triggers

- SQL 파일: `supabase/migrations/20260612120843_triggers.sql`

## 역할

이 파일은 단순 FK와 CHECK만으로는 잡기 어려운 cross-row 규칙을 trigger로 보강한다. 현재 프로젝트에서는 특히 reply 깊이, direct chat 무결성, room read-state, auth user 삭제 후 profile 처리 같은 동작이 여기에 들어 있다.

## 현재 작동 방식

### reply 구조 강제

- `comments`의 parent는 같은 post 안의 활성 최상위 comment만 허용된다.
- `messages`의 parent는 같은 room 안의 활성 최상위 message만 허용된다.
- 따라서 현재 reply 구조는 사실상 1레벨 답글까지만 허용되는 방식으로 동작한다.

### direct chat 무결성

- direct pair가 있는 room은 direct room 모양을 유지해야 한다.
- pair와 membership은 정확히 같은 두 사용자를 가리켜야 한다.
- direct room은 나중에 group room이나 named room으로 바뀔 수 없다.
- 이 검사는 deferred constraint trigger라 transaction 끝 시점에 최종 상태를 본다.

### space owner 무결성

- space_members 변경 후 각 existing space는 `role='owner'` membership이 정확히 1개여야 한다.
- owner transfer 같은 작업은 이 trigger와 partial unique가 함께 맞물려 동작한다.

### message edit / read-state

- message content가 바뀌면 `is_edited=true`, `edited_at=now()`를 자동으로 기록한다.
- `chat_room_read_states`는:
  - `last_read_message_id`가 같은 room의 활성 message여야 하고
  - 이전보다 뒤로 갈 수 없으며
  - 변경 시 `last_read_at`이 자동으로 현재 시각으로 찍힌다.

### auth user 삭제 처리

- `auth.users` 삭제 전에 linked profile을 잠근다.
- 대상이 app admin이거나 active space owner면 삭제를 거부한다.
- 그 외에는 profile을 anonymize하고 withdrawn/deleted 상태로 바꾼다.

## 현재 주의점

- 현재 프로젝트에서 message edit의 시간 제한 자체는 trigger가 아니라 RPC에서 강제한다.
- trigger는 “수정이 일어났다면 edited flag를 찍는다”까지만 담당한다.

## 미구현 / 계약과 차이

- post/comment/reaction/member-count cache trigger는 없다.
- post/comment/profile/space `updated_at` stamp trigger도 없다.
- auth delete는 memberships/posts/messages를 정리하지 않고 profile만 anonymize한다.
