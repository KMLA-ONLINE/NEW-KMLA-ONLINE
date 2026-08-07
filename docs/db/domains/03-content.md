# 03. Content

Source: [`supabase/schemas/03-content.sql`](../../../supabase/schemas/03-content.sql)

space 안의 게시글 계층: `posts → comments`, 첨부, 멘션. 익명·soft delete 포함.

## 테이블

- `posts` — space 소속, 작성자, 제목/본문, 익명/운영진 귀속/고정 여부, soft delete. `category_id`로 말머리 하나에 선택적으로 속한다
- `post_attachments` — 첨부 metadata (blob은 Storage `post-files`)
- `post_attachment_mime_types` — 받아들이는 MIME과 타입별 `max_bytes`. `post_attachments.content_type`이 FK를 걸어 **글이 안 받는 타입은 저장 자체가 불가**. 행은 seed라 migration에 산다
- `comments` — `parent_id` self-reference (최대 30단계). **`content`가 nullable**인 이유는 아래 tombstone 참고
- `post_mentions` / `comment_mentions` — 언급된 사람 `(post_id|comment_id, user_id)`. **본문을 파싱하지 않는다** — 에디터가 고른 profile id를 그대로 저장한다. `profiles.name`엔 유니크 제약이 없어 동명이인을 가를 수 없고, 파싱은 코드블록·이메일 오탐을 부른다. `required` 공간에서는 의미론적 멘션 행을 만들 수 없다

## RPC

글 생성은 첨부 유무와 관계없이 `create_post_with_attachments` 하나로 간다. 글 수정과 댓글 작성·수정은 direct insert/update + RLS + 컬럼 grant를 사용하고, 첨부 교체·고정·삭제·익명 정지는 RPC가 맡는다.

**읽기가 RPC인 이유**: `author_id`의 select grant를 회수했으므로(아래 "익명") 작성자를 붙여줄 수 있는 건 security definer 함수뿐이고, 그 함수가 익명이면 `author`를 null로 지운다. 덤으로 댓글/반응 수와 첨부를 한 번에 묶어 N+1을 없앤다.

### 읽기

| 함수                                                          | 인증              | 쓰기 | 목적                                                                                                                                       |
| ------------------------------------------------------------- | ----------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `list_space_posts(space_id, category_id?, before_id?, limit)` | space 멤버        | X    | 피드. `created_at`·`updated_at`을 함께 내려 수정 표기를 지원하며, 고정 글은 첫 페이지에만 얹고 시간순 스트림에선 빼 두 번 나오지 않게 한다 |
| `list_feed_posts(before_id?, limit?)`                         | 멤버인 모든 space | X    | 홈 피드. 고정 글 우선 없이 모든 멤버 space의 글을 `(created_at, id)` 내림차순으로 합치며, 출처 `space{name,type,pub_id}`를 함께 반환한다   |
| `get_post(pub_id)`                                            | post 접근 권한    | X    | 상세 1건. 위와 같은 shape (`updated_at` 포함)                                                                                              |
| `get_post_comments(post_id, after_id?, limit?)`               | post 접근 권한    | X    | `created_at`·`updated_at`을 포함한 댓글 평면 목록. **페이지네이션은 루트 댓글 단위**이고 자손은 전부 딸려 온다(아래)                       |
| `search_posts(query, space_id)`                               | space 멤버        | X    | 공백 무시 제목·본문 검색. SECURITY DEFINER — invoker로는 `author_id`를 못 읽는다                                                           |

`list_feed_posts`는 각 멤버 space에서 인덱스로 최신 `limit`개씩만 후보로 가져와 전체 페이지를 먼저 확정한다. 댓글·반응 수, 상위 반응, 첨부 집계는 그 페이지의 글에만 수행하므로 과거 글 전체를 집계하지 않는다.

`list_space_posts`/`list_feed_posts`/`get_post`는 글 작성자의, `get_post_comments`는 각 댓글 작성자의 현재 익명 정지 여부를 `is_author_anonymity_suspended`로 내린다. 클라이언트는 이 값이 `true`일 때만 "익명 제한 취소"를 표시한다.

**`can_manage_space`가 아니면 이 값은 항상 `false`다.** 멤버 전원에게 상시로 뿌리면 누구나 익명 글 목록을 훑어 "지금 정지 중인 사람이 쓴 글"을 공짜로 골라낼 수 있다 — 아래 "익명 악용" 절이 `suspend_*`의 응답에 대해 명시적으로 감수하기로 한 유출(같은 사람인지 연결)을, 그 행동(정지 실행)에 드는 비용 없이 통째로 열어주는 셈이라 훨씬 나쁘다. 관리자에게만 보여도 그 연결 위험 자체는 남지만, 그건 이미 정지를 실행할 수 있는 바로 그 사람이라 새로운 위협면이 아니다.

### 글과 첨부

| 함수                                                          | 인증                | 쓰기 | 목적                                                                              |
| ------------------------------------------------------------- | ------------------- | ---- | --------------------------------------------------------------------------------- |
| `create_post_with_attachments(space_id, title, content, ...)` | `can_post_in_space` | O    | 글+첨부를 **한 트랜잭션**으로. 실패하면 아무것도 안 남는다                       |
| `set_post_attachments(post_id, attachments)`                  | 작성자 본인         | O    | 수정용. 목록 통째 교체. 이미 붙은 첨부는 스토리지 재확인(24h 신선도)을 건너뛴다  |

### 게시판 관리와 익명 정지

| 함수                                                 | 인증                                  | 쓰기 | 목적                                                                                               |
| ---------------------------------------------------- | ------------------------------------- | ---- | -------------------------------------------------------------------------------------------------- |
| `set_post_pinned(id, pinned)`                        | `can_curate_space` (**manager 포함**) | O    | 고정/해제. 게시판 권한이라 **작성자여도 자기 글은 못 고정한다**                                   |
| `soft_delete_post(id)` / `soft_delete_comment(id)`   | 작성자 **또는** 관리자                | O    | soft delete + 반응/첨부 정리 + blob 삭제 큐. 최상위 댓글은 하위 트리까지 함께 숨기고, 답글은 본문만 비운다 |
| `suspend_post_author_anonymity(post_id)`             | 관리자                                | O    | 작성자를 **모른 채로** 익명 권한을 7일 정지. 활성 정지는 연장하지 않으며 **void**                  |
| `undo_post_anonymity_suspension(post_id)`            | 관리자                                | O    | 오판 취소. 현재 정지 행을 삭제하며 **void**                                                        |
| `suspend_comment_author_anonymity(comment_id)`       | 관리자                                | O    | 위와 같음 (댓글)                                                                                   |
| `undo_comment_anonymity_suspension(comment_id)`      | 관리자                                | O    | 위와 같음 (댓글)                                                                                   |

### 운영 정리

| 함수                                      | 인증         | 쓰기 | 목적                                                   |
| ----------------------------------------- | ------------ | ---- | ------------------------------------------------------ |
| `purge_deleted_content(older_than?, limit?)` | service_role | O    | soft delete된 글·댓글 하드 정리 (기본 7일, 배치 100) |
**메인 글 작성은 `create_post_with_attachments`만 연다.** 함수가 `can_post_in_space`를 호출하므로 `post_policy='managers'`면 owner/admin/manager만 쓴다([02-spaces](02-spaces.md)). 첨부가 없는 글도 빈 배열을 넘긴다. `comments_insert`는 그대로 열려 있다 — 공지에 달리는 반응까지 잠그면 게시판이 아니라 공고문이다.

## 익명

**익명이 익명이려면 `author_id`를 클라이언트가 못 읽어야 한다.** `is_anonymous`는 표시 플래그일 뿐이고 RLS는 컬럼을 가려주지 않으므로, 테이블 전체 select를 주면 `select author_id from posts where is_anonymous`로 작성자 명단이 그대로 나온다. 그래서 select는 **컬럼 단위**이고 `author_id`·`deleted_by`(모더레이터 신원)·`pinned_by`가 빠져 있다.

`is_mine`은 익명이어도 true다 — 자기 글엔 수정/삭제가 떠야 하고, 그 사실은 남에게 안 샌다(남에겐 false).

**`is_anonymous`는 작성 시점에만 정해지고 불변이다**(update grant에 없다). 익명 글을 나중에 실명으로 까는 것도, 실명 글을 뒤늦게 익명으로 숨기는 것(이미 본 사람은 아는 반쪽짜리 익명)도 막는다.

`author_attribution='staff'`도 작성 시점 스냅샷이며 update할 수 없다. 이 경우 `is_anonymous=true`를 유지하면서 읽기 RPC는 개인 `author`와 `anonymous_label` 대신 운영진 귀속만 내린다. 공식/비공식 운영진 규칙은 [02-spaces](02-spaces.md)의 익명 정책에 있다.

### 익명끼리는 서로 구분된다 (익명1, 익명2, 글쓴이)

`get_post_comments`가 `anonymous_label`을 내려준다. **번호를 서버가 매기는 게 핵심이다** — 클라이언트가 매기려면 작성자별 키가 필요한데 그게 곧 `author_id`다.

번호는 **그 글 안에서만 유효하다**(같은 사람이 다른 글에선 다른 번호). 익명 글의 글쓴이가 자기 글에 단 익명 댓글은 "글쓴이"로 표시하지만, 글이 **실명이면 그 라벨을 안 붙인다** — 글쓴이가 누군지 다 아는데 라벨을 달면 익명 댓글이 곧바로 까진다.

### 익명 악용은 밴이 아니라 "익명 정지"로 다룬다

밴을 만들면 익명이 깨진다. 밴은 해제·이의신청 때문에 **관리자가 목록을 봐야만** 하는데, 익명 글 작성자를 밴하면 그 목록에 새로 뜬 한 명이 곧 작성자다(집합 차집합 한 번). 밴은 그냥 느린 unmask다.

익명 정지 행은 RLS로 본인만 직접 읽는다. 관리자는 목록이나 신원을 열람하지 못하고, 콘텐츠별 현재 정지 여부만 본다.

**정지는 항상 7일이다.** 누범 이력이나 가중 형량은 없다. 이미 정지 중인 작성자에게 다시 실행하면 기한을 연장하거나 알림을 다시 만들지 않고 조용히 끝난다.

`undo_*`는 현재 정지 행을 삭제한다. 정지와 해제는 모두 `void`이고, 관리자는 익명 콘텐츠를 통해서만 실행할 수 있다.

**의도적으로 감수하는 유출**: 관리자용 읽기 RPC는 콘텐츠 작성자의 현재 정지 여부를 내려주므로, 정지 후 여러 익명 콘텐츠가 동시에 "해제" 상태로 바뀌면 같은 작성자임을 연결할 수 있다. 실제 신원과 정지 사용자 목록은 계속 숨긴다.

### 실패 이유는 구분해서 던진다 (감수하는 오라클)

네 진입점(`suspend_*` / `undo_*` × 글 / 댓글)은 실패를 **뭉개지 않는다**.

| 상황                              | 예외                                            |
| --------------------------------- | ----------------------------------------------- |
| 로그인 안 됨 / 미승인 프로필      | `active profile required`                       |
| 콘텐츠가 없거나 이미 삭제됨       | `post not found` / `comment not found`          |
| 콘텐츠는 있는데 **실명**          | `anonymous post required` / `anonymous comment required` |
| 익명인데 그 space 관리자가 아님   | `space manager required`                        |

**`soft_delete_post`와 반대 선택이다.** 그쪽은 권한 조건을 SELECT에 합쳐 "없는 글"과 "권한 없는 글"을 똑같이 0행으로 만든다 — 비공개 space에 살아있는 글 수를 세는 오라클을 막기 위해서다. 여기서는 그 오라클을 감수한다: 임의의 id를 찔러 "이건 살아있는 익명 글이다"를 **한 비트** 알아낼 수 있지만, 신원도 내용도 어느 space인지도 안 샌다. 대신 관리자 화면이 "이미 지워진 글입니다"와 "권한이 없습니다"를 다르게 말할 수 있다.

해석과 권한 확인은 `private.require_anonymous_post_author` / `require_anonymous_comment_author`가 공통으로 처리한다. 그럼에도 `private.suspend_anonymity` / `undo_anonymity_suspension` 안의 `can_manage_space` 검사는 **그대로 남겨둔다** — 저 둘은 `(space_id, author_id)`를 직접 받으므로 helper를 안 거치는 호출자가 생기면 곧바로 무방비가 된다.

## 첨부

blob은 `post-files/{space.pub_id}/{uuid}`에 **글보다 먼저** 올라가고, `create_post_with_attachments`가 글+첨부를 한 트랜잭션으로 만든다. 경로에 업로더 uid가 없는 이유는 익명이다 — [09-storage](09-storage.md) 참고.

**경로를 post가 아니라 space에 매단 이유**: 경로에 `post.pub_id`를 박으면 글이 먼저 존재해야 업로드가 되고, 작성 → 업로드 → 확정 **3단계**가 된다. 중간에 실패하면 첨부 없는 글이 게시된 채 남아 보상 트랜잭션이 필요해지는데, **그 보상도 실패할 수 있어 유령 글이 영구히 남는다.** space에 매달면 실패 시 아무것도 안 생기고 올려둔 blob은 고아 청소가 걷어간다.

메시지와 달리 글은 **이미지와 파일을 섞을 수 있다**(카드가 둘 다 렌더한다). 그래서 "여럿이면 전부 이미지" 규칙은 없고 개수 상한(10)만 있다. 상한은 글 생성·첨부 교체 RPC가 공유하는 `validate_post_attachments`에서 강제한다.

## Soft delete와 purge

**tombstone**: 삭제된 댓글은 답글이 살아 있으면 계속 select된다(`has_active_descendant`) — 없애면 답글 사슬이 끊긴다. 그래서 `soft_delete_comment`가 **`content`를 비우고**(그래서 컬럼이 nullable) 읽기 RPC가 별도로 `author`를 지워 `is_deleted=true`만 내린다. 본문을 비우지 않으면 삭제된 원문이 계속 노출된다.

**`purge_deleted_content`** (service_role 배치)가 tombstone을 하드 삭제한다. 행이 무한히 쌓이는 것도 문제지만, 더 나쁜 건 **지운 익명 글의 `author_id`가 영구 보존된다**는 것이다 — 익명은 시간이 지나도 익명이어야 한다.

- **blob이 먼저다.** 첨부는 `storage-maintenance`가 걷어간다. 그래서 이 RPC는 **첨부 행이 남은 글을 건너뛴다**(`cleanup_conversation`은 예외를 던지지만, 여기는 배치라 글 하나 때문에 전체가 죽으면 안 된다).
- **댓글은 잎부터 벗긴다.** `parent_id`가 restrict라 2단계로는 임의 깊이를 못 지운다. 자식 없는 것만 지우는 루프를 반복한다.
- **살아 있는 답글이 달린 tombstone은 남는다** — 자식이 있으면 잎이 아니다. 그게 정확히 그 tombstone을 계속 보여주는 조건이기도 하다. 전부 죽은 서브트리는 잎부터 걷혀 통째로 사라진다.
- 글을 지우면 살아 있는 댓글도 같이 간다(글이 없으면 어차피 못 보고, `post_id`가 restrict라 남기면 글을 못 지운다). `notifications`·`*_mentions`는 cascade.
- 삭제된 space의 글은 `purge_due_spaces`(spaces 도메인)가 걷는다 — soft delete 7일 뒤, 그 공간의 blob이 Storage에서 실제로 나간 다음에.

무엇이 언제 실제로 사라지는지는 [삭제·보존 정책](../deletion-policy.md)에 있다.

**딸려 간 답글의 `deleted_by`는 null로 둔다.** `notify_on_comment_removed`가 `deleted_by is not null and <> author_id`로 알림을 만들기 때문에, 최상위 댓글 삭제에 휩쓸린 답글에까지 삭제자를 찍으면 그 작성자 전원이 "모더레이션으로 삭제됨" 알림을 받는다 — 스레드가 접혔을 뿐인데. null이 곧 "캐스케이드로 딸려 갔다"는 표식이고, 그게 알림을 끄는 스위치다.

## Private helper

| 함수                                        | 용도                                                                         |
| ------------------------------------------- | ---------------------------------------------------------------------------- |
| `can_access_post(post_id)`                  | 활성 post + `can_participate_space`                                          |
| `can_access_comment(comment_id)`            | 활성 comment + `can_access_post`                                             |
| `has_active_descendant(comment_id)`         | 활성 자손이 있는지 재귀 검사. 생성 시 트리 깊이는 30단계로 제한             |
| `post_author(author_id, is_anonymous)`      | 작성자 jsonb. 익명이면 null                                                  |
| `validate_post_attachments(...)`            | 첨부 검증(MIME·크기·경로·object 존재). create/set이 같은 규칙을 쓰도록       |
| `suspend_anonymity(space_id, author_id)`    | 고정 7일 익명 정지. 이미 활성 상태면 no-op                                   |
| `require_anonymous_post_author(post_id)` / `require_anonymous_comment_author(comment_id)` | 콘텐츠 id → `(space_id, author_id)` + 권한 확인. 익명 정지·취소 진입점 4개의 공용 관문 |
| `max_post_attachments()` / `max_mentions()` | 10 / 20. 멘션 하나가 알림 하나라 상한이 없으면 글 하나로 전교생에게 쏜다     |
| `enforce_mention_limit()`                   | 멘션 상한 트리거. 두 테이블이 소유자 컬럼명만 다르므로 `tg_argv`로 받아 공용 |

## Trigger

### 입력·형태 검증

| 트리거                                   | 테이블             | 이벤트                                      | side effect                                                                                                                      |
| ---------------------------------------- | ------------------ | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `trg_validate_post_category`             | `posts`            | BEFORE I/U of `space_id`,`category_id`      | 다른 space의 카테고리면 예외                                                                                                     |
| `trg_enforce_anonymous_allowed_posts`    | `posts`            | BEFORE INSERT                               | 3단계 정책·운영진 귀속·익명 정지를 강제. 트리거 **함수**는 `private.enforce_content_anonymity`([02-spaces](02-spaces.md))        |
| `trg_enforce_post_mention_limit`         | `post_mentions`    | BEFORE INSERT                               | 멘션 20개 초과 시 예외                                                                                                           |
| `trg_validate_comment_parent`            | `comments`         | BEFORE I/U of `post_id`,`parent_id`         | 부모가 같은 post의 활성 comment가 아니거나 깊이가 30단계를 넘으면 예외                                                           |
| `trg_enforce_anonymous_allowed_comments` | `comments`         | BEFORE INSERT                               | 위와 같음                                                                                                                        |
| `trg_enforce_comment_mention_limit`      | `comment_mentions` | BEFORE INSERT                               | 위와 같음                                                                                                                        |

### 서버 소유 수정 상태

| 트리거                     | 테이블     | 이벤트                                           | side effect                                             |
| -------------------------- | ---------- | ------------------------------------------------ | ------------------------------------------------------- |
| `trg_mark_post_edited`    | `posts`    | BEFORE UPDATE of `title`,`content`,`category_id` | trim + `updated_at` 스탬프 (아래)                       |
| `trg_mark_comment_edited` | `comments` | BEFORE UPDATE of `content`                       | trim + `updated_at` 스탬프. **삭제엔 안 찍는다** (아래) |
알림 트리거(`trg_notify_on_*`)도 이 테이블들에 걸려 있지만 정의는 [06-notifications](06-notifications.md)에 있다.

## 주의

- **`updated_at`은 서버가 찍는다.** update 컬럼 grant에 없어서 클라이언트는 못 쓴다(쓸 수 있으면 수정 시각을 소급해 꾸민다). BEFORE 트리거가 `NEW`를 고치는 건 grant와 무관하다 — grant는 문장의 SET 절만 본다(`messages.edited_at`과 같은 구조). **고정도 삭제도 수정이 아니다**: `soft_delete_comment`는 `content`를 건드리므로 트리거가 돌지만 `deleted_at`이 찍히는 UPDATE에선 스탬프하지 않는다 — 안 그러면 tombstone의 `updated_at`이 "삭제한 시각"이 된다.
- **멘션 대상은 그 공간의 멤버여야 한다.** 아니면 읽지도 못하는 글의 알림을 받게 되고, 나아가 아무에게나 알림을 쏘는 통로가 된다. 멘션은 붙이거나 떼거나 둘 중 하나라 update가 없다. 뗐다 다시 붙여도 알림은 재발송되지 않는다(`uq_notifications_*` 인덱스) — 없으면 멘션 토글이 스팸 버튼이 된다.
- **댓글 수·반응 수는 캐시하지 않는다.** 클라이언트가 컬럼 grant로 직접 쓰므로 트리거 캐시가 필요하고, 그러면 댓글 하나마다 post 행에 락이 걸려 동시 작성이 직렬화된다. `spaces.member_count`는 멤버십 변경이 RPC를 거치므로 캐시한다.
- author 자동 스탬핑은 없다 — RLS가 `author_id = current_profile_id()`를 검사하므로 클라이언트가 insert 시 명시해야 한다(insert grant엔 남아 있고 select에서만 회수했다).
- trgm 검색 인덱스(공백 제거 + `lower()`)는 `search_posts`가 같은 표현식으로 비교할 때만 탄다. PostgREST 직접 조회로는 못 탄다.
