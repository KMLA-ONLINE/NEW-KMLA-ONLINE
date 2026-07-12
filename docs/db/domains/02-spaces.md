# 02. Spaces

Source: [`supabase/schemas/02-spaces.sql`](../../../supabase/schemas/02-spaces.sql)

커뮤니티/그룹 컨테이너와 membership. 게시글·알림·권한 판단의 기준 단위.

## 가입 정책 (`space_join_policy`)

**모든 공간이 참여에 멤버십을 요구한다.** 정책은 '어떻게 멤버가 되는가'만 가른다.

| 값              | 검색 노출 | 가입 방식                                          |
| --------------- | --------- | -------------------------------------------------- |
| `public` (기본) | O         | 즉시 가입 (`join_space` → `'joined'`)              |
| `request`       | O         | 요청 후 관리자 승인 (`join_space` → `'requested'`) |
| `invite_only`   | **X**     | 초대장 토큰으로만 (`accept_space_invite`)          |

과거 `open`(가입 없이 참여)은 제거했다 — 멤버십이 참여의 유일한 기준이어야 `member_count`가 모든 공간에서 같은 뜻을 갖는다.

대기 요청은 `space_members`가 아니라 `space_join_requests`에 산다. 승인 전까지는 멤버가 아니므로 멤버십 불변식(owner 유일성, `member_count`)을 건드리지 않는다.

## 역할 (`member_role`)

권한은 **두 층**이다: 게시판을 굴리는 일과, 사람·규칙을 다루는 일. 다른 신뢰를 요구한다 — 공지 그룹의 간부는 글을 고정하고 말머리를 정리하면 되지 남을 강퇴하거나 익명을 벗길 필요가 없다.

| 권한                                                           | 헬퍼                      | owner | admin | manager | member |
| -------------------------------------------------------------- | ------------------------- | ----- | ----- | ------- | ------ |
| 설정·초대·가입승인·남의 글 삭제·익명 정지·이미지·**역할 변경** | `can_manage_space()`      | O     | O     | X       | X      |
| **글 고정/해제**, **카테고리 관리**                            | `can_curate_space()`      | O     | O     | **O**   | X      |
| `post_policy='managers'` 그룹에서 **메인 글 작성**             | `can_post_in_space()`     | O     | O     | **O**   | X      |
| 댓글·반응, 그리고 `post_policy='all'`이면 글 작성              | `can_participate_space()` | O     | O     | O       | O      |
| **소유권 이양**                                                | (owner 본인만)            | **O** | X     | X       | X      |

`manager`가 가진 건 위 표의 셋뿐이다. 설정도, 초대도, 가입 승인도, 남의 글 삭제도, 익명 정지도, 역할 변경도 못 한다.

**용어 함정**: 코드가 운영 권한을 `can_manage_space`라 부르고 예외 메시지도 `'space manager required'`라, 코드의 "manager"는 대개 **`manager` 역할이 아니라 owner/admin**을 뜻한다. 이름이 정확히 반대로 겹친다. (그래서 `set_post_pinned`의 거절 메시지는 `'space curator required'`다.)

### owner와 admin은 대등하다

권한이 같고 **서로를 임명하고 서로를 내릴 수 있다.** 예외는 owner 하나뿐 — `set_space_member_role`이 `p_role='owner'`도 `target_role='owner'`도 거부한다. 이 한 줄이 두 가지를 동시에 막는다:

1. **admin의 쿠데타.** owner만이 자기 자리를 넘긴다.
2. **조용한 소유권 이전.** owner는 space당 1명이라 새 owner를 세우는 건 반드시 기존 owner를 내리는 일이기도 하다. 그걸 "승격" 버튼 뒤에 숨기면 안 된다.

### 소유권 이양 (`transfer_space_ownership`)

owner만, **현재 admin에게만** 넘긴다(일반 멤버에게 바로 넘기려면 admin으로 먼저 올려야 한다). 끝나면 기존 owner는 admin이 된다.

**두 UPDATE의 순서가 정확성의 일부다.** 기존 owner를 **먼저** 내리고 새 owner를 세운다. 반대로 하면 그 순간 owner가 둘이 되어 `space_members_one_owner_key`(부분 unique index, **deferrable 아님**)에 즉시 걸린다. 먼저 내리면 잠깐 owner가 0명인데, 부분 unique index는 0을 문제 삼지 않는다 — "정확히 1명"은 `trg_validate_space_owner`(deferred)가 커밋 시점에 센다.

## 테이블

- `spaces` — `type`(group=공식/community=비공식), `join_policy`, `post_policy`(`all`|`managers`), `allow_anonymous_posts`, `member_count` 캐시, soft delete. `pub_id`는 **text 슬러그**(공유 링크·storage 경로용, 소문자·숫자·하이픈 3~50자, unique)
- `space_anonymity_suspensions` — `(space_id, user_id)` PK. 익명 작성 권한의 한시적 정지. **RLS가 본인에게만 보여준다** — 관리자에게 보이면 익명 글 작성자를 특정하는 통로가 된다. 설계 근거는 [03-content](03-content.md)
- `space_members` — `(space_id, user_id)` PK. 역할(위 표), 알림 설정, 개인용 `pinned_at`(그룹 상단 고정), ban 상태
- `space_invites` — `token`(unique 비밀값)으로 식별. **`target_user_id`가 null이면 공유 링크, 값이 있으면 그 사람만 수락 가능.** `on delete cascade`인 이유: set null이면 대상 지정 초대가 조용히 공유 링크로 격하된다
- `space_join_requests` — `(space_id, user_id)` PK. 조회·삭제는 본인 또는 관리자
- `space_categories` — 그룹별 게시판/말머리. `(space_id, lower(btrim(name)))` unique, `sort_order`로 표시 순서. 조회는 멤버 전원, 관리는 `can_curate_space`

## RPC

| 함수                                                          | 인증      | 목적                                                                           |
| ------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------ |
| `join_space(space_id)`                                        | accepted  | `'joined'` 또는 `'requested'` 반환. invite_only·밴은 거부                      |
| `approve_join_request(space_id, user_id)`                     | 관리자    | 멤버 승격. 거절·요청취소는 `space_join_requests` 직접 delete                   |
| `leave_space(space_id)`                                       | 멤버      | 본인 탈퇴 (owner는 이양 먼저)                                                  |
| `create_space_invite(space_id, target_user_id?, expires_at?)` | 관리자    | 초대장 발급. **어떤 초대도 30일을 못 넘긴다**(미지정이면 30일)                 |
| `accept_space_invite(token)`                                  | accepted  | 대상 지정 초대는 대상 본인만. 엉뚱한 사람에겐 초대의 존재 자체를 숨겨 거부한다 |
| `revoke_space_invite(invite_id)`                              | 관리자    | 초대장 폐기                                                                    |
| `set_space_member_role(space_id, user_id, role)`              | 관리자    | 역할 변경. **owner는 세우지도 내리지도 못한다**(위 "owner와 admin은 대등하다") |
| `transfer_space_ownership(space_id, new_owner_id)`            | **owner** | 소유권 이양. 대상은 현재 admin이어야 한다                                      |

space 생성(`create_space`)은 아직 없다 — 테이블 직접 insert는 service_role만 가능하다.

## Private helper

| 함수                                              | 용도                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------ |
| `private.is_space_member(space_id, roles?)`       | 활성 space의 비차단 멤버인지 (역할 필터 옵션). 아래 셋의 토대            |
| `private.can_manage_space(space_id)`              | 운영 권한 = owner/admin                                                  |
| `private.can_curate_space(space_id)`              | 게시판 정리 = owner/admin/**manager**                                    |
| `private.can_participate_space(space_id)`         | 참여 = 멤버 (모든 공간이 멤버십을 요구하므로 `is_space_member`와 같다)   |
| `private.can_post_in_space(space_id)`             | 메인 글 작성. `post_policy='managers'`면 `can_curate_space`, 아니면 참여 |
| `private.can_post_anonymously(space_id, user_id)` | 공간이 익명을 허용하고 + 내가 정지 중이 아닌지                           |
| `private.enforce_anonymous_allowed()`             | posts/comments insert 트리거 (아래 Trigger)                              |

## Trigger

| 트리거                                   | 테이블          | 이벤트                                | side effect                                             |
| ---------------------------------------- | --------------- | ------------------------------------- | ------------------------------------------------------- |
| `trg_validate_space_owner`               | `space_members` | AFTER I/U/D (**deferred constraint**) | 커밋 시점에 owner가 정확히 1명이 아니면 트랜잭션 거부   |
| `trg_enforce_anonymous_allowed_posts`    | `posts`         | BEFORE INSERT                         | 익명인데 공간이 익명을 껐거나 작성자가 정지 중이면 예외 |
| `trg_enforce_anonymous_allowed_comments` | `comments`      | BEFORE INSERT                         | 위와 같음                                               |

익명 강제가 RPC가 아니라 **트리거**인 이유: posts/comments는 컬럼 grant로 직접 insert할 수 있어, RPC에서만 막으면 테이블에 바로 꽂아 우회된다.

## 주의

- `spaces`의 update는 **컬럼 단위**로 관리자에게만: `name`, `description`, `allow_anonymous_posts`, `post_policy`. `join_policy`는 전환 시 대기 요청을 정리해야 해서 빠져 있다(RPC가 갈 자리). `member_count`는 캐시라 join/leave RPC만 건드린다.
- **`allow_anonymous_posts`를 꺼도 이미 올라간 익명 글은 그대로 익명이다.** `posts.is_anonymous`는 불변이라(update grant에 없다) 소급해서 작성자가 공개되지 않는다 — 익명을 믿고 쓴 사람을 배신하지 않는다.
- `member_count`는 밴되지 않은 `space_members` 행 수. 계정 삭제(identity 도메인)는 여기를 안 건드려 약간 과다 계수되지만 드물고 `greatest(-1,0)` 클램프가 있다. 정확한 수가 필요하면 `count(*)`.
- 초대장의 사용 횟수 제한(`max_uses`)은 없앴다 — 공유 링크는 기한으로, 대상 지정 초대는 그 사람만 수락하므로 본질적으로 1회다.
