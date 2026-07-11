# 02. Spaces

Source: [`supabase/schemas/02-spaces.sql`](../../../supabase/schemas/02-spaces.sql)

커뮤니티/그룹 컨테이너와 membership. 게시글·알림·운영 권한 판단의 기준 단위.

## 가입 정책 (`space_join_policy`)

**모든 공간이 참여(글 읽기·쓰기)에 멤버십을 요구한다.** 정책은 '어떻게 멤버가 되는가'만 가른다.

| 값 | 검색/디렉토리 | 가입 방식 |
| --- | --- | --- |
| `public` (가입) | 노출 | 스스로 즉시 가입(`join_space` → `'joined'`), 승인 불필요 |
| `request` (승인가입) | 노출 | 가입 요청(`join_space` → `'requested'`) 후 매니저 승인(`approve_join_request`) |
| `invite_only` (초대장) | **비노출** | 초대장 토큰으로만(`accept_space_invite`) |

기본값은 `public`. `public`/`request`는 accepted 사용자에게 목록 노출(`spaces_select`), `invite_only`는 멤버에게만 노출된다.

과거 `open`(가입 없이 참여 자유)은 제거했다 — 멤버십이 참여의 유일한 기준이 되어 `member_count`가 모든 공간에서 같은 뜻(참여자 수)을 갖도록 하기 위함이다.

`request` 공간의 대기 요청은 `space_members`가 아니라 `space_join_requests`에 산다. 승인 전까지는 멤버가 아니므로, `is_space_member`·`member_count`·owner 유일성 같은 멤버십 불변식을 전혀 건드리지 않는다.

## 테이블

- `spaces` — type(`group`=공식/`community`=비공식), `join_policy`, `member_count` 캐시, soft delete. `pub_id`는 **text 슬러그**(공유 링크용, 소문자·숫자·하이픈 3 ~ 50자, unique, 기본값 자동 12자 hex)
- `space_members` — `(space_id, user_id)` PK. 역할(`owner`/`admin`/`manager`/`member`), 알림 설정, **개인용 `pinned_at`**(가입한 그룹 상단 고정), ban 상태
- `space_invites` — 초대장. `token`(unique, 링크에 실리는 비밀값)으로 식별. **`target_user_id`가 null이면 공유 링크**(토큰 아는 사람 누구나), **값이 있으면 그 사람만 수락 가능한 대상 지정 초대**. `expires_at`(만료)·`revoked_at`(폐기)로 무효화한다. `target_user_id`는 `on delete cascade`(대상 삭제 시 초대도 삭제 — set null이면 대상 지정 초대가 공유 링크로 격하되어 위험). 관리자만 조회
- `space_join_requests` — `(space_id, user_id)` PK. `request` 공간의 대기 중인 가입 요청. 조회·삭제는 본인 또는 매니저(RLS). insert는 `join_space` RPC(정의자 권한)만, 승인은 `approve_join_request`만
- `space_categories` — 그룹별 게시판/말머리(정보·공식·잡담, 학생회 업무 구분 등). `(space_id, lower(btrim(name)))` unique로 그룹 내 이름 중복 금지, `sort_order`로 탭 표시 순서. 조회는 멤버, 관리(생성·수정·삭제)는 매니저(owner/admin). 글은 하나의 카테고리에 속한다(`posts.category_id`, 선택). 0개면 프론트는 분류 없이 전체를 보여준다

## RPC

| 함수 | 인증 | 쓰기 | 목적 |
| --- | --- | --- | --- |
| `join_space(space_id)` | accepted | O | `'joined'`(public 즉시 가입 또는 이미 멤버) 또는 `'requested'`(request 공간 요청 적재)를 반환. invite_only·밴은 거부. 즉시 가입 시 member_count 증가 |
| `approve_join_request(space_id, user_id)` | space 매니저 | O | request 공간의 가입 요청 승인 → 멤버 승격 + member_count 증가. 거절·요청취소는 `space_join_requests` 직접 delete(본인/매니저) |
| `leave_space(space_id)` | accepted 멤버 | O | 본인 탈퇴 (owner는 이양 먼저). member_count 감소 |
| `create_space_invite(space_id, target_user_id?, expires_at?)` | space 매니저(owner/admin) | O | 초대장 토큰 발급. `target_user_id` 지정 시 그 사람만 수락 가능(실존 accepted 사용자여야). `expires_at` 최대 30일(초과 거부), 미지정 시 30일로 채움 |
| `accept_space_invite(token)` | accepted | O | 토큰 검증 후 멤버 합류. 대상 지정 초대는 대상 본인만(아니면 일반 무효 메시지로 거부), 이미 멤버면 no-op, 밴이면 거부. member_count 증가 |
| `revoke_space_invite(invite_id)` | space 매니저 | O | 초대장 폐기 |

space 생성(`create_space`)·소유권 이양 등은 아직 없다. 테이블 직접 insert는 service_role만 가능하고, authenticated의 쓰기 경로는 위 membership/invite RPC + `space_members`의 `notification_setting`/`pinned_at` update + `space_join_requests` 직접 delete(요청 취소/거절) 뿐이다.

## Private helper

| 함수 | 용도 |
| --- | --- |
| `private.is_space_member(space_id, roles?)` | 활성 space의 비차단 멤버인지 (역할 필터 옵션) |
| `private.can_manage_space(space_id, roles?)` | 기본 owner/admin 여부 (`is_space_member` 위임) |
| `private.can_participate_space(space_id)` | 글 읽기/쓰기 참여 가능 여부. 모든 공간이 멤버십을 요구하므로 `is_space_member`와 같다. content 도메인 RLS가 사용 |

## Trigger

| 트리거 | 테이블 | 이벤트 | side effect |
| --- | --- | --- | --- |
| `trg_validate_space_owner` | `space_members` | AFTER INSERT/UPDATE/DELETE (deferred constraint) | space당 owner가 정확히 1명이 아니면 트랜잭션 거부 |

## 주의

- `member_count` = 밴되지 않은 `space_members` 행 수, **탈퇴(withdrawn) 사용자는 포함**(허용된 근사). membership RPC들이 증감시키며, 모든 이벤트가 space 도메인 안이라 유지 가능하다. 탈퇴는 identity 도메인에서 일어나 여기를 건드리지 않으므로 약간 과다 계수되지만, 계정 삭제는 드물고 `greatest(-1,0)` 클램프가 있으며 재보정(reconcile) 경로는 없다. 정확한 수가 필요하면 `count(*)`로 센다.
- soft delete 전제(`deleted_at`/`deleted_by`). active group 이름은 `lower(btrim(name))` unique.
- `pub_id`는 storage `space-images` 경로 첫 세그먼트로 쓰이므로 슬래시 금지 슬러그로 제약한다.
- 초대장은 공유 링크(대상 미지정)와 대상 지정을 모두 지원한다(`target_user_id`). 만료/폐기로 무효화하며, 사용 횟수 제한(`max_uses`)은 제거했다 — 공유 링크는 기한으로, 대상 지정은 그 사람만 수락하므로 본질적으로 1회다.
- **어떤 초대도 30일을 넘겨 유효할 수 없다**(`create_space_invite`가 강제, 미지정이면 30일로 채움). '영원한 초대'를 없애 유출된 링크의 수명을 자른다. "보통 며칠"이라는 초대별 기본값(예: 1:1은 7일)은 정책이라 UI가 정한다. 서버는 상한만 본다.
