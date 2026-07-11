# 03. Content

Source: [`supabase/schemas/03-content.sql`](../../../supabase/schemas/03-content.sql)

space 안의 게시글 계층: `posts → comments`, post별 첨부 metadata. 익명 표시, soft delete 포함.

## 테이블

- `posts` — space 소속, 작성자, 제목/본문, 익명/고정 여부, soft delete. `category_id`로 그룹 게시판/말머리(`space_categories`) 하나에 선택적으로 속한다 (카테고리 삭제 시 `on delete set null`로 미분류)
- `post_attachments` — post 첨부 metadata (blob은 Storage `post-files`)
- `comments` — post 소속, `parent_id` self-reference (임의 깊이 대댓글 허용), soft delete

## RPC

없음. post/comment의 작성·수정은 direct insert/update + RLS + 컬럼 grant로 처리한다 (insert 가능 컬럼: posts `space_id,author_id,title,content,is_anonymous,category_id`; comments `post_id,author_id,parent_id,content,is_anonymous`). `set_post_pin`, `soft_delete_post/comment`, `search_posts`, `finalize_post_attachment`, `purge_deleted_content`는 2026-07 정리에서 제거됐다.

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
| `trg_validate_post_category` | `posts` | BEFORE INSERT/UPDATE of `space_id`,`category_id` | `category_id`가 글과 다른 space의 카테고리면 예외 (같은 space 강제) |

## 주의

- 글 읽기/쓰기 권한은 `can_participate_space` = 해당 space의 멤버인지로 판단한다(모든 공간이 멤버십을 요구). comments/reactions/attachments도 `can_access_post`를 통해 동일하게 적용된다.
- author 자동 스탬핑은 없다. RLS policy가 `author_id = current_profile_id()`를 검사하므로 클라이언트가 author_id를 명시해야 한다.
- 댓글 수·리액션 수는 **캐시하지 않는다.** 읽는 쪽에서 `count(*)`로 센다. comments와 post_reactions는 클라이언트가 컬럼 grant로 직접 쓰므로 카운터를 걸 RPC 병목이 없고, 트리거로 캐시하면 댓글 하나마다 post 행에 락이 걸린다. 읽기 계약은 어느 쪽이든 같으니, 측정이 요구하면 그때 컬럼+트리거+backfill로 되돌리면 된다. (`spaces.member_count`는 join/leave가 RPC를 거치므로 캐시한다.)
- 공백 제거 + `lower()` 기반 trgm 검색 인덱스는 있지만 이를 쓰던 `search_posts` RPC는 제거된 상태다.
- 첨부 생성 경로(`finalize_post_attachment`)가 제거돼 post 첨부는 현재 만들 수 없다.
