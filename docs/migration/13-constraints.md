# 13. Constraints

- SQL 파일: `supabase/migrations/20260612120839_constraints.sql`

## 역할

이 파일은 앞에서 만든 테이블들을 “앱이 기대하는 모양”으로 잠그는 migration이다. 즉 RLS나 RPC 이전에, 데이터가 DB 레벨에서 최소한 어떤 모양이어야 하는지를 강제한다.

## 현재 작동 방식

### 식별자와 중복 방지

- `profiles`, `spaces`, `posts`의 public 식별자와 핵심 unique를 붙인다.
- 익명 이름은 `lower(btrim(...))` 기준 unique index로 관리한다.
- active group 이름도 normalized unique index로 막는다.
- reaction은 subject당 사용자 1개 row만 남도록 unique를 건다.
- attachment는 같은 parent 내 sort order와 전체 storage path 중복을 막는다.

### 상태 일관성

- soft delete row의 감사 상태를 check로 부분 보장한다.
- post pinned 상태와 message edited 상태를 check로 맞춘다.
- self-parent 같은 잘못된 구조도 막는다.

### 텍스트/형식 검증

- 이름, 설명, 제목, 본문, URL, 전화번호, 학번 같은 사용자 입력 형식을 check로 제한한다.
- attachment bucket/path/file metadata도 DB 레벨에서 검증한다.

### 범위 충돌 방지

- gongang 예약은 gist exclusion으로 겹침을 막는다.
- club apply round도 겹치는 기간을 exclusion으로 막는다.

## 현재 주의점

- 이 파일 덕분에 앱이 실수로 잘못된 값을 넣더라도, 상당수는 DB에서 바로 거부된다.
- 상태 일관성은 완전한 business rule 전체가 아니라, “절대 이런 shape는 안 된다” 수준을 우선 막는다.

## 미구현 / 계약과 차이

- `deleted_at`이 set이면 `deleted_by` 필수까지는 강제하지 않는다.
- `banned_at`이 있어도 `banned_by`는 null일 수 있다.
- pinned post에서 `pinned_by` 필수까지는 강제하지 않는다.
- `message_attachments` width/height positive check는 빠져 있다.
- `notifications.space_type` 관련 제약은 컬럼 자체가 없어 구현되지 않는다.
