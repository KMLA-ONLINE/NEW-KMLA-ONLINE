# 06. Content

- SQL 파일: `supabase/migrations/20260612120411_tables_content.sql`

## 역할

이 파일은 space 안에서 돌아가는 게시글 계층을 만든다. 구조는 `posts -> comments -> attachments` 중심이며, 익명 표시와 soft delete, count cache를 위한 컬럼까지 포함한다.

## 관련 스키마

```text
posts(
  id bigserial PK,
  pub_id uuid,
  space_id bigint -> spaces.id,
  author_id bigint -> profiles.id,
  title text,
  content text,
  is_anonymous boolean,
  is_pinned boolean,
  pinned_at timestamptz?,
  pinned_by bigint? -> profiles.id,
  comment_count int4,
  reaction_count int4,
  created_at timestamptz,
  updated_at timestamptz?,
  deleted_at timestamptz?,
  deleted_by bigint? -> profiles.id
)

post_attachments(
  id bigserial PK,
  post_id bigint -> posts.id,
  storage_bucket text,
  storage_path text,
  file_name text,
  content_type text,
  size_bytes int8?,
  sort_order int4,
  alt text?,
  width int4?,
  height int4?,
  created_at timestamptz
)

comments(
  id bigserial PK,
  post_id bigint -> posts.id,
  author_id bigint -> profiles.id,
  parent_id bigint? -> comments.id,
  content text,
  is_anonymous boolean,
  created_at timestamptz,
  updated_at timestamptz?,
  deleted_at timestamptz?,
  deleted_by bigint? -> profiles.id
)
```

## 현재 작동 방식

### posts

- 게시글은 반드시 어떤 `space`에 속한다.
- 한 post는 다음 정보를 가진다.
  - 외부 식별용 `pub_id`
  - 소속 space `space_id`
  - 작성자 `author_id`
  - 본문 `title`, `content`
  - 익명 여부 `is_anonymous`
  - 고정 여부 `is_pinned`, `pinned_at`, `pinned_by`
  - 캐시 수치 `comment_count`, `reaction_count`
  - soft delete / 감사 필드

### post attachments

- `post_attachments`는 post에 종속되는 파일 metadata 테이블이다.
- 실제 blob은 Storage에 있고, 이 테이블은 bucket/path, 파일명, MIME, 크기, 정렬 순서, 이미지 메타만 저장한다.

### comments

- comment는 특정 post에 속한다.
- `parent_id` self-reference가 있어서 reply 구조를 만들 수 있다.
- 익명 여부와 soft delete 필드를 별도로 가진다.

## 현재 사용하는 RPC

- `set_post_pin()`: space manager 계열 사용자가 post pin/unpin을 처리한다.
- `soft_delete_post()`: post를 soft delete한다.
- `soft_delete_comment()`: comment를 placeholder로 바꾸고 soft delete한다.
- `finalize_post_attachment()`: Storage object를 post attachment row로 확정한다.
- `search_posts()`: 접근 가능한 post/comment를 검색 결과로 묶어 반환한다.
- service-role `purge_deleted_content('post'|'comment', ...)`는 soft-deleted row를 hard purge한다.

현재 SQL 기준으로 post/comment의 기본 작성과 수정은 RPC 전용이 아니라 direct SQL + RLS 경로도 함께 사용한다.

## 권한과 쓰기 경로

- 이 파일은 구조만 만든다.
- 실제 author stamping, space membership 기반 접근, count 갱신, soft delete 노출 규칙은 뒤 migration에서 결정된다.
- attachment finalize 역시 later storage migration에서 처리된다.

## 현재 주의점

- `comment_count`, `reaction_count`는 진실 원천이 아니라 cache 역할이다.
- 익명 표시 자체는 이 파일에서 계산하지 않고, 뒤 helper/RPC에서 해석한다.
- 현재 SQL 기준으로 `comment_count`, `reaction_count`는 write 시점 즉시 동기화가 아니라 `reconcile_cached_counts()` maintenance에 의존한다.

## 미구현 / 계약과 차이

- text length check, `pub_id` unique, pin/delete state check는 later constraint migration에서 붙는다.
- 댓글 1레벨 제한은 later trigger migration에서 강제된다.

## 기존 합의 세부 규칙

- 모든 post는 하나의 space에 속하고, 작성자는 그 space 멤버여야 한다.
- post/comment 검색은 `lower()` + 공백 제거 후 `ILIKE` 비교를 기준으로 한다.
- comments는 1레벨 답글만 허용하는 방향을 유지한다.
- 사용자 경로에서는 post/comment를 hard delete하지 않는다.
- 삭제 댓글은 답글이 있으면 placeholder로 노출하고, 답글이 없으면 숨기는 동작을 목표로 한다.
- 익명 표시명은 `anonymous_username`, 없으면 `익명 {author_id}`를 사용한다.
- post/message 첨부는 이미지, PDF, 일반 텍스트/Markdown/CSV/RTF, Word/Excel/PowerPoint, HWP/HWPX, OpenDocument allowlist를 사용한다.
- 파일 내용 기반 악성코드 검사는 수행하지 않고, 이미지 외 파일은 attachment disposition으로 다운로드하는 방향을 유지한다.
- post feed는 `(created_at DESC, id DESC)` keyset cursor를 사용한다.
- post title은 1 ~ 200자, post content는 1 ~ 50000자, comment content는 1 ~ 10000자를 목표로 한다.
- comment placeholder 문자열은 `삭제된 댓글입니다.`를 사용한다.

- comment placeholder 문자열은 `삭제된 댓글입니다.`를 사용한다.
