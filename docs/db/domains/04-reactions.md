# 04. Reactions

Source: [`supabase/schemas/04-reactions.sql`](../../../supabase/schemas/04-reactions.sql)

반응 종류 registry와 post/comment 반응. message 반응 테이블은 chat 도메인에 있다.

## 테이블

- `reaction_types` — key/이름/아이콘 registry (seed: `like`, `love` — baseline migration)
- `post_reactions` — `(post_id, user_id)` unique, 사용자당 post 하나의 반응
- `comment_reactions` — `(comment_id, user_id)` unique

## RPC

없음. 사용자 반응은 direct insert/update/delete + RLS로 처리한다. registry 관리 RPC(`upsert_reaction_type`)는 2026-07 정리에서 제거됐다 — registry 변경은 service-role 직접 SQL.

## Private helper

없음 (content 도메인의 `can_access_post`/`can_access_comment`를 policy에서 사용).

## Trigger

없음.
