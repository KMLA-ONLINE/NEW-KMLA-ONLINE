# 06. Notifications

Source: [`supabase/schemas/06-notifications.sql`](../../../supabase/schemas/06-notifications.sql)

recipient 중심 알림 inbox. 알림은 **전부 트리거가 만든다** — authenticated에는 insert grant가 없다.

읽기는 `list_notifications()` 하나로만 간다. 테이블 직접 select로는 알림함을 그릴 수 없다: `actor_id`의 select grant가 회수돼 있고(익명), 내부 bigint만으로는 딥링크(`/groups/{space.pub_id}/posts/{post.pub_id}`)를 만들 수 없다.

## 테이블

- `notifications` — recipient/type/actor + 대상 FK 4종(space/post/comment/message) + `payload` + `read_at`
  - `type`([`notification_type`](#notification_type))이 **없으면 안 되는 이유**: FK 모양으로는 종류를 유추할 수 없다. "내 글에 댓글", "내 댓글에 답글", "댓글에서 나를 멘션"은 `(space_id, post_id, comment_id)`가 전부 채워진 **완전히 같은 모양**인데 아이콘도 문구도 목적지도 다르다.
  - `actor_is_anonymous` — 행위자가 익명으로 한 행동인가. `list_notifications()`가 이걸 보고 actor를 통째로 지운다. 원본에서 매번 읽지 않고 박아 두는 이유: `is_anonymous`는 작성 후 불변이라 drift가 없고, 원본이 하드 삭제돼도 "가려야 한다"는 판단은 남아야 한다.
  - `payload jsonb` — FK로 표현되지 않는 소량의 사실만(바뀐 역할, 정지 만료 시각). **렌더된 문구는 절대 넣지 않는다** — 아래 주의 참고.
  - `title`/`body`는 **없다**(과거엔 있었다). 문구를 DB에 박으면 작성자가 개명해도 옛 이름을 실어 나르고, 문구 수정이 데이터 마이그레이션이 되며, 무엇보다 댓글 미리보기를 캐시하는 순간 **삭제된 댓글의 원문이 되살아난다** — `comments.content`를 nullable로 만들어 막았던 바로 그 유출이다.

### notification_type

| 그룹   | 값                                                                                                                                                                        | 게이트                                                                                       |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 콘텐츠 | `post_comment`, `comment_reply`, `post_mention`, `comment_mention`                                                                                                        | `space_members.notification_setting` (`off` 없음 / `mentions` 멘션만 / `all` 전부)           |
| 채팅   | `message_mention`                                                                                                                                                         | (아직 트리거 없음 — 아래 주의)                                                               |
| 운영   | `space_join_request`, `space_join_approved`, `space_join_rejected`, `space_invited`, `space_role_changed`, `space_anonymity_suspended`, `post_removed`, `comment_removed` | 없음 — **끌 수 없다**. 가입 승인이나 정지 통보를 사용자가 안 받기로 선택할 수 있으면 안 된다 |

## RPC

| 함수                                    | 인증     | 쓰기 | 목적                                                                                                                |
| --------------------------------------- | -------- | ---- | ------------------------------------------------------------------------------------------------------------------- |
| `list_notifications(before_id?, limit)` | accepted | X    | 알림함 keyset 페이지네이션. 익명 행위자는 actor를 null로 지우고, 대상은 pub_id로 풀어 딥링크가 가능한 형태로 내린다 |
| `get_unread_notification_count()`       | accepted | X    | 내비 뱃지용 안 읽은 수. 100에서 세기를 멈춘다(뱃지는 99+ 위를 구분하지 않는다)                                      |

**"모두 읽음"에 RPC는 없다.** `notifications_update` 정책이 행을 본인 것으로 가두고 컬럼 grant가 `read_at`만 열어 두므로 `update public.notifications set read_at=now() where read_at is null` 한 줄이면 된다.

## Trigger

| 트리거                                | 테이블                        | 이벤트                                    | 만드는 알림                                                                                                                    |
| ------------------------------------- | ----------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `trg_notify_on_comment`               | `comments`                    | AFTER INSERT                              | 글쓴이에게 `post_comment`, 부모 댓글 작성자에게 `comment_reply`. 같은 사람이 둘 다면 **더 구체적인 답글이 이겨** 알림은 하나다 |
| `trg_notify_on_post_mention`          | `post_mentions`               | AFTER INSERT                              | `post_mention`                                                                                                                 |
| `trg_notify_on_comment_mention`       | `comment_mentions`            | AFTER INSERT                              | `comment_mention`. 이미 그 댓글로 나간 알림이 있으면 **종류만 올린다**(`uq_notifications_comment_event`)                       |
| `trg_notify_on_post_removed`          | `posts`                       | AFTER UPDATE OF `deleted_at`              | 모더레이터가 지웠을 때만(`deleted_by <> author_id`) 작성자에게 `post_removed`                                                  |
| `trg_notify_on_comment_removed`       | `comments`                    | AFTER UPDATE OF `deleted_at`              | 위와 같음 → `comment_removed`                                                                                                  |
| `trg_notify_on_join_request`          | `space_join_requests`         | AFTER INSERT                              | owner/admin에게 `space_join_request`                                                                                           |
| `trg_notify_on_join_request_resolved` | `space_join_requests`         | **CONSTRAINT** AFTER DELETE, **DEFERRED** | 신청자에게 `space_join_approved` 또는 `space_join_rejected`. 본인 취소면 아무것도 안 만든다                                    |
| `trg_notify_on_space_invite`          | `space_invites`               | AFTER INSERT                              | 대상 지정 초대만 → `space_invited` (공유 링크는 받는 사람이 없다)                                                              |
| `trg_notify_on_role_changed`          | `space_members`               | AFTER UPDATE OF `role`                    | `space_role_changed` (payload에 from/to)                                                                                       |
| `trg_notify_on_anonymity_suspended`   | `space_anonymity_suspensions` | AFTER INSERT/UPDATE OF `suspended_until`  | `space_anonymity_suspended` (payload에 `suspended_until`)                                                                      |

## 주의

- **왜 트리거인가(RPC가 아니라).** `comments`/`post_mentions`/`comment_mentions`에는 insert 컬럼 grant가 있어 클라이언트가 테이블에 직접 쓴다. 생성을 RPC에만 걸면 테이블로 바로 질러서 **알림 없이 댓글을 다는 우회**가 가능하다 — `trg_enforce_anonymous_allowed`가 RPC가 아니라 트리거인 것과 같은 이유다. 트리거는 security definer라 authenticated에 insert grant를 주지 않고도 `notifications`에 쓴다.

- **익명 유출.** `actor_id`의 select를 authenticated에서 회수했다. 이게 없으면 익명 댓글의 알림 행에 실린 `actor_id`를 글쓴이가 그냥 select해서 익명을 깬다 — `posts`/`comments`의 `author_id`를 회수한 것이 **알림함을 우회로로 통째로 무효가 된다.** 열려 있는 컬럼은 `id`/`type`/`read_at`/`created_at`뿐이고, 그 용도는 두 가지다: (1) '읽음 표시' UPDATE의 WHERE가 참조하는 컬럼 — Postgres는 `UPDATE ... WHERE`에 쓰인 컬럼에도 SELECT 권한을 요구한다, (2) 나중에 realtime으로 뱃지를 올릴 때 필요한 최소치.

- **모더레이션 알림은 actor를 싣지 않는다**(`notifications_actor_shape_check`가 강제). 스키마는 이미 `space_anonymity_suspensions.suspended_by`와 `posts`/`comments.deleted_by`의 select를 회수해 뒀다("누가 걸었는지까지 알면 보복 대상이 된다"). 알림에 actor를 실으면 그 결정이 통째로 무효가 된다. 가입 승인·거절·역할 변경은 애초에 누가 했는지를 저장하는 컬럼이 없다 — 없는 걸 흘릴 수도 없다.

- **승인/거절/본인취소는 전부 같은 DELETE다.** `approve_join_request`가 요청을 지우고 멤버로 올리고, 거절과 본인 취소는 정책이 허용하는 직접 delete다. 그래서 `trg_notify_on_join_request_resolved`는 **constraint trigger + DEFERRED**여야 한다: 보통의 AFTER ROW 트리거는 DELETE 문이 끝나면 바로 돌아서, 그 시점엔 `space_members` INSERT가 아직 안 됐고 **승인을 거절로 오인한다.** 커밋까지 미루면 트랜잭션의 최종 상태를 본다(같은 이유로 `trg_validate_space_owner`도 deferred다). 검증할 땐 롤백 트랜잭션 안에서 `set constraints all immediate`로 커밋 시점을 강제해야 한다 — 안 그러면 트리거가 아예 안 돌아서 "알림이 안 온다"로 보인다.

- **채팅은 메시지마다 알림 행을 만들지 않는다.** 안 읽음 뱃지는 `chat_read_states`에서 파생되고(`list_conversations().unread_count`), 푸시는 저장하지 않는 일시적 전달이다. 메시지당 수신자당 행을 쌓으면 같은 사실을 두 곳에 저장하면서 팬아웃이 터진다. `notifications.message_id`는 **멘션**처럼 실제로 지속되어야 하는 알림에만 쓴다.

- **`message_mention`은 값만 있고 트리거가 없다.** `message_mentions` 테이블이 아직 없기 때문이다. 그래서 `chat_notification_settings.level`의 `'mention'`은 지금도 죽은 설정이다(멘션이 없으니 `'all'`과 구분되지 않는다). enum 값을 미리 넣어 둔 이유: enum에 값을 추가하는 마이그레이션은 **같은 트랜잭션에서 그 값을 쓸 수 없어서**(`notifications_target_shape_check`가 리터럴로 참조한다) 나중에 넣으려면 마이그레이션을 둘로 쪼개야 한다. 붙이려면 `message_mentions` 테이블 + 트리거만 추가하면 된다.

- **아직 없는 알림**: 공지/고정글(스페이스 전원 팬아웃), 반응(좋아요 — 팬아웃이 크고 개별 가치가 낮아 `actor_count` 집계 컬럼이 필요하다), 익명 정지 **해제** 통보.

- **역할 변경 트리거는 있는데 역할을 바꾸는 경로가 없다.** `space_members_update` 정책은 본인 행의 `notification_setting`/`pinned_at`만 연다 — 매니저가 남의 역할을 바꾸는 RPC가 아직 없다. 트리거를 먼저 둔 건 그 경로가 생기는 날 알림이 자동으로 따라오게 하려는 것이다.

- `notification_level` enum은 [00-foundation](00-foundation.md)으로 옮겼다 — 05-chat의 `chat_notification_settings`가 먼저 필요로 하기 때문이다.
