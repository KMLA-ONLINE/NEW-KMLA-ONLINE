# 04. Reactions

Source: [`supabase/schemas/04-reactions.sql`](../../../supabase/schemas/04-reactions.sql)

반응 종류 registry와 post/comment 반응. message 반응 테이블은 chat 도메인에 있다.

## 테이블

- `reaction_types` — key/이름/아이콘 registry (seed: `like`, `love` — baseline migration)
- `post_reactions` — `(post_id, user_id)` 자연 PK, 사용자당 post 하나의 반응 (surrogate id 없음). `is_anonymous`는 작성 당시 정책 스냅샷
  - `idx_post_reactions_post_created_at (post_id, created_at, user_id)` — `get_post_reactors`의 시간순 keyset용. `type_count` 인덱스는 `(post_id, reaction_type_id)`라 시간 정렬엔 못 쓴다.
- `comment_reactions` — `(comment_id, user_id)` 자연 PK. 같은 익명 스냅샷 규칙

## RPC

반응 **쓰기**(누르기/바꾸기/취소)는 여전히 RPC 없이 direct insert/update/delete + RLS로 처리한다. registry 관리 RPC(`upsert_reaction_type`)는 2026-07 정리에서 제거됐다 — registry 변경은 service-role 직접 SQL.

### 반응자 목록 (모달)

| RPC | 호출 | 역할 |
| --- | --- | --- |
| `get_post_reactors(p_post_id, p_reaction_type_id?, p_after_user_id?, p_limit=30)` | 카드/상세의 반응 요약 이모지 클릭 → "누가 어떤 이모지로" 모달 | 실명 반응자만 최신순으로 페이지네이션한다. |
| `get_post_anonymous_reaction_counts(p_post_id)` | 같은 모달 | 익명 반응을 개인 행·시각 없이 `reaction_type_id`별 count로 반환한다. |

- **security definer + `can_access_post` 게이트**: 접근 못 하는 글의 반응자 명단이 새지 않는다(존재 오라클 겸함). `get_post_reactors`는 실명 반응만 소유자 권한으로 `profiles.name`/`avatar_url`을 붙이고, 익명 반응은 반드시 count RPC로 분리한다. `avatar_url`은 원본 경로 그대로 내려주고 서명은 로더 몫.
- **keyset**: `(created_at, user_id)` 내림차순(최신 반응이 위). 커서는 직전 페이지 마지막 반응자의 `user_id`(자연 PK라 한 명을 유일하게 가리킴) — 그 행의 `created_at`을 되읽어 튜플 비교로 잇는다.
- **탭 필터**: `p_reaction_type_id`를 주면 그 타입만(모달의 타입 탭), null이면 전체.
- `p_limit`은 1 ~ 50, null이면 거부(`limit null`은 상한 없음 = 통째로 유출).

## Private helper

- `private.post_reaction_summary` / `private.comment_reaction_summary` — 상위 아이콘과 호출자의 반응 타입을 읽기 RPC에 묶는다.
- `private.set_reaction_anonymity` — 반응 대상 space의 작성 당시 정책을 `is_anonymous`에 저장한다.

## Trigger

| 트리거 | 테이블 | 이벤트 | side effect |
| --- | --- | --- | --- |
| `trg_set_post_reaction_anonymity` | `post_reactions` | BEFORE INSERT | `required` 공간이면 익명 스냅샷 |
| `trg_set_comment_reaction_anonymity` | `comment_reactions` | BEFORE INSERT | 대상 댓글의 space가 `required`면 익명 스냅샷 |

익명 행의 직접 SELECT는 본인 행에만 허용한다. UPDATE/DELETE가 자기 행을 찾는 데 필요하기 때문이다. 다른 멤버는 개별 `user_id`나 `created_at`을 볼 수 없고 타입별 집계만 읽는다. 정책 변경은 기존 반응에 소급되지 않는다.
