# 12. Indexes

- SQL 파일: `supabase/migrations/20260612120836_indexes.sql`

## 역할

이 파일은 기능을 바꾸는 migration이 아니라, 이미 정의된 데이터 모델을 실제 앱 조회 패턴에 맞게 빠르게 읽도록 만드는 성능 migration이다.

## 현재 작동 방식

### 피드와 목록 조회

- `spaces`, `space_members`, `posts`, `comments`에 대해 목록/정렬/활성 row 중심 인덱스를 추가한다.
- 게시글 피드와 pinned 조회는 non-deleted 조건을 포함한 partial index를 쓴다.

### 반응/채팅 조회

- post/comment/message reaction 집계나 사용자별 조회를 위한 인덱스가 있다.
- chat 쪽은 다음 조회를 빠르게 하도록 인덱스를 둔다.
  - direct pair 사용자별 조회
  - room membership 조회
  - room message timeline
  - message read / room read-state 조회

### 검색

- `posts.title`, `posts.content`, `comments.content`, `messages.content`에 trigram GIN 인덱스를 둔다.
- 검색식은 공백 제거 + 소문자화된 표현식을 그대로 인덱스에 올린다.

### 알림/유틸리티/클럽

- recipient 기준 알림 목록
- gongang owner/location 조회
- song request 시간순 조회
- club apply round / user / club 기준 조회

## 현재 주의점

- 이 파일은 순수하게 성능 목적이다. 데이터 정합성은 여기서 보장하지 않는다.
- partial index는 active row 위주 조회를 전제로 해서, soft-deleted 데이터 쿼리에는 다른 경로가 사용될 수 있다.

## 미구현 / 계약과 차이

- 일부 FK 보조 인덱스는 이상적인 목록보다 부족하다.
- spaces/clubs 검색용 trigram index는 없다.
