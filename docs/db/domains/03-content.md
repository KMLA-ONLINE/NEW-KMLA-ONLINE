# 03. Content

Source: [`supabase/schemas/03-content.sql`](../../../supabase/schemas/03-content.sql)

space 안의 게시글 계층: `posts → comments`, 첨부, 멘션. 익명·soft delete 포함.

## 테이블

- `posts` — space 소속, 작성자, 제목/본문, 익명/고정 여부, soft delete. `category_id`로 말머리 하나에 선택적으로 속한다
- `post_attachments` — 첨부 metadata (blob은 Storage `post-files`)
- `post_attachment_mime_types` — 받아들이는 MIME과 타입별 `max_bytes`. `post_attachments.content_type`이 FK를 걸어 **글이 안 받는 타입은 저장 자체가 불가**. 행은 seed라 migration에 산다
- `comments` — `parent_id` self-reference (임의 깊이). **`content`가 nullable**인 이유는 아래 tombstone 참고
- `post_mentions` / `comment_mentions` — 언급된 사람 `(owner_id, user_id)`. **본문을 파싱하지 않는다** — 에디터가 고른 profile id를 그대로 저장한다. `profiles.name`엔 유니크 제약이 없어 동명이인을 가를 수 없고, 파싱은 코드블록·이메일 오탐을 부른다

## RPC

작성·수정은 RPC가 아니라 direct insert/update + RLS + 컬럼 grant다. 고정·삭제·정지만 RPC인 이유: `posts_update` 정책이 `author_id=current_profile_id()`라 "**관리자가 남의 글을** 건드린다"를 정책으로 표현할 수 없고, `pinned_by`/`deleted_by`는 서버가 찍어야 한다.

**읽기가 RPC인 이유**: `author_id`의 select grant를 회수했으므로(아래 "익명") 작성자를 붙여줄 수 있는 건 security definer 함수뿐이고, 그 함수가 익명이면 `author`를 null로 지운다. 덤으로 댓글/반응 수와 첨부를 한 번에 묶어 N+1을 없앤다.

| 함수                                                          | 인증                                  | 쓰기 | 목적                                                                                                                                       |
| ------------------------------------------------------------- | ------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `list_space_posts(space_id, category_id?, before_id?, limit)` | space 멤버                            | X    | 피드. `created_at`·`updated_at`을 함께 내려 수정 표기를 지원하며, 고정 글은 첫 페이지에만 얹고 시간순 스트림에선 빼 두 번 나오지 않게 한다 |
| `list_feed_posts(before_id?, limit?)`                         | 멤버인 모든 space                     | X    | 홈 피드. 고정 글 우선 없이 모든 멤버 space의 글을 `(created_at, id)` 내림차순으로 합치며, 출처 `space{name,type,pub_id}`를 함께 반환한다   |
| `get_post(pub_id)`                                            | post 접근 권한                        | X    | 상세 1건. 위와 같은 shape (`updated_at` 포함)                                                                                              |
| `get_post_comments(post_id, after_id?, limit?)`               | post 접근 권한                        | X    | `created_at`·`updated_at`을 포함한 댓글 평면 목록. **페이지네이션은 루트 댓글 단위**이고 자손은 전부 딸려 온다(아래)                       |
| `search_posts(query, space_id)`                               | space 멤버                            | X    | 공백 무시 제목·본문 검색. SECURITY DEFINER — invoker로는 `author_id`를 못 읽는다                                                           |
| `create_post_with_attachments(space_id, title, content, ...)` | `can_post_in_space`                   | O    | 글+첨부를 **한 트랜잭션**으로. 실패하면 아무것도 안 남는다                                                                                 |
| `set_post_attachments(post_id, attachments)`                  | 작성자 본인                           | O    | 수정용. 목록 통째 교체. 이미 붙은 첨부는 스토리지 재확인(24h 신선도)을 건너뛴다                                                            |
| `set_post_pinned(id, pinned)`                                 | `can_curate_space` (**manager 포함**) | O    | 고정/해제. 게시판 권한이라 **작성자여도 자기 글은 못 고정한다**                                                                            |
| `soft_delete_post(id)` / `soft_delete_comment(id)`            | 작성자 **또는** 관리자                | O    | soft delete + 반응/첨부 정리 + blob 삭제 큐. 댓글은 **본문을 비운다**                                                                      |
| `suspend_post_author_anonymity(post_id)`                      | 관리자                                | O    | 작성자를 **모른 채로** 익명 권한만 정지. `(suspended_days, strike_count, already_suspended)`                                               |
| `suspend_comment_author_anonymity(comment_id)`                | 관리자                                | O    | 위와 같음 (댓글)                                                                                                                           |
| `undo_post_anonymity_suspension(post_id)`                     | 관리자                                | O    | 오판 취소. 누범 단계를 **하나** 되돌린다. **void**                                                                                         |
| `undo_comment_anonymity_suspension(comment_id)`               | 관리자                                | O    | 위와 같음 (댓글)                                                                                                                           |
| `purge_deleted_content(older_than?, limit?)`                  | service_role                          | O    | soft delete된 글·댓글 하드 정리 (기본 30일, 배치 100)                                                                                      |

**메인 글 작성은 `can_post_in_space`가 연다** — `post_policy='managers'`면 owner/admin/manager만 쓴다([02-spaces](02-spaces.md)). 검사가 `posts_insert` 정책 **과** `create_post_with_attachments` **양쪽**에 있는 이유: 후자는 security definer라 RLS를 지나치므로 정책만 고치면 그대로 뒷문이 된다. `comments_insert`는 건드리지 않는다 — 공지에 달리는 반응까지 잠그면 게시판이 아니라 공고문이다.

## 익명

**익명이 익명이려면 `author_id`를 클라이언트가 못 읽어야 한다.** `is_anonymous`는 표시 플래그일 뿐이고 RLS는 컬럼을 가려주지 않으므로, 테이블 전체 select를 주면 `select author_id from posts where is_anonymous`로 작성자 명단이 그대로 나온다. 그래서 select는 **컬럼 단위**이고 `author_id`·`deleted_by`(모더레이터 신원)·`pinned_by`가 빠져 있다.

`is_mine`은 익명이어도 true다 — 자기 글엔 수정/삭제가 떠야 하고, 그 사실은 남에게 안 샌다(남에겐 false).

**`is_anonymous`는 작성 시점에만 정해지고 불변이다**(update grant에 없다). 익명 글을 나중에 실명으로 까는 것도, 실명 글을 뒤늦게 익명으로 숨기는 것(이미 본 사람은 아는 반쪽짜리 익명)도 막는다.

### 익명끼리는 서로 구분된다 (익명1, 익명2, 글쓴이)

`get_post_comments`가 `anonymous_label`을 내려준다. **번호를 서버가 매기는 게 핵심이다** — 클라이언트가 매기려면 작성자별 키가 필요한데 그게 곧 `author_id`다.

번호는 **그 글 안에서만 유효하다**(같은 사람이 다른 글에선 다른 번호). 익명 글의 글쓴이가 자기 글에 단 익명 댓글은 "글쓴이"로 표시하지만, 글이 **실명이면 그 라벨을 안 붙인다** — 글쓴이가 누군지 다 아는데 라벨을 달면 익명 댓글이 곧바로 까진다.

### 익명 악용은 밴이 아니라 "익명 정지"로 다룬다

밴을 만들면 익명이 깨진다. 밴은 해제·이의신청 때문에 **관리자가 목록을 봐야만** 하는데, 익명 글 작성자를 밴하면 그 목록에 새로 뜬 한 명이 곧 작성자다(집합 차집합 한 번). 밴은 그냥 느린 unmask다.

익명 정지는 **스스로 만료되므로 관리자가 볼 이유가 없고**, 그래서 관리자에게 관측 가능한 상태를 아무것도 안 남길 수 있다(RLS가 본인에게만). 처방도 정확하다: 문제가 익명 악용이면 뺏을 것은 익명이지 계정이 아니다.

**형량은 서버가 정한다** — 관리자는 이 사람이 초범인지 상습범인지 **알 수가 없으니까**(그게 익명의 조건이다). 1일 → 2일 → 4일 → 8일…, 90일 상한. 이미 정지 중이면 쌓지 않고 남은 기간만 돌려준다. 시간이 지났다고 누범을 자동으로 지우지도 않는다 — 그러면 띄엄띄엄 반복하는 사람이 영원히 초범이다.

`undo_*`는 **"전과 말소"가 아니라 "이번 건 없던 일로"** 다: 현재 정지를 풀고 누범을 하나만 되돌린다(2회차를 취소하면 다음도 2회차). **반드시 void여야 한다** — "2회차를 취소했습니다" 같은 응답은 **공짜 probe**가 된다. 정지는 틀리면 애먼 사람이 처벌받는 비용이 들지만, 취소는 아무도 안 다치므로 관리자가 익명 글을 마음껏 찔러 작성자별로 묶을 수 있다.

**의도적으로 감수하는 유출**: `suspend_*`가 돌려주는 기간·`already_suspended`로, 관리자는 익명 글 A와 B가 **같은 사람인지** 알아낼 수 있다(이름은 몰라도 묶을 수는 있다). 감수하는 이유: (1) 신원은 안 샌다, 새는 건 연결뿐이다. (2) **probe가 공짜가 아니다** — 확인하려면 실제로 정지시켜야 하고 틀리면 항의가 들어온다. (3) 초범과 상습범을 구분 못 하면 모더레이션이 성립하지 않는다. 단 이 정보는 **행동했을 때만** 준다 — `strike_count`는 select grant에서 빠져 있어 목록에 상시로 뿌릴 수 없다.

## 첨부

blob은 `post-files/{space.pub_id}/{uuid}`에 **글보다 먼저** 올라가고, `create_post_with_attachments`가 글+첨부를 한 트랜잭션으로 만든다. 경로에 업로더 uid가 없는 이유는 익명이다 — [09-storage](09-storage.md) 참고.

**경로를 post가 아니라 space에 매단 이유**: 경로에 `post.pub_id`를 박으면 글이 먼저 존재해야 업로드가 되고, 작성 → 업로드 → 확정 **3단계**가 된다. 중간에 실패하면 첨부 없는 글이 게시된 채 남아 보상 트랜잭션이 필요해지는데, **그 보상도 실패할 수 있어 유령 글이 영구히 남는다.** space에 매달면 실패 시 아무것도 안 생기고 올려둔 blob은 고아 청소가 걷어간다.

메시지와 달리 글은 **이미지와 파일을 섞을 수 있다**(카드가 둘 다 렌더한다). 그래서 "여럿이면 전부 이미지" 규칙은 없고 개수 상한(10)만 있다.

## Soft delete와 purge

**tombstone**: 삭제된 댓글은 답글이 살아 있으면 계속 select된다(`has_active_descendant`) — 없애면 답글 사슬이 끊긴다. 그래서 `soft_delete_comment`가 **`content`를 비우고**(그래서 컬럼이 nullable) 읽기 RPC가 `author`까지 지워 `is_deleted=true`만 내린다. 안 비우면 "삭제된 댓글"이 원문과 작성자를 그대로 실어 보낸다.

**`purge_deleted_content`** (service_role 배치)가 tombstone을 하드 삭제한다. 행이 무한히 쌓이는 것도 문제지만, 더 나쁜 건 **지운 익명 글의 `author_id`가 영구 보존된다**는 것이다 — 익명은 시간이 지나도 익명이어야 한다.

- **blob이 먼저다.** 첨부는 `storage-maintenance`가 걷어간다. 그래서 이 RPC는 **첨부 행이 남은 글을 건너뛴다**(`cleanup_conversation`은 예외를 던지지만, 여기는 배치라 글 하나 때문에 전체가 죽으면 안 된다).
- **댓글은 잎부터 벗긴다.** `parent_id`가 restrict라 2단계로는 임의 깊이를 못 지운다. 자식 없는 것만 지우는 루프를 반복한다.
- **살아 있는 답글이 달린 tombstone은 남는다** — 자식이 있으면 잎이 아니다. 그게 정확히 그 tombstone을 계속 보여주는 조건이기도 하다. 전부 죽은 서브트리는 잎부터 걷혀 통째로 사라진다.
- 글을 지우면 살아 있는 댓글도 같이 간다(글이 없으면 어차피 못 보고, `post_id`가 restrict라 남기면 글을 못 지운다). `notifications`·`*_mentions`는 cascade.
- 삭제된 space의 글은 `purge_due_spaces`(spaces 도메인)가 걷는다 — soft delete 7일 뒤, 그 공간의 blob이 Storage에서 실제로 나간 다음에.

## Private helper

| 함수                                        | 용도                                                                         |
| ------------------------------------------- | ---------------------------------------------------------------------------- |
| `can_access_post(post_id)`                  | 활성 post + `can_participate_space`                                          |
| `can_access_comment(comment_id)`            | 활성 comment + `can_access_post`                                             |
| `has_active_descendant(comment_id)`         | 임의 깊이에 활성 답글이 있는지 (재귀, depth 50). tombstone 노출 판단         |
| `post_author(author_id, is_anonymous)`      | 작성자 jsonb. 익명이면 null                                                  |
| `validate_post_attachments(...)`            | 첨부 검증(MIME·크기·경로·object 존재). create/set이 같은 규칙을 쓰도록       |
| `suspend_anonymity(space_id, author_id)`    | 익명 정지 구현 (형량 가중·no-op 판단)                                        |
| `max_post_attachments()` / `max_mentions()` | 10 / 20. 멘션 하나가 알림 하나라 상한이 없으면 글 하나로 전교생에게 쏜다     |
| `enforce_mention_limit()`                   | 멘션 상한 트리거. 두 테이블이 소유자 컬럼명만 다르므로 `tg_argv`로 받아 공용 |

## Trigger

| 트리거                                   | 테이블             | 이벤트                                           | side effect                                                                                                                      |
| ---------------------------------------- | ------------------ | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `trg_validate_comment_parent`            | `comments`         | BEFORE I/U of `post_id`,`parent_id`              | 부모가 같은 post의 활성 comment가 아니면 예외 (깊이 무제한)                                                                      |
| `trg_validate_post_category`             | `posts`            | BEFORE I/U of `space_id`,`category_id`           | 다른 space의 카테고리면 예외                                                                                                     |
| `trg_enforce_anonymous_allowed_posts`    | `posts`            | BEFORE INSERT                                    | 익명 금지 공간이거나 작성자가 정지 중이면 예외. 트리거 **함수**는 `private.enforce_anonymous_allowed`([02-spaces](02-spaces.md)) |
| `trg_enforce_anonymous_allowed_comments` | `comments`         | BEFORE INSERT                                    | 위와 같음                                                                                                                        |
| `trg_enforce_post_attachment_shape`      | `post_attachments` | AFTER INSERT (statement)                         | 첨부 10개 초과 시 예외                                                                                                           |
| `trg_enforce_post_mention_limit`         | `post_mentions`    | BEFORE INSERT                                    | 멘션 20개 초과 시 예외                                                                                                           |
| `trg_enforce_comment_mention_limit`      | `comment_mentions` | BEFORE INSERT                                    | 위와 같음                                                                                                                        |
| `trg_mark_post_edited`                   | `posts`            | BEFORE UPDATE of `title`,`content`,`category_id` | trim + `updated_at` 스탬프 (아래)                                                                                                |
| `trg_mark_comment_edited`                | `comments`         | BEFORE UPDATE of `content`                       | trim + `updated_at` 스탬프. **삭제엔 안 찍는다** (아래)                                                                          |

알림 트리거(`trg_notify_on_*`)도 이 테이블들에 걸려 있지만 정의는 [06-notifications](06-notifications.md)에 있다.

## 주의

- **`updated_at`은 서버가 찍는다.** update 컬럼 grant에 없어서 클라이언트는 못 쓴다(쓸 수 있으면 수정 시각을 소급해 꾸민다). BEFORE 트리거가 `NEW`를 고치는 건 grant와 무관하다 — grant는 문장의 SET 절만 본다(`messages.edited_at`과 같은 구조). **고정도 삭제도 수정이 아니다**: `soft_delete_comment`는 `content`를 건드리므로 트리거가 돌지만 `deleted_at`이 찍히는 UPDATE에선 스탬프하지 않는다 — 안 그러면 tombstone의 `updated_at`이 "삭제한 시각"이 된다.
- **멘션 대상은 그 공간의 멤버여야 한다.** 아니면 읽지도 못하는 글의 알림을 받게 되고, 나아가 아무에게나 알림을 쏘는 통로가 된다. 멘션은 붙이거나 떼거나 둘 중 하나라 update가 없다. 뗐다 다시 붙여도 알림은 재발송되지 않는다(`uq_notifications_*` 인덱스) — 없으면 멘션 토글이 스팸 버튼이 된다.
- **댓글 수·반응 수는 캐시하지 않는다.** 클라이언트가 컬럼 grant로 직접 쓰므로 카운터를 걸 RPC 병목이 없고, 트리거로 캐시하면 댓글 하나마다 post 행에 락이 걸려 한 공지에 답하는 200명이 직렬화된다. 읽기 계약은 어느 쪽이든 같으니 측정이 요구하면 그때 되돌린다. (`spaces.member_count`는 join/leave가 RPC를 거치므로 캐시한다.)
- author 자동 스탬핑은 없다 — RLS가 `author_id = current_profile_id()`를 검사하므로 클라이언트가 insert 시 명시해야 한다(insert grant엔 남아 있고 select에서만 회수했다).
- trgm 검색 인덱스(공백 제거 + `lower()`)는 `search_posts`가 같은 표현식으로 비교할 때만 탄다. PostgREST 직접 조회로는 못 탄다.
