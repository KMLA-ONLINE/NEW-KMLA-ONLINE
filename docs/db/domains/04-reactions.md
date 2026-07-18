# 04. Reactions

Source: [`supabase/schemas/04-reactions.sql`](../../../supabase/schemas/04-reactions.sql)

반응 종류 registry와 post/comment 반응. message 반응 테이블은 chat 도메인에 있다.

## 테이블

- `reaction_types` — key/이름/아이콘 registry (seed: `like`, `love` — baseline migration)
- `post_reactions` — `(post_id, user_id)` 자연 PK, 사용자당 post 하나의 반응 (surrogate id 없음)
  - `idx_post_reactions_post_created_at (post_id, created_at, user_id)` — `get_post_reactors`의 시간순 keyset용. `type_count` 인덱스는 `(post_id, reaction_type_id)`라 시간 정렬엔 못 쓴다.
- `comment_reactions` — `(comment_id, user_id)` 자연 PK

## RPC

반응 **쓰기**(누르기/바꾸기/취소)는 여전히 RPC 없이 direct insert/update/delete + RLS로 처리한다. registry 관리 RPC(`upsert_reaction_type`)는 2026-07 정리에서 제거됐다 — registry 변경은 service-role 직접 SQL.

### 반응자 목록 (모달)

| RPC | 호출 | 역할 |
| --- | --- | --- |
| `get_post_reactors(p_post_id, p_reaction_type_id?, p_after_user_id?, p_limit=30)` | 카드/상세의 반응 요약 이모지 클릭 → "누가 어떤 이모지로" 모달 | 반응자를 한 명씩 최신순으로 페이지네이션. 요약(top 3 아이콘)과 달리 반응자 신원을 준다. |

- **security definer + `can_access_post` 게이트**: 접근 못 하는 글의 반응자 명단이 새지 않는다(존재 오라클 겸함). 반응자는 익명이 아니라 실명이라, `post_author`처럼 숨기지 않고 소유자 권한으로 `profiles.name`/`avatar_url`을 붙인다. `avatar_url`은 원본 경로 그대로 내려주고 서명은 로더 몫.
- **keyset**: `(created_at, user_id)` 내림차순(최신 반응이 위). 커서는 직전 페이지 마지막 반응자의 `user_id`(자연 PK라 한 명을 유일하게 가리킴) — 그 행의 `created_at`을 되읽어 튜플 비교로 잇는다.
- **탭 필터**: `p_reaction_type_id`를 주면 그 타입만(모달의 타입 탭), null이면 전체.
- `p_limit`은 1 ~ 50, null이면 거부(`limit null`은 상한 없음 = 통째로 유출).

## Private helper

없음 (content 도메인의 `can_access_post`/`can_access_comment`를 policy에서 사용).

## Trigger

없음.
