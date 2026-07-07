# 03. Content

Source: [`supabase/schemas/03-content.sql`](../../../supabase/schemas/03-content.sql)

space 안의 게시글 계층: `posts → comments`, post별 첨부 metadata. 익명 표시, soft delete, count 캐시 포함.

## 테이블

- `posts` — space 소속, 작성자, 제목/본문, 익명/고정 여부, `comment_count`/`reaction_count` 캐시, soft delete
- `post_attachments` — post 첨부 metadata (blob은 Storage `post-files`)
- `comments` — post 소속, `parent_id` self-reference (임의 깊이 대댓글 허용), soft delete

## RPC

없음. post/comment의 작성·수정은 direct insert/update + RLS + 컬럼 grant로 처리한다 (insert 가능 컬럼: posts `space_id,author_id,title,content,is_anonymous`; comments `post_id,author_id,parent_id,content,is_anonymous`). `set_post_pin`, `soft_delete_post/comment`, `search_posts`, `finalize_post_attachment`, `purge_deleted_content`는 2026-07 정리에서 제거됐다.

## Private helper

| 함수 | 용도 |
| --- | --- |
| `private.can_access_post(post_id)` | 활성 post + `can_participate_space`(멤버이거나 `open` 공간의 accepted 사용자) |
| `private.can_access_comment(comment_id)` | 활성 comment + `can_access_post` 위임 |
| `private.has_active_descendant(comment_id)` | 임의 깊이 하위에 활성 답글이 있는지 (재귀, depth 50 상한). 삭제 comment를 tombstone으로 노출할지 판단 |

## Trigger

| 트리거 | 테이블 | 이벤트 | side effect |
| --- | --- | --- | --- |
| `trg_validate_comment_parent` | `comments` | BEFORE INSERT/UPDATE of `post_id`,`parent_id` | 답글 부모가 같은 post의 활성 comment가 아니면 예외 (깊이 제한 없음) |

## 주의

- 글 읽기/쓰기 권한은 space의 `join_policy`를 따른다(`can_participate_space`): `open` 공간은 비멤버 accepted 사용자도 읽기·쓰기 가능, `public`/`invite_only`는 멤버만. comments/reactions/attachments도 `can_access_post`를 통해 동일하게 적용된다.
- author 자동 스탬핑은 없다. RLS policy가 `author_id = current_profile_id()`를 검사하므로 클라이언트가 author_id를 명시해야 한다.
- `comment_count`/`reaction_count`는 캐시이며 현재 갱신·재보정 경로가 없다.
- 공백 제거 + `lower()` 기반 trgm 검색 인덱스는 있지만 이를 쓰던 `search_posts` RPC는 제거된 상태다.
- 첨부 생성 경로(`finalize_post_attachment`)가 제거돼 post 첨부는 현재 만들 수 없다.
