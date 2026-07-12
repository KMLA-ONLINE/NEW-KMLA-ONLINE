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

권한은 **두 개의 층**이다. 나누는 기준은 "**게시판을 굴리는 일**이냐, **사람과 규칙을 다루는 일**이냐"다. 이 둘은 서로 다른 신뢰를 요구한다 — 공지 그룹의 학생회 간부는 글을 고정하고 말머리를 정리하면 되지, 남을 강퇴하거나 익명을 벗길 필요가 없다.

| 권한                                                                        | 헬퍼                      | owner | admin | manager | member |
| --------------------------------------------------------------------------- | ------------------------- | ----- | ----- | ------- | ------ |
| 그룹 설정·초대장·가입 승인·남의 글 삭제·익명 정지·그룹 이미지·**역할 변경** | `can_manage_space()`      | O     | O     | X       | X      |
| **글 고정/해제**, **카테고리 관리**                                         | `can_curate_space()`      | O     | O     | **O**   | X      |
| `post_policy='managers'`인 그룹에서 **메인 글 작성**                        | `can_post_in_space()`     | O     | O     | **O**   | X      |
| 글 작성(`post_policy='all'`), 댓글·반응                                     | `can_participate_space()` | O     | O     | O       | O      |
| **소유권 이양**                                                             | (owner 본인만)            | **O** | X     | X       | X      |

`can_manage_space()`가 여는 것 — 이게 "운영 권한"의 전부다:

- 그룹 설정 수정 (`spaces`의 `name`/`description`/`allow_anonymous_posts`/`post_policy` — **누가 글을 쓸 수 있는지 정하는 것도 운영 권한이다.** 매니저는 글을 쓰지만 자기 권한을 스스로 열지는 못한다)
- 초대장 조회·발급·폐기 (`space_invites`, `create_space_invite`, `revoke_space_invite`)
- 가입 요청 조회·승인·거절 (`space_join_requests`, `approve_join_request`)
- 남의 글·댓글 삭제 (`soft_delete_post` / `soft_delete_comment`)
- 익명 작성 정지·해제 (`suspend_*_anonymity` / `undo_*`) — 작성자가 **누군지 모른 채로**
- 그룹 이미지 업로드 (storage `space-images` insert policy)
- 멤버 역할 변경 (`set_space_member_role`)

### `manager` — 게시판은 굴리되 사람은 못 다룬다

`manager`가 가진 건 **정확히 셋뿐**이다: 글 고정/해제, 카테고리 관리, 그리고 `post_policy='managers'`인 그룹에서의 글쓰기. 그룹 설정도, 초대도, 가입 승인도, 남의 글 삭제도, 익명 정지도, 역할 변경도 **못 한다.**

`post_policy='managers'`의 강제는 **두 군데에서 같이** 한다:

1. `posts_insert` 정책 — 테이블 직접 insert를 막는다.
2. `create_post_with_attachments` — **`security definer`라 RLS를 지나친다.** 여기서 같은 검사를 다시 하지 않으면 이 RPC가 `post_policy`를 우회하는 뒷문이 된다.

`comments_insert`는 건드리지 않는다 — 공지에 달리는 반응까지 잠그면 그건 게시판이 아니라 공고문이다.

**용어 함정**: 코드가 운영 권한을 `can_manage_space`라 부르고 예외 메시지도 `'space manager required'`라서, 이 문서와 코드의 "매니저"는 대개 **`manager` 역할이 아니라 owner/admin**을 뜻한다. 이름이 정확히 반대로 겹쳐 있으니 읽을 때 주의할 것. (그래서 `set_post_pinned`가 매니저를 거절할 때의 메시지는 `'space curator required'`다.)

### `owner`와 `admin`은 권한이 같고, 서로를 임명하고 서로를 내릴 수 있다

둘 다 `can_manage_space`를 통과하므로 **할 수 있는 일이 완전히 같다.** admin이 다른 admin을 강등할 수도, 멤버를 admin으로 올릴 수도 있다 — 그래야 실제로 대등하다.

**단 하나의 예외가 owner이고, 그게 `set_space_member_role`과 `transfer_space_ownership`을 가르는 선이다.** `set_space_member_role`은 `p_role='owner'`도 `target_role='owner'`도 거부하는데, 이 한 줄이 두 가지를 동시에 막는다:

1. **admin의 쿠데타** — admin이 owner를 끌어내릴 수 없다. owner만이 자기 자리를 넘긴다.
2. **조용한 소유권 이전** — owner는 space당 정확히 1명이라(`space_members_one_owner_key`) 새 owner를 세우는 건 반드시 기존 owner를 내리는 일이기도 하다. 그걸 "승격" 버튼 뒤에 숨기면 안 된다.

구조적 불변식:

- `space_members_one_owner_key` (partial unique index) — 한 space에 `owner`는 **정확히 1명**. **deferrable이 아니라서** 커밋까지 미룰 수 없다
- `trg_validate_space_owner` (deferred constraint trigger) — 활성 space는 커밋 시점에 owner가 1명이 아니면 트랜잭션 거부
- `leave_space` — owner는 `'transfer ownership before leaving'`으로 거부된다

### 소유권 이양 (`transfer_space_ownership`)

owner만 부를 수 있고, **현재 admin에게만** 넘긴다 — 일반 멤버에게 바로 넘기려면 먼저 admin으로 올려야 한다(그룹을 통째로 넘기는 일이라 한 단계 더 밟게 한다). 끝나면 **기존 owner는 admin이 된다.** 권한이 같으므로 실질적으로 잃는 건 '이양권' 하나뿐이다.

**두 UPDATE의 순서가 정확성의 일부다.** 기존 owner를 **먼저** 내리고 새 owner를 세운다. 반대로 하면 새 owner를 세우는 순간 owner가 둘이 되어 `space_members_one_owner_key`에 즉시 걸린다 — 그 인덱스는 deferrable이 아니라 커밋까지 미룰 수가 없다. 먼저 내리면 잠깐 owner가 0명이 되는데, **부분 유니크 인덱스는 0을 문제 삼지 않는다.** "정확히 1명"을 세는 건 `trg_validate_space_owner`이고 그건 deferred라 커밋 시점에만 본다.

알림(`space_role_changed`)은 **새 owner에게만** 간다. `notify_on_role_changed`가 `new.user_id = current_profile_id()`면 건너뛰기 때문이다 — 방금 자기가 누른 버튼의 결과를 알림으로 다시 받는 건 잡음이다. (`notifications_no_self_notify` 제약은 이걸 못 잡는다: 그 제약은 `actor_id`를 보는데 역할 변경 알림은 actor를 아예 싣지 않는다.)

## 테이블

- `spaces` — type(`group`=공식/`community`=비공식), `join_policy`(어떻게 멤버가 되는가), **`post_policy`**(누가 메인 글을 쓰는가 — `all`(기본) | `managers`. 위 "역할" 절), `allow_anonymous_posts`(그룹 전체 익명 스위치), `member_count` 캐시, soft delete. `pub_id`는 **text 슬러그**(공유 링크용, 소문자·숫자·하이픈 3 ~ 50자, unique, 기본값 자동 12자 hex)
- `space_anonymity_suspensions` — `(space_id, user_id)` PK. **익명 작성 권한의 한시적 정지.** 관리자가 익명 글의 작성자를 _모른 채로_ 그 사람의 익명 권한만 뺏는다. RLS가 행을 **본인에게만** 보여준다 — 관리자에게 보이면 익명 글 작성자를 특정하는 통로가 된다. 자세한 설계는 [03-content](03-content.md)의 "익명 악용" 절
- `space_members` — `(space_id, user_id)` PK. 역할(`owner`/`admin`/`manager`/`member` — 위 "역할" 절 참고. 두 축이다: 운영 권한은 owner/admin, 글 작성은 `post_policy`에 따라 manager까지), 알림 설정, **개인용 `pinned_at`**(가입한 그룹 상단 고정), ban 상태
- `space_invites` — 초대장. `token`(unique, 링크에 실리는 비밀값)으로 식별. **`target_user_id`가 null이면 공유 링크**(토큰 아는 사람 누구나), **값이 있으면 그 사람만 수락 가능한 대상 지정 초대**. `expires_at`(만료)·`revoked_at`(폐기)로 무효화한다. `target_user_id`는 `on delete cascade`(대상 삭제 시 초대도 삭제 — set null이면 대상 지정 초대가 공유 링크로 격하되어 위험). 관리자만 조회
- `space_join_requests` — `(space_id, user_id)` PK. `request` 공간의 대기 중인 가입 요청. 조회·삭제는 본인 또는 관리자(owner/admin)(RLS). insert는 `join_space` RPC(정의자 권한)만, 승인은 `approve_join_request`만
- `space_categories` — 그룹별 게시판/말머리(정보·공식·잡담, 학생회 업무 구분 등). `(space_id, lower(btrim(name)))` unique로 그룹 내 이름 중복 금지, `sort_order`로 탭 표시 순서. 조회는 멤버 전원, 관리(생성·수정·삭제)는 **`can_curate_space` = owner/admin/manager**(게시판을 분류하는 건 게시판을 굴리는 일이다). 글은 하나의 카테고리에 속한다(`posts.category_id`, 선택). 0개면 프론트는 분류 없이 전체를 보여준다

## RPC

| 함수                                                          | 인증                      | 쓰기 | 목적                                                                                                                                                                                                                |
| ------------------------------------------------------------- | ------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `join_space(space_id)`                                        | accepted                  | O    | `'joined'`(public 즉시 가입 또는 이미 멤버) 또는 `'requested'`(request 공간 요청 적재)를 반환. invite_only·밴은 거부. 즉시 가입 시 member_count 증가                                                                |
| `approve_join_request(space_id, user_id)`                     | space 관리자(owner/admin) | O    | request 공간의 가입 요청 승인 → 멤버 승격 + member_count 증가. 거절·요청취소는 `space_join_requests` 직접 delete(본인/관리자)                                                                                       |
| `leave_space(space_id)`                                       | accepted 멤버             | O    | 본인 탈퇴 (owner는 이양 먼저). member_count 감소                                                                                                                                                                    |
| `create_space_invite(space_id, target_user_id?, expires_at?)` | space 관리자(owner/admin) | O    | 초대장 토큰 발급. `target_user_id` 지정 시 그 사람만 수락 가능(실존 accepted 사용자여야). `expires_at` 최대 30일(초과 거부), 미지정 시 30일로 채움                                                                  |
| `accept_space_invite(token)`                                  | accepted                  | O    | 토큰 검증 후 멤버 합류. 대상 지정 초대는 대상 본인만(아니면 일반 무효 메시지로 거부), 이미 멤버면 no-op, 밴이면 거부. member_count 증가                                                                             |
| `revoke_space_invite(invite_id)`                              | space 관리자(owner/admin) | O    | 초대장 폐기                                                                                                                                                                                                         |
| `set_space_member_role(space_id, user_id, role)`              | space 관리자(owner/admin) | O    | 멤버 역할 변경. **owner는 세우지도 내리지도 못한다**(`p_role='owner'`도 `target_role='owner'`도 거부) — 그게 admin의 쿠데타와 조용한 소유권 이전을 동시에 막는다. owner/admin은 서로를 임명하고 서로를 내릴 수 있다 |
| `transfer_space_ownership(space_id, new_owner_id)`            | space **owner 본인만**    | O    | 소유권 이양. 대상은 **현재 admin이어야** 한다. 끝나면 기존 owner는 admin이 된다. 두 UPDATE의 **순서가 정확성의 일부**다(위 "소유권 이양" 절)                                                                        |

space 생성(`create_space`)은 아직 없다. 테이블 직접 insert는 service_role만 가능하고, authenticated의 쓰기 경로는 위 RPC들 + `space_members`의 `notification_setting`/`pinned_at` update + `space_categories` 직접 CRUD(`can_curate_space`) + `space_join_requests` 직접 delete(요청 취소/거절) 뿐이다.

## Private helper

| 함수                                         | 용도                                                                                                                                                                                                                                                                    |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `private.is_space_member(space_id, roles?)`  | 활성 space의 비차단 멤버인지 (역할 필터 옵션)                                                                                                                                                                                                                           |
| `private.can_manage_space(space_id, roles?)` | **운영 권한** = owner/admin. 사람과 규칙을 다루는 일 전부(설정·초대·가입승인·삭제·익명정지·역할변경)                                                                                                                                                                    |
| `private.can_curate_space(space_id)`         | **게시판 정리 권한** = owner/admin/**manager**. 글 고정/해제(`set_post_pinned`)와 카테고리 관리(`space_categories` RLS). `can_manage_space`와 다른 층이다 — 게시판을 굴리는 일과 사람을 다루는 일은 다른 신뢰를 요구한다                                                |
| `private.can_participate_space(space_id)`    | 참여(읽기·댓글·반응) 가능 여부. 모든 공간이 멤버십을 요구하므로 `is_space_member`와 같다. content 도메인 RLS가 사용                                                                                                                                                     |
| `private.can_post_in_space(space_id)`        | **메인 글**을 쓸 수 있는지. `post_policy='managers'`면 owner/admin/manager로 좁히고, 아니면 `can_participate_space`와 같다. `posts_insert` 정책과 `create_post_with_attachments`가 **둘 다** 부른다 — 후자는 security definer라 RLS를 지나치므로 정책만으로는 못 막는다 |

## Trigger

| 트리거                     | 테이블          | 이벤트                                           | side effect                                       |
| -------------------------- | --------------- | ------------------------------------------------ | ------------------------------------------------- |
| `trg_validate_space_owner` | `space_members` | AFTER INSERT/UPDATE/DELETE (deferred constraint) | space당 owner가 정확히 1명이 아니면 트랜잭션 거부 |

## 주의

- `spaces`의 update는 **컬럼 단위**로 관리자(owner/admin)에게만 열려 있다: `name`, `description`, `allow_anonymous_posts`, `post_policy`. `join_policy`는 전환 시 대기 중인 가입 요청을 정리해야 해서 빠져 있다(RPC가 갈 자리). `member_count`는 캐시라 join/leave RPC만 건드리고, `image_url`은 storage finalize RPC가 필요하다.
- `allow_anonymous_posts`를 꺼도 **이미 올라간 익명 글은 그대로 익명이다.** `posts.is_anonymous`는 불변이라(update 컬럼 grant에 없다) 소급해서 작성자가 공개되지 않는다 — 익명을 믿고 쓴 사람을 배신하지 않기 위해서다. 강제는 `trg_enforce_anonymous_allowed_*`(03-content)가 insert 시점에 한다.

- `member_count` = 밴되지 않은 `space_members` 행 수, **탈퇴(withdrawn) 사용자는 포함**(허용된 근사). membership RPC들이 증감시키며, 모든 이벤트가 space 도메인 안이라 유지 가능하다. 탈퇴는 identity 도메인에서 일어나 여기를 건드리지 않으므로 약간 과다 계수되지만, 계정 삭제는 드물고 `greatest(-1,0)` 클램프가 있으며 재보정(reconcile) 경로는 없다. 정확한 수가 필요하면 `count(*)`로 센다.
- soft delete 전제(`deleted_at`/`deleted_by`). active group 이름은 `lower(btrim(name))` unique.
- `pub_id`는 storage `space-images` 경로 첫 세그먼트로 쓰이므로 슬래시 금지 슬러그로 제약한다.
- 초대장은 공유 링크(대상 미지정)와 대상 지정을 모두 지원한다(`target_user_id`). 만료/폐기로 무효화하며, 사용 횟수 제한(`max_uses`)은 제거했다 — 공유 링크는 기한으로, 대상 지정은 그 사람만 수락하므로 본질적으로 1회다.
- **어떤 초대도 30일을 넘겨 유효할 수 없다**(`create_space_invite`가 강제, 미지정이면 30일로 채움). '영원한 초대'를 없애 유출된 링크의 수명을 자른다. "보통 며칠"이라는 초대별 기본값(예: 1:1은 7일)은 정책이라 UI가 정한다. 서버는 상한만 본다.
