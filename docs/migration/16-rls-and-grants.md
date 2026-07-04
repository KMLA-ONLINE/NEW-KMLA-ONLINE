# 16. RLS and Grants

- SQL 파일: `supabase/migrations/20260612121246_rls_and_grants.sql`

## 역할

이 파일은 “누가 무엇을 직접 읽고 쓸 수 있는가”를 정하는 핵심 권한 계층이다. 테이블을 공개 스키마에 두더라도, 실제 데이터 접근은 여기서 만든 helper + policy + grant 조합으로 제어된다.

## 현재 작동 방식

### helper 중심 권한 판단

- 이 파일은 private helper를 많이 만든다.
  - app admin 여부
  - space membership 여부
  - room membership 여부
  - post/comment/message 접근 가능 여부
  - permission 보유 여부
  - club round open 여부
- 이후 정책은 대부분 “현재 사용자가 이 row를 볼 수 있는가”를 helper로 풀어 쓴다.

### direct read 모델

- `spaces`는 accepted 사용자 전체에게 active space 공개 메타를 보여준다.
- membership, posts, comments, chat 데이터는 대부분 현재 membership이 있을 때만 읽힌다.
- deleted comment/message도 active direct reply가 있으면 placeholder 용도로 계속 읽히는 구조다.
- notifications는 recipient 본인만 읽을 수 있다.
- gongang/song request/club apply는 permission 또는 round-open helper와 조합해서 읽힌다.

### direct write 모델

- direct SQL write는 일부 영역에만 남겨 둔다.
  - posts/comments insert/update
  - post/comment reactions insert/update/delete
  - notifications `read_at` update
  - gongangs CRUD
  - song_requests insert
  - clubs_apply insert/delete
- 반대로 chat core write는 direct SQL이 아니라 RPC 전용으로 둔다.
  - messages
  - message_reactions
  - message_reads
  - chat_room_read_states
  - room/member 구조

### grants

- `authenticated`는 필요한 private helper execute와 제한된 table/column/sequence 권한만 받는다.
- `service_role`은 public schema table과 sequence 전체 접근을 받는다.
- `anon`은 public table/sequence 접근을 회수당한다.

## 현재 주의점

- 이 프로젝트는 “accepted 여부”와 “현재 membership 존재 여부”가 권한 모델의 핵심이다.
- direct write가 허용된 테이블도 column-level grant와 RLS가 같이 걸려 있어, 허용 컬럼만 바꿀 수 있다.
- chat은 읽기는 direct select 가능하지만 쓰기는 RPC로 몰아 둔 구조다.

## 미구현 / 계약과 차이

- `spaces_select`는 accepted 사용자 전체에게 active space를 공개한다.
- `clubs_apply_select`는 accepted 사용자 전체가 전체 apply row를 읽을 수 있다.
- notifications는 현재 accepted recipient만 read/update 가능하다.
