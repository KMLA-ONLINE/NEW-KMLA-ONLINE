# 06. Notifications

Source: [`supabase/schemas/06-notifications.sql`](../../../supabase/schemas/06-notifications.sql)

recipient 중심 알림 inbox. **알림은 전부 트리거가 만든다** — authenticated에 insert grant가 없다.

## 테이블

`notifications` — recipient / `type` / actor + 대상 FK 4종(space·post·comment·message) + `payload` + `read_at`.

- **`type`이 없으면 안 되는 이유**: FK 모양으로는 종류를 유추할 수 없다. "내 글에 댓글", "내 댓글에 답글", "댓글에서 멘션"은 `(space_id, post_id, comment_id)`가 전부 채워진 **완전히 같은 모양**인데 아이콘도 문구도 목적지도 다르다.
- `actor_is_anonymous` — 익명으로 한 행동인가. `list_notifications()`가 이걸 보고 actor를 지운다. 원본에서 매번 읽지 않는 이유: `is_anonymous`는 불변이라 drift가 없고, 원본이 하드 삭제돼도 "가려야 한다"는 판단은 남아야 한다.
- `payload jsonb` — FK로 표현 못 하는 소량의 사실만(바뀐 역할, 정지 만료 시각).
- **`title`/`body`는 없다**(과거엔 있었다). 렌더된 문구를 DB에 박으면 작성자 개명에 stale해지고, 문구 수정이 데이터 마이그레이션이 되며, 무엇보다 댓글 미리보기를 캐시하는 순간 **삭제된 댓글의 원문이 되살아난다**.

### `notification_type`

| 그룹   | 값                                                                                                                                                                        | 게이트                                                          |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 콘텐츠 | `post_comment`, `comment_reply`, `post_mention`, `comment_mention`                                                                                                        | `space_members.notification_setting` (`off`/`mentions`/`all`)   |
| 채팅   | `message_mention`                                                                                                                                                         | (아직 트리거 없음 — 아래 주의)                                  |
| 운영   | `space_join_request`, `space_join_approved`, `space_join_rejected`, `space_invited`, `space_role_changed`, `space_anonymity_suspended`, `post_removed`, `comment_removed` | 없음 — **끌 수 없다** (가입 승인·정지 통보를 안 받을 수는 없다) |

## RPC

| 함수                                    | 인증     | 목적                                                                |
| --------------------------------------- | -------- | ------------------------------------------------------------------- |
| `list_notifications(before_id?, limit)` | accepted | 알림함 keyset. 익명이면 actor를 지우고, 대상을 pub_id로 풀어 내린다 |
| `get_unread_notification_count()`       | accepted | 내비 뱃지용. 100에서 세기를 멈춘다(뱃지는 99+ 위를 구분하지 않는다) |

**"모두 읽음"에 RPC는 없다** — `update notifications set read_at=now() where read_at is null` 한 줄이면 된다(RLS가 내 행으로 가두고 컬럼 grant가 `read_at`만 연다).

## Trigger

| 트리거                                | 테이블                        | 이벤트                                    | 만드는 알림                                                                                         |
| ------------------------------------- | ----------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `trg_notify_on_comment`               | `comments`                    | AFTER INSERT                              | 글쓴이 `post_comment` + 부모 댓글 작성자 `comment_reply`. 같은 사람이면 **답글이 이겨** 알림은 하나 |
| `trg_notify_on_post_mention`          | `post_mentions`               | AFTER INSERT                              | `post_mention`                                                                                      |
| `trg_notify_on_comment_mention`       | `comment_mentions`            | AFTER INSERT                              | `comment_mention`. 이미 그 댓글로 나간 알림이 있으면 **종류만 올린다**                              |
| `trg_notify_on_post_removed`          | `posts`                       | AFTER UPDATE of `deleted_at`              | 모더레이터가 지웠을 때만(`deleted_by <> author_id`)                                                 |
| `trg_notify_on_comment_removed`       | `comments`                    | AFTER UPDATE of `deleted_at`              | 위와 같음                                                                                           |
| `trg_notify_on_join_request`          | `space_join_requests`         | AFTER INSERT                              | owner/admin에게 `space_join_request`                                                                |
| `trg_notify_on_join_request_resolved` | `space_join_requests`         | **CONSTRAINT** AFTER DELETE, **DEFERRED** | `space_join_approved` 또는 `..._rejected`. 본인 취소면 아무것도 안 만든다 (아래)                    |
| `trg_notify_on_space_invite`          | `space_invites`               | AFTER INSERT                              | 대상 지정 초대만 (공유 링크는 받는 사람이 없다)                                                     |
| `trg_notify_on_role_changed`          | `space_members`               | AFTER UPDATE of `role`                    | `space_role_changed`. **내가 바꾼 내 역할은 건너뛴다** (아래)                                       |
| `trg_notify_on_anonymity_suspended`   | `space_anonymity_suspensions` | AFTER I/U of `suspended_until`            | `space_anonymity_suspended`                                                                         |

## 주의

- **왜 트리거인가(RPC가 아니라).** `comments`/`*_mentions`에는 insert 컬럼 grant가 있어 클라이언트가 테이블에 직접 쓴다. 생성을 RPC에만 걸면 테이블로 바로 질러 **알림 없이 댓글을 다는 우회**가 가능하다. 트리거는 security definer라 insert grant 없이도 쓴다.

- **익명 유출.** `actor_id`의 select를 회수했다. 없으면 익명 댓글의 알림 행에 실린 `actor_id`를 글쓴이가 그냥 select해서 익명을 깬다 — `posts`/`comments`의 `author_id`를 가린 것이 **알림함을 우회로로 통째로 무효가 된다.** 열려 있는 컬럼은 `id`/`type`/`read_at`/`created_at`뿐이다(읽음 표시 UPDATE의 WHERE가 참조하는 컬럼 + 나중의 realtime 뱃지용 최소치). 읽기는 `list_notifications()`로만 가고, 어차피 딥링크에 필요한 pub_id는 내부 bigint만으로는 못 만든다.

- **모더레이션 알림은 actor를 안 싣는다**(`notifications_actor_shape_check`가 강제). 스키마가 이미 `suspended_by`와 `deleted_by`의 select를 회수해 뒀는데("누가 걸었는지까지 알면 보복 대상이 된다") 알림에 실으면 그 결정이 무효가 된다. 가입 승인·거절·역할 변경은 애초에 누가 했는지를 저장하는 컬럼이 없다.

- **승인/거절/본인취소가 전부 같은 DELETE다.** 그래서 `trg_notify_on_join_request_resolved`는 **constraint trigger + DEFERRED**여야 한다: `approve_join_request`는 요청을 DELETE한 **뒤** 멤버로 INSERT하므로, 보통의 AFTER ROW 트리거는 문이 끝나면 바로 돌아 **승인을 거절로 오인한다.** 커밋까지 미루면 최종 상태를 본다. (검증할 땐 롤백 트랜잭션 안에서 `set constraints all immediate`로 커밋 시점을 강제해야 한다 — 안 그러면 트리거가 아예 안 돌아 "알림이 안 온다"로 보인다.)

- **내가 바꾼 내 역할은 알리지 않는다.** `transfer_space_ownership`이 기존 owner를 admin으로 내리는 게 정확히 그 경우다. `notifications_no_self_notify` 제약은 이걸 못 잡는다 — 그 제약은 `actor_id`를 보는데 역할 변경 알림은 actor를 아예 안 싣기 때문이다.

- **채팅은 메시지마다 행을 만들지 않는다.** 안 읽음은 `chat_read_states`에서 파생되고 푸시는 저장 안 하는 일시적 전달이다. 메시지당 수신자당 행을 쌓으면 같은 사실을 두 곳에 저장하며 팬아웃이 터진다. `message_id`는 **멘션**처럼 지속되어야 하는 알림에만 쓴다.

- **`message_mention`은 값만 있고 트리거가 없다** (`message_mentions` 테이블이 없다). 그래서 `chat_notification_settings.level`의 `'mention'`은 아직 죽은 설정이다. 값을 미리 넣어 둔 이유: enum에 값을 추가하는 마이그레이션은 **같은 트랜잭션에서 그 값을 쓸 수 없어**(check 제약이 리터럴로 참조한다) 나중에 넣으려면 마이그레이션을 둘로 쪼개야 한다.

- **아직 없는 알림**: 공지/고정글 팬아웃, 반응(팬아웃이 크고 개별 가치가 낮아 `actor_count` 집계가 필요하다), 익명 정지 **해제** 통보.
