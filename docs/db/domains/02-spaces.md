# 02. Spaces

Source: [`supabase/schemas/02-spaces.sql`](../../../supabase/schemas/02-spaces.sql)

커뮤니티/그룹 컨테이너와 membership. 게시글·알림·운영 권한 판단의 기준 단위.

## 가입 정책 (`space_join_policy`)

| 값 | 검색/디렉토리 | 비멤버 글 읽기·쓰기 | 가입 방식 |
| --- | --- | --- | --- |
| `open` (자유) | 노출 | **허용** | 가입 불필요(참여 자유) |
| `public` (가입) | 노출 | 불가 | 스스로 가입(`join_space`) |
| `invite_only` (초대장) | **비노출** | 불가 | 초대장 토큰으로만(`accept_space_invite`) |

기본값은 `public`. `open`/`public`은 accepted 사용자에게 목록 노출(`spaces_select`), `invite_only`는 멤버에게만 노출된다.

## 테이블

- `spaces` — type(`group`=공식/`community`=비공식), `join_policy`, `member_count` 캐시, soft delete. `pub_id`는 **text 슬러그**(공유 링크용, 소문자·숫자·하이픈 3~50자, unique, 기본값 자동 12자 hex)
- `space_members` — `(space_id, user_id)` PK. 역할(`owner`/`admin`/`manager`/`member`), 알림 설정, **개인용 `pinned_at`**(가입한 그룹 상단 고정), ban 상태
- `space_invites` — 초대장 공유 토큰. `token` unique, `max_uses`/`use_count`/`expires_at`/`revoked_at`로 사용 제한. 관리자만 조회

## RPC

| 함수 | 인증 | 쓰기 | 목적 |
| --- | --- | --- | --- |
| `join_space(space_id)` | accepted | O | open/public 공간 자기 가입 (invite_only는 거부). member_count 증가 |
| `leave_space(space_id)` | accepted 멤버 | O | 본인 탈퇴 (owner는 이양 먼저). member_count 감소 |
| `create_space_invite(space_id, max_uses?, expires_at?)` | space 매니저(owner/admin) | O | 초대장 토큰 발급 (open 공간은 거부) |
| `accept_space_invite(token)` | accepted | O | 토큰 검증 후 멤버 합류 (이미 멤버면 no-op). use_count/member_count 증가 |
| `revoke_space_invite(invite_id)` | space 매니저 | O | 초대장 폐기 |

space 생성(`create_space`)·소유권 이양 등은 아직 없다. `spaces`/`space_members`/`space_invites` 직접 insert는 service_role만 가능하고, authenticated 쓰기 경로는 위 membership/invite RPC + `space_members`의 `notification_setting`/`pinned_at` update 뿐이다.

## Private helper

| 함수 | 용도 |
| --- | --- |
| `private.is_space_member(space_id, roles?)` | 활성 space의 비차단 멤버인지 (역할 필터 옵션) |
| `private.can_manage_space(space_id, roles?)` | 기본 owner/admin 여부 (`is_space_member` 위임) |
| `private.can_participate_space(space_id)` | 글 읽기/쓰기 참여 가능 여부: 멤버이거나, `open` 공간의 accepted 비-밴 사용자. content 도메인 RLS가 사용 |

## Trigger

| 트리거 | 테이블 | 이벤트 | side effect |
| --- | --- | --- | --- |
| `trg_validate_space_owner` | `space_members` | AFTER INSERT/UPDATE/DELETE (deferred constraint) | space당 owner가 정확히 1명이 아니면 트랜잭션 거부 |

## 주의

- `member_count`는 캐시다. membership RPC들이 증감시키지만 재보정(reconcile) 경로는 없다.
- soft delete 전제(`deleted_at`/`deleted_by`). active group 이름은 `lower(btrim(name))` unique.
- `pub_id`는 storage `space-images` 경로 첫 세그먼트로 쓰이므로 슬래시 금지 슬러그로 제약한다.
- 초대장은 공유 토큰 방식(특정 사용자 지정 초대가 아님). 만료/사용횟수/폐기로 무효화한다.
