# 02. Spaces

Source: [`supabase/schemas/02-spaces.sql`](../../../supabase/schemas/02-spaces.sql)

커뮤니티/그룹 컨테이너와 membership. 게시글·알림·운영 권한 판단의 기준 단위.

## 가입 정책 (`space_join_policy`)

**모든 공간이 참여(글 읽기·쓰기)에 멤버십을 요구한다.** 정책은 '어떻게 멤버가 되는가'만 가른다.

| 값                     | 검색/디렉토리 | 가입 방식                                                                                   |
| ---------------------- | ------------- | ------------------------------------------------------------------------------------------- |
| `public` (가입)        | 노출          | 스스로 즉시 가입(`join_space` → `'joined'`), 승인 불필요                                    |
| `request` (승인가입)   | 노출          | 가입 요청(`join_space` → `'requested'`) 후 관리자(owner/admin) 승인(`approve_join_request`) |
| `invite_only` (초대장) | **비노출**    | 초대장 토큰으로만(`accept_space_invite`)                                                    |

기본값은 `public`. `public`/`request`는 accepted 사용자에게 목록 노출(`spaces_select`), `invite_only`는 멤버에게만 노출된다.

과거 `open`(가입 없이 참여 자유)은 제거했다 — 멤버십이 참여의 유일한 기준이 되어 `member_count`가 모든 공간에서 같은 뜻(참여자 수)을 갖도록 하기 위함이다.

`request` 공간의 대기 요청은 `space_members`가 아니라 `space_join_requests`에 산다. 승인 전까지는 멤버가 아니므로, `is_space_member`·`member_count`·owner 유일성 같은 멤버십 불변식을 전혀 건드리지 않는다.

## 역할 (`member_role`)

역할은 **두 개의 서로 다른 축**을 나눈다. 하나는 지금 살아 있고, 하나는 아직 배선되지 않았다.

1. **운영 권한** — `private.can_manage_space()` = owner **또는** admin. 중간 단계가 없다: `true`면 아래 목록 전부를 갖고, `false`면 아무것도 없다.
2. **글 작성 권한** — `manager` 이상만 메인 글을 쓰게 하려고 잡아 둔 축. **아직 아무 검사도 이 값을 보지 않는다**(아래 참고).

| 역할      | 운영 권한 | 지금 실질 권한                                                     |
| --------- | --------- | ------------------------------------------------------------------ |
| `owner`   | **O**     | `admin`과 **똑같다**. 다른 건 권한이 아니라 아래의 구조적 불변식뿐 |
| `admin`   | **O**     | 운영 권한 전부(아래 목록)                                          |
| `manager` | X         | **아직 `member`와 같다** — 글 작성 제한용 예약값(아래 참고)        |
| `member`  | X         | 참여(글 읽기·쓰기·댓글·반응)만                                     |

`can_manage_space`가 여는 것 — 이게 "운영 권한"의 전부다:

- 그룹 설정 수정 (`spaces`의 `name`/`description`/`allow_anonymous_posts`)
- 카테고리(말머리) 생성·수정·삭제 (`space_categories`)
- 초대장 조회·발급·폐기 (`space_invites`, `create_space_invite`, `revoke_space_invite`)
- 가입 요청 조회·승인·거절 (`space_join_requests`, `approve_join_request`)
- 글 고정 (`set_post_pinned`) — 순수 모더레이션이라 **작성자여도 자기 글은 못 고정한다**
- 남의 글·댓글 삭제 (`soft_delete_post` / `soft_delete_comment`)
- 익명 작성 정지·해제 (`suspend_*_anonymity` / `undo_*`) — 작성자가 **누군지 모른 채로**
- 그룹 이미지 업로드 (storage `space-images` insert policy)

### `manager` — 글 작성 제한용 예약값 (아직 배선 안 됨)

의도는 **"메인 글은 `manager` 이상만, 댓글은 멤버 전원"** 인 그룹을 만드는 것이다(공지형 그룹: 학생회가 글을 올리고 나머지는 댓글로만 반응). 그래서 `manager`는 운영 권한 축이 아니라 **작성 권한 축**에 있고, `can_manage_space`가 이 값을 안 보는 건 버그가 아니라 설계다.

다만 **지금은 그 축을 읽는 곳이 하나도 없어서 `manager`가 `member`와 구분되지 않는다.** 살리려면 두 곳이 같이 필요하다:

1. **공간별 스위치** — 모든 그룹이 글쓰기를 잠그는 게 아니므로 `spaces`에 정책 컬럼이 필요하다(예: `post_policy` = `all` | `managers`). 없으면 전 그룹이 잠긴다.
2. **검사 두 군데** — `posts_insert` 정책 **과** `create_post_with_attachments`. 후자는 `security definer`라 RLS를 지나치므로 정책만 고치면 RPC로 우회된다. `comments_insert`는 건드리지 않는다(댓글은 열어 둔다).

배관은 이미 있다: `private.is_space_member(space_id, p_allowed_roles)`의 **둘째 인자가 정확히 이걸 위한 것**이라 헬퍼는 손댈 필요가 없다 — `is_space_member(space_id, array['owner','admin','manager'])` 한 줄이면 된다. 지금 그 인자를 넘기는 호출부가 하나도 없을 뿐이다.

**용어 함정**: 코드가 운영 권한을 `can_manage_space`라 부르고 예외 메시지도 `'space manager required'`라서, 이 문서와 코드의 "매니저"는 **`manager` 역할이 아니라 owner/admin**을 뜻한다. 이름이 정확히 반대로 겹쳐 있으니 읽을 때 주의할 것.

### `owner`와 `admin`의 차이는 권한이 아니다

둘 다 `can_manage_space`를 통과하므로 **할 수 있는 일이 완전히 같다.** 차이는 구조적 불변식뿐이다:

- `space_members_one_owner_key` (partial unique index) — 한 space에 `owner`는 **정확히 1명**
- `trg_validate_space_owner` (deferred constraint trigger) — 활성 space는 owner가 1명이 아니면 트랜잭션 자체가 거부된다
- `leave_space` — owner는 `'transfer ownership before leaving'`으로 거부된다

### 역할을 바꾸는 경로는 아직 없다

`space_members_update` 정책은 `user_id = current_profile_id()`(**본인 행만**)이고, 컬럼 grant는 `notification_setting`/`pinned_at`뿐이다. 즉 **승격·강등 RPC가 없고, 정책상으로도 남의 `role`을 쓸 수 없다.** owner는 space를 만들 때 service_role이 심는다(애초에 space 생성 경로가 authenticated에 없다 — 아래 RPC 절 참고). 위의 `leave_space` 이양 요구도 **이양 RPC가 없어서** 현재 owner는 탈퇴 자체가 불가능하다.

역할 변경 알림(`space_role_changed`)의 트리거는 이미 `space_members`에 걸려 있다([06-notifications](06-notifications.md)) — 경로가 생기는 날 알림이 자동으로 따라오게 하려는 것이다.

## 테이블

- `spaces` — type(`group`=공식/`community`=비공식), `join_policy`, `allow_anonymous_posts`(그룹 전체 익명 스위치), `member_count` 캐시, soft delete. `pub_id`는 **text 슬러그**(공유 링크용, 소문자·숫자·하이픈 3 ~ 50자, unique, 기본값 자동 12자 hex)
- `space_anonymity_suspensions` — `(space_id, user_id)` PK. **익명 작성 권한의 한시적 정지.** 관리자가 익명 글의 작성자를 _모른 채로_ 그 사람의 익명 권한만 뺏는다. RLS가 행을 **본인에게만** 보여준다 — 관리자에게 보이면 익명 글 작성자를 특정하는 통로가 된다. 자세한 설계는 [03-content](03-content.md)의 "익명 악용" 절
- `space_members` — `(space_id, user_id)` PK. 역할(`owner`/`admin`/`manager`/`member` — 위 "역할" 절 참고. 지금 실제로 갈리는 경계는 owner/admin이냐 아니냐 하나뿐이고, `manager`는 아직 배선되지 않은 글 작성 축이다), 알림 설정, **개인용 `pinned_at`**(가입한 그룹 상단 고정), ban 상태
- `space_invites` — 초대장. `token`(unique, 링크에 실리는 비밀값)으로 식별. **`target_user_id`가 null이면 공유 링크**(토큰 아는 사람 누구나), **값이 있으면 그 사람만 수락 가능한 대상 지정 초대**. `expires_at`(만료)·`revoked_at`(폐기)로 무효화한다. `target_user_id`는 `on delete cascade`(대상 삭제 시 초대도 삭제 — set null이면 대상 지정 초대가 공유 링크로 격하되어 위험). 관리자만 조회
- `space_join_requests` — `(space_id, user_id)` PK. `request` 공간의 대기 중인 가입 요청. 조회·삭제는 본인 또는 관리자(owner/admin)(RLS). insert는 `join_space` RPC(정의자 권한)만, 승인은 `approve_join_request`만
- `space_categories` — 그룹별 게시판/말머리(정보·공식·잡담, 학생회 업무 구분 등). `(space_id, lower(btrim(name)))` unique로 그룹 내 이름 중복 금지, `sort_order`로 탭 표시 순서. 조회는 멤버, 관리(생성·수정·삭제)는 관리자(owner/admin). 글은 하나의 카테고리에 속한다(`posts.category_id`, 선택). 0개면 프론트는 분류 없이 전체를 보여준다

## RPC

| 함수                                                          | 인증                      | 쓰기 | 목적                                                                                                                                                 |
| ------------------------------------------------------------- | ------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `join_space(space_id)`                                        | accepted                  | O    | `'joined'`(public 즉시 가입 또는 이미 멤버) 또는 `'requested'`(request 공간 요청 적재)를 반환. invite_only·밴은 거부. 즉시 가입 시 member_count 증가 |
| `approve_join_request(space_id, user_id)`                     | space 관리자(owner/admin) | O    | request 공간의 가입 요청 승인 → 멤버 승격 + member_count 증가. 거절·요청취소는 `space_join_requests` 직접 delete(본인/관리자)                        |
| `leave_space(space_id)`                                       | accepted 멤버             | O    | 본인 탈퇴 (owner는 이양 먼저). member_count 감소                                                                                                     |
| `create_space_invite(space_id, target_user_id?, expires_at?)` | space 관리자(owner/admin) | O    | 초대장 토큰 발급. `target_user_id` 지정 시 그 사람만 수락 가능(실존 accepted 사용자여야). `expires_at` 최대 30일(초과 거부), 미지정 시 30일로 채움   |
| `accept_space_invite(token)`                                  | accepted                  | O    | 토큰 검증 후 멤버 합류. 대상 지정 초대는 대상 본인만(아니면 일반 무효 메시지로 거부), 이미 멤버면 no-op, 밴이면 거부. member_count 증가              |
| `revoke_space_invite(invite_id)`                              | space 관리자(owner/admin) | O    | 초대장 폐기                                                                                                                                          |

space 생성(`create_space`)·소유권 이양 등은 아직 없다. 테이블 직접 insert는 service_role만 가능하고, authenticated의 쓰기 경로는 위 membership/invite RPC + `space_members`의 `notification_setting`/`pinned_at` update + `space_join_requests` 직접 delete(요청 취소/거절) 뿐이다.

## Private helper

| 함수                                         | 용도                                                                                                                                                                        |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `private.is_space_member(space_id, roles?)`  | 활성 space의 비차단 멤버인지 (역할 필터 옵션)                                                                                                                               |
| `private.can_manage_space(space_id, roles?)` | 운영 권한 여부 = owner/admin (`is_space_member` 위임). `roles?`를 넘기는 호출부는 아직 하나도 없다 — 그 인자가 살아나는 건 `manager` 글 작성 제한을 붙일 때다(위 "역할" 절) |
| `private.can_participate_space(space_id)`    | 글 읽기/쓰기 참여 가능 여부. 모든 공간이 멤버십을 요구하므로 `is_space_member`와 같다. content 도메인 RLS가 사용                                                            |

## Trigger

| 트리거                     | 테이블          | 이벤트                                           | side effect                                       |
| -------------------------- | --------------- | ------------------------------------------------ | ------------------------------------------------- |
| `trg_validate_space_owner` | `space_members` | AFTER INSERT/UPDATE/DELETE (deferred constraint) | space당 owner가 정확히 1명이 아니면 트랜잭션 거부 |

## 주의

- `spaces`의 update는 **컬럼 단위**로 관리자(owner/admin)에게만 열려 있다: `name`, `description`, `allow_anonymous_posts`. `join_policy`는 전환 시 대기 중인 가입 요청을 정리해야 해서 빠져 있다(RPC가 갈 자리). `member_count`는 캐시라 join/leave RPC만 건드리고, `image_url`은 storage finalize RPC가 필요하다.
- `allow_anonymous_posts`를 꺼도 **이미 올라간 익명 글은 그대로 익명이다.** `posts.is_anonymous`는 불변이라(update 컬럼 grant에 없다) 소급해서 작성자가 공개되지 않는다 — 익명을 믿고 쓴 사람을 배신하지 않기 위해서다. 강제는 `trg_enforce_anonymous_allowed_*`(03-content)가 insert 시점에 한다.

- `member_count` = 밴되지 않은 `space_members` 행 수, **탈퇴(withdrawn) 사용자는 포함**(허용된 근사). membership RPC들이 증감시키며, 모든 이벤트가 space 도메인 안이라 유지 가능하다. 탈퇴는 identity 도메인에서 일어나 여기를 건드리지 않으므로 약간 과다 계수되지만, 계정 삭제는 드물고 `greatest(-1,0)` 클램프가 있으며 재보정(reconcile) 경로는 없다. 정확한 수가 필요하면 `count(*)`로 센다.
- soft delete 전제(`deleted_at`/`deleted_by`). active group 이름은 `lower(btrim(name))` unique.
- `pub_id`는 storage `space-images` 경로 첫 세그먼트로 쓰이므로 슬래시 금지 슬러그로 제약한다.
- 초대장은 공유 링크(대상 미지정)와 대상 지정을 모두 지원한다(`target_user_id`). 만료/폐기로 무효화하며, 사용 횟수 제한(`max_uses`)은 제거했다 — 공유 링크는 기한으로, 대상 지정은 그 사람만 수락하므로 본질적으로 1회다.
- **어떤 초대도 30일을 넘겨 유효할 수 없다**(`create_space_invite`가 강제, 미지정이면 30일로 채움). '영원한 초대'를 없애 유출된 링크의 수명을 자른다. "보통 며칠"이라는 초대별 기본값(예: 1:1은 7일)은 정책이라 UI가 정한다. 서버는 상한만 본다.
