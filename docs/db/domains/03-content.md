# 03. Content

Source: [`supabase/schemas/03-content.sql`](../../../supabase/schemas/03-content.sql)

space 안의 게시글 계층: `posts → comments`, post별 첨부 metadata. 익명 표시, soft delete 포함.

## 테이블

- `posts` — space 소속, 작성자, 제목/본문, 익명/고정 여부, soft delete. `category_id`로 그룹 게시판/말머리(`space_categories`) 하나에 선택적으로 속한다 (카테고리 삭제 시 `on delete set null`로 미분류)
- `post_attachments` — post 첨부 metadata (blob은 Storage `post-files`)
- `post_attachment_mime_types` — post 첨부가 받는 MIME과 타입별 `max_bytes`. `post_attachments.content_type`이 여기로 FK를 걸어 "글이 받지 않는 타입은 저장 자체가 불가"하게 만든다 (`message_attachment_mime_types`와 동형). 행은 seed라 마이그레이션에 산다
- `comments` — post 소속, `parent_id` self-reference (임의 깊이 대댓글 허용), soft delete. `content`는 nullable이다 — 답글이 달린 댓글은 삭제돼도 tombstone으로 계속 select되므로(`has_active_descendant`) 본문을 비울 수 있어야 한다. 살아있는 댓글의 본문은 `comments_content_present` check가 강제한다

## RPC

작성·수정은 RPC가 아니라 direct insert/update + RLS + 컬럼 grant다 (insert: posts `space_id,author_id,title,content,is_anonymous,category_id` / comments `post_id,author_id,parent_id,content,is_anonymous`. update: posts `title,content,is_anonymous,category_id` / comments `content`).

고정·삭제만 RPC인 이유: `posts_update`/`comments_update` 정책이 `author_id=current_profile_id()`라 "**관리자가 남의 글을** 고정하거나 지운다"를 정책으로 표현할 수 없고, `pinned_by`/`deleted_by`는 클라이언트가 아니라 서버가 찍어야 한다.

**읽기가 RPC인 이유**: `posts.author_id`/`comments.author_id`의 select grant를 회수했기 때문이다(아래 "익명" 참고). 작성자를 붙여줄 수 있는 건 `security definer` 함수뿐이고, 그 함수가 `is_anonymous`면 `author`를 null로 지운다. 덤으로 댓글/반응 수(캐시 안 함)와 첨부를 한 번에 묶어 내려 N+1을 없앤다.

| 함수 | 인증 | 쓰기 | 목적 |
| --- | --- | --- | --- |
| `list_space_posts(space_id, category_id?, before_id?, limit)` | space 멤버 | X | 피드. 고정 글은 첫 페이지에만 얹고 시간순 스트림에선 빼 두 번 나오지 않게 한다. 커서는 `id` 하나지만 정렬은 `(created_at, id)`라 행 비교로 `idx_posts_active_space_created_at`을 탄다. `author`(익명이면 null), `is_mine`, `category`, 댓글/반응 수, `top_reactions`, `my_reaction_id`, `attachments` 포함 |
| `get_post(pub_id)` | post 접근 권한 | X | 상세 1건. 위와 같은 shape |
| `get_post_comments(post_id)` | post 접근 권한 | X | 댓글 평면 목록(트리는 `parent_id`로 클라이언트가 조립). tombstone은 `is_deleted=true`에 `content`·`author` 모두 null |
| `search_posts(query, space_id)` | space 멤버 | X | 공백 무시 제목·본문 검색. `search_messages`와 달리 SECURITY DEFINER다 — invoker로는 `author_id`를 못 읽고 익명 지우기도 못 한다 |
| `set_post_attachments(post_id, attachments jsonb)` | 작성자 본인 | O | 첨부 목록을 통째로 교체. 빠진 blob만 삭제 큐로, `sort_order`는 배열 순서. 이미 붙어 있던 첨부는 스토리지 재확인을 건너뛴다(수정 시 blob이 24시간보다 오래됐을 수 있어서) |
| `set_post_pinned(id, pinned)` | space 관리자 (`can_manage_space`) | O | 게시물 고정/해제. 순수 모더레이션이라 작성자여도 자기 글을 고정할 수 없다 |
| `soft_delete_post(id)` | 작성자 본인 **또는** space 관리자 | O | post soft delete + 첨부/반응 제거 + blob 삭제 큐 등록. 댓글은 손대지 않는다(`can_access_post`가 알아서 막음) |
| `soft_delete_comment(id)` | 작성자 본인 **또는** space 관리자 | O | comment soft delete + 반응 제거 + **본문 비움**(tombstone이 원문을 싣지 않도록) |

`purge_deleted_content`는 아직 없다.

### 첨부 흐름은 chat과 반대다

`post_files_insert` 스토리지 정책이 경로를 `<post.pub_id>/<auth.uid()>/<uuid>`로 강제하고 **그 글이 실재하며 내 글일 것**을 요구한다. 그래서 순서가 **작성 → 업로드 → `set_post_attachments`**다. (chat은 대화가 이미 있으니 업로드 → `send_message_with_attachments` 한 번에 끝난다.) 첨부 없이 저장된 글은 그냥 첨부 없는 글이고, 확정되지 않은 blob은 고아 청소가 걷어간다.

메시지와 달리 글은 **이미지와 파일을 섞을 수 있다** (카드가 이미지 그리드와 파일 목록을 함께 렌더한다). 그래서 "여럿이면 전부 이미지" 규칙은 없고 개수 상한(`max_post_attachments()` = 10)만 있다.

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

- **익명이 익명이려면 `author_id`를 클라이언트가 못 읽어야 한다.** `is_anonymous`는 표시 플래그일 뿐이고 RLS는 `author_id`를 가려주지 않으므로, 테이블 전체 select를 주면 `select author_id from posts where is_anonymous`로 익명 글 작성자 명단이 그대로 나온다. 그래서 posts/comments의 select는 **컬럼 단위**이고 `author_id`·`deleted_by`(모더레이터 신원)·`pinned_by`는 빠져 있다. 작성자는 읽기 RPC가 익명이면 null로 지워 내려준다. `is_mine`은 익명이어도 true다 — 자기 글엔 수정/삭제가 떠야 하고, 그 사실은 남에게 새지 않는다(남에겐 false).
- 글 읽기/쓰기 권한은 `can_participate_space` = 해당 space의 멤버인지로 판단한다(모든 공간이 멤버십을 요구). comments/reactions/attachments도 `can_access_post`를 통해 동일하게 적용된다.
- author 자동 스탬핑은 없다. RLS policy가 `author_id = current_profile_id()`를 검사하므로 클라이언트가 insert 시 author_id를 명시해야 한다(insert grant엔 남아 있고, select에서만 회수했다).
- 댓글 수·리액션 수는 **캐시하지 않는다.** 읽는 쪽에서 `count(*)`로 센다. comments와 post_reactions는 클라이언트가 컬럼 grant로 직접 쓰므로 카운터를 걸 RPC 병목이 없고, 트리거로 캐시하면 댓글 하나마다 post 행에 락이 걸린다. 읽기 계약은 어느 쪽이든 같으니, 측정이 요구하면 그때 컬럼+트리거+backfill로 되돌리면 된다. (`spaces.member_count`는 join/leave가 RPC를 거치므로 캐시한다.)
- 소프트 삭제된 댓글은 답글이 살아 있으면 tombstone으로 계속 select된다. 그래서 `soft_delete_comment`가 `content`를 비우고, `get_post_comments`는 `author`까지 지워 `is_deleted=true`만 내린다 — 안 비우면 "삭제된 댓글"이 원문과 작성자를 그대로 실어 보낸다.
- 공백 제거 + `lower()` 기반 trgm 인덱스는 `search_posts`가 같은 표현식으로 비교할 때만 쓰인다. PostgREST로는 그 함수 표현식을 못 써서 직접 조회로는 인덱스를 못 탄다.
