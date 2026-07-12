# 03. Content

Source: [`supabase/schemas/03-content.sql`](../../../supabase/schemas/03-content.sql)

space 안의 게시글 계층: `posts → comments`, post별 첨부 metadata. 익명 표시, soft delete 포함.

## 테이블

- `posts` — space 소속, 작성자, 제목/본문, 익명/고정 여부, soft delete. `category_id`로 그룹 게시판/말머리(`space_categories`) 하나에 선택적으로 속한다 (카테고리 삭제 시 `on delete set null`로 미분류)
- `post_attachments` — post 첨부 metadata (blob은 Storage `post-files`)
- `post_attachment_mime_types` — post 첨부가 받는 MIME과 타입별 `max_bytes`. `post_attachments.content_type`이 여기로 FK를 걸어 "글이 받지 않는 타입은 저장 자체가 불가"하게 만든다 (`message_attachment_mime_types`와 동형). 행은 seed라 마이그레이션에 산다
- `comments` — post 소속, `parent_id` self-reference (임의 깊이 대댓글 허용), soft delete. `content`는 nullable이다 — 답글이 달린 댓글은 삭제돼도 tombstone으로 계속 select되므로(`has_active_descendant`) 본문을 비울 수 있어야 한다. 살아있는 댓글의 본문은 `comments_content_present` check가 강제한다
- `post_mentions` / `comment_mentions` — 본문에서 언급된 사람 `(owner_id, user_id)`. **본문을 파싱하지 않는다** — 에디터가 고른 대상의 profile id를 그대로 저장한다. 파싱하려면 유니크 handle이 필요한데 `profiles`엔 `name`뿐이고 유니크도 아니라 동명이인을 가를 수 없다(게다가 코드블록·이메일 오탐이 따라붙는다). 이 테이블이 없으면 `space_members`의 **기본** `notification_setting`인 `'mentions'`가 "아무 알림도 안 받음"과 같은 뜻이 된다. 익명 글/댓글도 멘션할 수 있다 — 이 행은 "누가 **언급됐나**"만 담고 "누가 언급했나"는 담지 않는다

## RPC

작성·수정은 RPC가 아니라 direct insert/update + RLS + 컬럼 grant다 (insert: posts `space_id,author_id,title,content,is_anonymous,category_id` / comments `post_id,author_id,parent_id,content,is_anonymous`. update: posts `title,content,category_id` / comments `content` — **`is_anonymous`는 update에 없다**(불변)).

고정·삭제만 RPC인 이유: `posts_update`/`comments_update` 정책이 `author_id=current_profile_id()`라 "**관리자가 남의 글을** 고정하거나 지운다"를 정책으로 표현할 수 없고, `pinned_by`/`deleted_by`는 클라이언트가 아니라 서버가 찍어야 한다.

**읽기가 RPC인 이유**: `posts.author_id`/`comments.author_id`의 select grant를 회수했기 때문이다(아래 "익명" 참고). 작성자를 붙여줄 수 있는 건 `security definer` 함수뿐이고, 그 함수가 `is_anonymous`면 `author`를 null로 지운다. 덤으로 댓글/반응 수(캐시 안 함)와 첨부를 한 번에 묶어 내려 N+1을 없앤다.

| 함수                                                                                                | 인증                                         | 쓰기 | 목적                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_space_posts(space_id, category_id?, before_id?, limit)`                                       | space 멤버                                   | X    | 피드. 고정 글은 첫 페이지에만 얹고 시간순 스트림에선 빼 두 번 나오지 않게 한다. 커서는 `id` 하나지만 정렬은 `(created_at, id)`라 행 비교로 `idx_posts_active_space_created_at`을 탄다. `author`(익명이면 null), `is_mine`, `category`, 댓글/반응 수, `top_reactions`, `my_reaction_id`, `attachments` 포함                        |
| `get_post(pub_id)`                                                                                  | post 접근 권한                               | X    | 상세 1건. 위와 같은 shape                                                                                                                                                                                                                                                                                                         |
| `get_post_comments(post_id, after_id?, limit?)`                                                     | post 접근 권한                               | X    | 댓글 평면 목록(트리는 `parent_id`로 클라이언트가 조립). **페이지네이션은 루트 댓글 단위**이고 그 루트의 자손은 전부 딸려 온다 — 평면 목록을 limit으로 자르면 부모 잘린 답글이 고아가 되어 트리가 끊긴다. 커서는 마지막 루트의 id. tombstone은 `is_deleted=true`에 `content`·`author` 모두 null                                    |
| `search_posts(query, space_id)`                                                                     | space 멤버                                   | X    | 공백 무시 제목·본문 검색. `search_messages`와 달리 SECURITY DEFINER다 — invoker로는 `author_id`를 못 읽고 익명 지우기도 못 한다                                                                                                                                                                                                   |
| `create_post_with_attachments(space_id, title, content, attachments?, category_id?, is_anonymous?)` | space 멤버                                   | O    | 글+첨부를 **한 트랜잭션**으로 만들고 `pub_id`를 돌려준다. 실패하면 아무것도 남지 않는다                                                                                                                                                                                                                                           |
| `set_post_attachments(post_id, attachments jsonb)`                                                  | 작성자 본인                                  | O    | 수정용. 첨부 목록을 통째로 교체. 빠진 blob만 삭제 큐로, `sort_order`는 배열 순서. 이미 붙어 있던 첨부는 스토리지 재확인을 건너뛴다(수정 시 blob이 24시간보다 오래됐을 수 있어서)                                                                                                                                                  |
| `set_post_pinned(id, pinned)`                                                                       | `can_curate_space` (owner/admin/**manager**) | O    | 게시물 고정/해제. **manager도 한다** — 고정은 게시판을 정리하는 일이지 사람을 다루는 일이 아니다([02-spaces](02-spaces.md)의 "역할"). 반대로 순수 게시판 권한이라 **작성자여도 자기 글을 고정할 수 없다**. 거절 메시지가 `'space curator required'`인 이유이기도 하다(`'space manager required'`는 owner/admin을 뜻해서 헷갈린다) |
| `soft_delete_post(id)`                                                                              | 작성자 본인 **또는** space 관리자            | O    | post soft delete + 첨부/반응 제거 + blob 삭제 큐 등록. 댓글은 손대지 않는다(`can_access_post`가 알아서 막음)                                                                                                                                                                                                                      |
| `soft_delete_comment(id)`                                                                           | 작성자 본인 **또는** space 관리자            | O    | comment soft delete + 반응 제거 + **본문 비움**(tombstone이 원문을 싣지 않도록)                                                                                                                                                                                                                                                   |
| `suspend_post_author_anonymity(post_id)`                                                            | space 관리자                                 | O    | 익명 글의 작성자를 **모른 채로** 그 사람의 익명 권한만 정지. 형량은 서버가 정한다(1→2→4→8일…, 90일 상한). `(suspended_days, strike_count, already_suspended)` 반환                                                                                                                                                                |
| `suspend_comment_author_anonymity(comment_id)`                                                      | space 관리자                                 | O    | 위와 같되 익명 댓글 대상                                                                                                                                                                                                                                                                                                          |
| `undo_post_anonymity_suspension(post_id)`                                                           | space 관리자                                 | O    | 오판 취소. 현재 정지를 풀고 누범 단계를 **하나** 되돌린다. **void**                                                                                                                                                                                                                                                               |
| `undo_comment_anonymity_suspension(comment_id)`                                                     | space 관리자                                 | O    | 위와 같되 익명 댓글 대상                                                                                                                                                                                                                                                                                                          |
| `purge_deleted_content(older_than?, limit?)`                                                        | service_role                                 | O    | 소프트 삭제된 글·댓글의 **하드 정리**(기본 30일 경과, 배치 100건). `(purged_posts, purged_comments)` 반환. 첨부 행이 남은 글은 건너뛴다(blob 청소가 먼저다)                                                                                                                                                                       |

### 소프트 삭제는 영원하지 않다 — `purge_deleted_content`

tombstone을 안 지우면 행이 무한히 쌓이는 것도 문제지만, 더 나쁜 건 **지운 익명 글의 `author_id`가 DB에 영구 보존된다**는 것이다. 익명은 시간이 지나도 익명이어야 한다.

- **blob이 먼저다.** 첨부는 `storage-maintenance`가 걷어간다(`enqueue_due_storage_cleanup`이 7일 지난 삭제 글의 첨부를 큐에 넣고, `complete_storage_cleanup`이 blob 삭제 후 `post_attachments` 행을 지운다). 그래서 이 RPC는 **첨부 행이 아직 남은 글을 건너뛴다.** `cleanup_conversation`은 같은 상황에서 예외를 던지지만, 여기는 배치라 글 하나 때문에 배치 전체가 죽으면 안 된다 — 다음 실행에 다시 만난다.
- **댓글은 잎부터 벗긴다.** `comments.parent_id`가 `on delete restrict`라 답글→루트 2단계로는 임의 깊이를 못 지운다. 자식이 없는 것만 지우는 루프를 자식이 안 남을 때까지 돈다(`cleanup_conversation`이 `messages`에 도는 것과 같은 루프).
- **살아 있는 답글이 달린 tombstone은 남는다.** 자식이 하나라도 있으면 잎이 아니라서 안 지워진다 — 그게 정확히 `comments_select`가 `has_active_descendant`로 그 tombstone을 계속 보여주는 조건이다(안 그러면 답글 사슬이 끊긴다). 자식이 전부 죽은 서브트리는 잎부터 차례로 걷혀 통째로 사라진다.
- 글을 지우면 그 글의 **살아 있는 댓글도 같이 간다.** 글이 없으면 어차피 아무도 못 보고(`can_access_post`), `comments.post_id`가 restrict라 남겨두면 글을 못 지운다.
- `notifications`·`post_mentions`·`comment_mentions`는 `on delete cascade`라 알아서 따라간다.
- **삭제된 space의 글은 아직 안 걷는다.** 그건 space 하드 정리(`cleanup_space`)가 할 일이고 멤버·카테고리·초대·정지 기록까지 같이 봐야 해서 spaces 도메인에 속한다.

### 익명 악용은 밴이 아니라 "익명 정지"로 다룬다

밴을 만들면 익명이 깨진다. 밴은 해제·감사·이의신청 때문에 **관리자가 밴 목록을 봐야만** 하는데, 익명 글의 작성자를 밴하면 그 목록에 새로 뜬 단 한 명이 곧 작성자다(집합 차집합 한 번). "누군지 안 보여준다"는 장식이고, 밴은 그냥 느린 unmask다.

익명 정지는 다르다. **스스로 만료되므로 관리자가 볼 이유가 없고**, 그래서 관리자에게 아무 관측 가능한 상태도 남기지 않을 수 있다 — `space_anonymity_suspensions`의 RLS가 행을 **본인에게만** 보여준다. 관리자는 효과만 얻고 정보는 못 얻는다. 처방도 더 정확하다: 문제가 "익명을 악용한다"면 뺏을 것은 익명이지 계정이 아니다.

형량은 관리자가 고르지 않는다 — **고를 수가 없다.** 이 사람이 초범인지 상습범인지 관리자는 알 수 없으니까(그게 익명의 조건이다). 서버는 이력을 아니까 대신 가중한다: **1일 → 2일 → 4일 → 8일…** 90일 상한. 이미 정지 중이면 형량을 쌓지 않고 남은 기간만 돌려준다.

시간이 지났다고 누범을 **자동으로 지우지 않는다.** 그러면 띄엄띄엄 반복하는 사람(넉 달에 한 번씩 악용)이 영원히 초범으로 남는다. 오판이었다면 관리자가 `undo_*_anonymity_suspension`으로 명시적으로 되돌린다.

### 취소는 "전과 말소"가 아니라 "이번 건 없던 일로"다

`undo_*`는 현재 정지를 풀고 누범 단계를 **하나만** 되돌린다. 2회차(2일)를 취소하면 다음 위반은 다시 2회차(2일)로 들어간다. 기록을 통째로 지우면 상습범이 한 번 봐줬다는 이유로 초범으로 돌아가 버린다. 단계가 0이 되면 행을 지운다(기록 없음 == 초범).

**`undo_*`는 반드시 void다.** "2회차를 취소했습니다"나 "기록이 없습니다" 같은 응답을 주면 그게 **공짜 probe**가 된다: 정지(`suspend_*`)는 다른 사람이면 애먼 사람을 처벌하는 비용이 들지만, 취소는 아무도 다치지 않으므로 관리자가 익명 글을 마음껏 찔러 작성자별로 묶을 수 있다. 그건 아래에서 감수하기로 한 유출보다 훨씬 나쁘다. 기록이 없어도 조용히 넘어간다 — "기록 없음"도 신호다.

관리자가 사후에 임의로 사면할 수는 없다(누가 누적을 갖고 있는지 못 보니까). 오직 그 글을 통해서만 되돌릴 수 있고, 그게 이 버튼의 유일한 용도다.

**의도적으로 감수하는 유출**: 두 RPC는 `(suspended_days, strike_count, already_suspended)`를 관리자에게 돌려준다. 기간(=누범 횟수)과 "이미 정지됨"을 알려주면 관리자가 익명 글 A와 B에 각각 걸어보고 **둘이 같은 사람인지** 알아낼 수 있다 — 이름은 몰라도 익명 글을 작성자별로 묶을 수 있고, 그 중 하나에 신원 단서가 섞이면 그 사람의 익명 글이 전부 까진다. 그래도 받아들이는 이유: (1) 신원은 여전히 안 샌다, 새는 건 연결뿐이다. (2) **probe가 공짜가 아니다** — "B가 A와 같은 사람인가"를 확인하려면 실제로 B 작성자를 정지시켜야 하고, 다른 사람이면 애먼 사람이 처벌을 먹고 항의한다. (3) 초범과 상습범을 구분 못 하면 모더레이션이 성립하지 않는다.

단, 이 정보는 **관리자가 실제로 행동했을 때만** 준다. `strike_count`는 select grant에서 빠져 있어 익명 글 목록에 상시로 뿌릴 수 없다 — 그러면 probe 비용 없이 공짜 작성자 지도가 나온다.

### 익명끼리는 서로 구분된다 (익명1, 익명2, 글쓴이)

`get_post_comments`가 `anonymous_label`을 내려준다. **번호를 서버가 매기는 게 핵심이다** — 클라이언트가 매기려면 작성자별 키가 필요한데 그게 곧 `author_id`고, 그러면 익명이 깨진다.

번호는 **그 글 안에서만 유효하다.** 같은 사람이 다른 글에선 다른 번호를 받으므로 여러 글에 걸쳐 "같은 익명"이라고 이어 붙일 수 없다. 페이지가 아니라 글 전체를 기준으로 세므로 2페이지의 "익명1"과 1페이지의 "익명1"은 같은 사람이다.

익명 글의 글쓴이가 자기 글에 단 익명 댓글은 **"글쓴이"**로 표시한다(신원은 여전히 안 드러난다 — 어차피 익명 글이니까). 글이 **실명**이면 "글쓴이" 라벨을 붙이지 않는다: 글쓴이가 누군지 다 아는데 그 라벨을 달면 익명 댓글이 곧바로 까진다.

강제는 RPC가 아니라 **트리거**(`trg_enforce_anonymous_allowed_*`)가 한다. posts/comments는 컬럼 grant로 직접 insert할 수 있어서, RPC에서만 막으면 테이블에 바로 꽂아 우회할 수 있다.

`purge_deleted_content`는 아직 없다.

### 첨부 흐름

저장소의 표준 2단계 모델(업로드 → finalize RPC)을 그대로 따른다. blob은 `post-files/{space.pub_id}/{auth_uid}/{uuid}`에 올라가고, **글보다 먼저** 올라간다.

```
1. blob 업로드              → post-files/{space.pub_id}/{uid}/{uuid}   (브라우저 직접)
2. create_post_with_attachments  → 글 + 첨부를 한 트랜잭션으로
```

**경로를 post가 아니라 space에 매단 이유**: 경로에 `post.pub_id`를 박으면 글이 먼저 존재해야만 업로드가 되고, 그러면 작성 → 업로드 → 확정 **3단계**가 된다. 중간에 실패하면 첨부 없는 글이 이미 게시된 채 남아 보상 트랜잭션(soft delete로 되감기)이 필요해지는데, **그 보상도 실패할 수 있어 유령 글이 영구히 남는다.** space에 매달면 실패 시 아무것도 만들어지지 않고, 올려둔 blob은 고아 청소가 걷어간다. 보안 성질은 message 첨부와 같다 — 내가 참여하는 공간의, 내 uid 경로에만 올릴 수 있다.

수정은 `set_post_attachments`가 목록을 통째로 교체한다. 이미 붙어 있던 첨부는 스토리지 재확인(24시간 신선도)을 건너뛰므로, 오래된 글의 첨부를 유지한 채 새 것만 추가할 수 있다.

메시지와 달리 글은 **이미지와 파일을 섞을 수 있다** (카드가 이미지 그리드와 파일 목록을 함께 렌더한다). 그래서 "여럿이면 전부 이미지" 규칙은 없고 개수 상한(`max_post_attachments()` = 10)만 있다.

## Private helper

| 함수                                                                    | 용도                                                                                                                                            |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `private.can_access_post(post_id)`                                      | 활성 post + `can_participate_space`(멤버이거나 `open` 공간의 accepted 사용자)                                                                   |
| `private.can_access_comment(comment_id)`                                | 활성 comment + `can_access_post` 위임                                                                                                           |
| `private.has_active_descendant(comment_id)`                             | 임의 깊이 하위에 활성 답글이 있는지 (재귀, depth 50 상한). 삭제 comment를 tombstone으로 노출할지 판단                                           |
| `private.post_author(author_id, is_anonymous)`                          | 작성자를 jsonb로. 익명이면 null. 읽기 RPC들이 이걸로 익명을 지운다                                                                              |
| `private.validate_post_attachments(post_id, space_pub_id, attachments)` | 첨부 검증(MIME 허용·크기·경로·스토리지 객체 존재). create/set이 같은 규칙을 쓰도록 한 곳에                                                      |
| `private.suspend_anonymity(space_id, author_id)`                        | 익명 정지의 실제 구현. 형량 가중·no-op 판단이 여기                                                                                              |
| `private.max_post_attachments()`                                        | 10                                                                                                                                              |
| `private.max_mentions()`                                                | 20. 멘션 하나가 알림 하나라 상한이 없으면 글 한 개로 전교생에게 알림을 쏠 수 있다                                                               |
| `private.enforce_mention_limit()`                                       | 멘션 수 상한 트리거. `post_mentions`/`comment_mentions`는 소유자 컬럼 이름만 다르고 규칙이 같아서 그 이름을 `tg_argv`로 받아 한 함수가 처리한다 |

## Trigger

| 트리거                                   | 테이블             | 이벤트                                           | side effect                                                                                                                                                                                                                                                     |
| ---------------------------------------- | ------------------ | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `trg_validate_comment_parent`            | `comments`         | BEFORE INSERT/UPDATE of `post_id`,`parent_id`    | 답글 부모가 같은 post의 활성 comment가 아니면 예외 (깊이 제한 없음)                                                                                                                                                                                             |
| `trg_validate_post_category`             | `posts`            | BEFORE INSERT/UPDATE of `space_id`,`category_id` | `category_id`가 글과 다른 space의 카테고리면 예외 (같은 space 강제)                                                                                                                                                                                             |
| `trg_enforce_anonymous_allowed_posts`    | `posts`            | BEFORE INSERT                                    | 익명인데 그 space가 익명을 껐거나 작성자가 익명 정지 중이면 예외. **RPC가 아니라 트리거인 이유**: posts/comments는 컬럼 grant로 직접 insert할 수 있어 RPC에서만 막으면 테이블에 바로 꽂아 우회된다                                                              |
| `trg_enforce_anonymous_allowed_comments` | `comments`         | BEFORE INSERT                                    | 위와 같음                                                                                                                                                                                                                                                       |
| `trg_enforce_post_attachment_shape`      | `post_attachments` | AFTER INSERT (statement)                         | 한 글의 첨부가 `max_post_attachments()`(10)를 넘으면 예외                                                                                                                                                                                                       |
| `trg_enforce_post_mention_limit`         | `post_mentions`    | BEFORE INSERT                                    | 한 글의 멘션이 `max_mentions()`(20)를 넘으면 예외                                                                                                                                                                                                               |
| `trg_enforce_comment_mention_limit`      | `comment_mentions` | BEFORE INSERT                                    | 위와 같음                                                                                                                                                                                                                                                       |
| `trg_mark_post_edited`                   | `posts`            | BEFORE UPDATE of `title`,`content`,`category_id` | 제목·본문 trim + 실제로 바뀌었으면 `updated_at=now()` 스탬프. 고정(`pinned_at`)이나 삭제(`deleted_at`)만 바꾸는 UPDATE는 이 컬럼들을 **언급하지 않으므로** 트리거가 돌지 않는다 — 고정이 "수정됨"을 찍지 않는다                                                 |
| `trg_mark_comment_edited`                | `comments`         | BEFORE UPDATE of `content`                       | 본문 trim + `updated_at` 스탬프. **삭제는 수정이 아니다**: `soft_delete_comment`도 `content`를 건드리므로(원문을 비운다) 트리거가 돌지만, `deleted_at`이 찍히는 UPDATE에서는 스탬프하지 않는다 — 안 그러면 tombstone의 `updated_at`이 "삭제한 시각"이 돼 버린다 |

알림을 만드는 트리거(`trg_notify_on_comment`, `trg_notify_on_post_mention`, `trg_notify_on_comment_mention`, `trg_notify_on_post_removed`, `trg_notify_on_comment_removed`)는 이 테이블들에 걸려 있지만 정의는 [06-notifications](06-notifications.md)에 있다.

## 주의

- **`is_anonymous`는 작성 시점에만 정해지고 그 뒤로는 불변이다.** posts의 update 컬럼 grant는 `title,content,category_id`뿐이고(comments는 `content`뿐) `is_anonymous`가 빠져 있다. 익명으로 쓴 글을 나중에 실명으로 까는 것(익명을 믿고 반응한 사람들이 이미 있다)과, 실명 글을 뒤늦게 익명으로 숨기는 것(이미 본 사람은 아는데 새로 보는 사람만 못 보는 반쪽짜리 익명)을 둘 다 막는다.
- **익명이 익명이려면 `author_id`를 클라이언트가 못 읽어야 한다.** `is_anonymous`는 표시 플래그일 뿐이고 RLS는 `author_id`를 가려주지 않으므로, 테이블 전체 select를 주면 `select author_id from posts where is_anonymous`로 익명 글 작성자 명단이 그대로 나온다. 그래서 posts/comments의 select는 **컬럼 단위**이고 `author_id`·`deleted_by`(모더레이터 신원)·`pinned_by`는 빠져 있다. 작성자는 읽기 RPC가 익명이면 null로 지워 내려준다. `is_mine`은 익명이어도 true다 — 자기 글엔 수정/삭제가 떠야 하고, 그 사실은 남에게 새지 않는다(남에겐 false).
- 글 읽기/쓰기 권한은 `can_participate_space` = 해당 space의 멤버인지로 판단한다(모든 공간이 멤버십을 요구). comments/reactions/attachments도 `can_access_post`를 통해 동일하게 적용된다.
- author 자동 스탬핑은 없다. RLS policy가 `author_id = current_profile_id()`를 검사하므로 클라이언트가 insert 시 author_id를 명시해야 한다(insert grant엔 남아 있고, select에서만 회수했다).
- 댓글 수·리액션 수는 **캐시하지 않는다.** 읽는 쪽에서 `count(*)`로 센다. comments와 post_reactions는 클라이언트가 컬럼 grant로 직접 쓰므로 카운터를 걸 RPC 병목이 없고, 트리거로 캐시하면 댓글 하나마다 post 행에 락이 걸린다. 읽기 계약은 어느 쪽이든 같으니, 측정이 요구하면 그때 컬럼+트리거+backfill로 되돌리면 된다. (`spaces.member_count`는 join/leave가 RPC를 거치므로 캐시한다.)
- 소프트 삭제된 댓글은 답글이 살아 있으면 tombstone으로 계속 select된다. 그래서 `soft_delete_comment`가 `content`를 비우고, `get_post_comments`는 `author`까지 지워 `is_deleted=true`만 내린다 — 안 비우면 "삭제된 댓글"이 원문과 작성자를 그대로 실어 보낸다.
- 공백 제거 + `lower()` 기반 trgm 인덱스는 `search_posts`가 같은 표현식으로 비교할 때만 쓰인다. PostgREST로는 그 함수 표현식을 못 써서 직접 조회로는 인덱스를 못 탄다.
- **멘션 대상은 그 공간의 멤버여야 한다**(`post_mentions_insert`/`comment_mentions_insert` 정책). 이 검사가 없으면 읽지도 못하는 글의 알림을 받게 되고(딥링크를 눌러도 막힌다), 나아가 아무 공간에서나 아무에게나 알림을 쏘는 통로가 된다. 멘션은 작성자만 달고 update는 없다 — 붙이거나 떼거나 둘 중 하나다. insert grant가 컬럼 단위(`created_at` 제외)인 이유는 클라이언트가 멘션 시각을 소급해 꾸미지 못하게 하려는 것이다.
- **메인 글 작성은 `can_participate_space`가 아니라 `can_post_in_space`가 연다.** 공간의 `post_policy`가 `'managers'`면 owner/admin/manager만 글을 쓴다(공지형 그룹 — [02-spaces](02-spaces.md)의 "역할" 절). 검사는 `posts_insert` 정책 **과** `create_post_with_attachments` **양쪽**에 있다: 후자는 `security definer`라 RLS를 지나치므로 정책만 고치면 그대로 뒷문이 된다. `comments_insert`는 건드리지 않는다 — 공지에 달리는 반응까지 잠그면 게시판이 아니라 공고문이다.
- **`updated_at`은 서버가 찍는다.** update 컬럼 grant에 `updated_at`이 없어서 클라이언트는 못 쓴다(쓸 수 있으면 수정 시각을 소급해 꾸밀 수 있다). `trg_mark_post_edited`/`trg_mark_comment_edited`가 BEFORE 트리거로 `NEW`를 고치는데, 컬럼 grant는 **문장의 SET 절만** 보므로 트리거의 쓰기와는 무관하다(`messages.edited_at`과 같은 구조). 이 트리거가 붙기 전까지 두 컬럼은 **영원히 null**이었다 — 컬럼도 있고 읽기 RPC가 내려주기까지 했는데 아무도 쓰지 않아 "수정됨" 표시가 원리적으로 불가능했다.
- 멘션을 뗐다 다시 붙여도 알림은 다시 안 간다. `uq_notifications_post_mention`(사람당 글당 하나)과 `uq_notifications_comment_event`(사람당 댓글당 하나)가 재발송을 막는다 — 없으면 멘션 토글이 알림 스팸 버튼이 된다.
