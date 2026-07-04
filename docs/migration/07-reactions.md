# 07. Reactions

- SQL 파일: `supabase/migrations/20260612120414_tables_reactions.sql`

## 역할

이 파일은 반응 종류 registry와 실제 반응 테이블을 만든다. 구조상 post와 comment는 같은 reaction type catalog를 공유한다.

## 관련 스키마

```text
reaction_types(
  id bigserial PK,
  key text,
  name text,
  icon text?,
  sort_order int2,
  created_at timestamptz
)

post_reactions(
  id bigserial PK,
  post_id bigint -> posts.id,
  user_id bigint -> profiles.id,
  reaction_type_id bigint -> reaction_types.id,
  created_at timestamptz,
  updated_at timestamptz?
)

comment_reactions(
  id bigserial PK,
  comment_id bigint -> comments.id,
  user_id bigint -> profiles.id,
  reaction_type_id bigint -> reaction_types.id,
  created_at timestamptz,
  updated_at timestamptz?
)
```

## 현재 작동 방식

### reaction registry

- `reaction_types`는 사용 가능한 반응 종류를 담는 registry다.
- 각 row는 다음 성격을 가진다.
  - 내부 id
  - 기계적 key
  - 표시 이름 `name`
  - 선택 아이콘 `icon`
  - 정렬용 `sort_order`
- 초기값으로 아래 두 반응을 넣는다.
  - `like / 좋아요`
  - `love / 하트`

### subject reactions

- `post_reactions`는 특정 post에 대한 특정 사용자의 반응을 담는다.
- `comment_reactions`는 특정 comment에 대한 특정 사용자의 반응을 담는다.
- 둘 다 `reaction_type_id`를 통해 registry를 참조한다.

## 현재 사용하는 RPC

- 사용자 post/comment reaction은 현재 direct SQL + RLS 경로를 사용한다.
- reaction registry 관리만 RPC를 사용한다.
  - `upsert_reaction_type()`: reaction type 추가/수정

## 권한과 쓰기 경로

- 실제 user identity stamping, 중복 방지, 접근 제어는 later migration에서 완성된다.
- post 반응 수 cache는 later trigger/RPC에서 연동된다.

## 현재 주의점

- 반응 종류와 반응 행은 여기서 분리되지만, “한 사용자당 하나의 반응만 허용” 같은 정책은 이 파일 alone으로는 보장되지 않는다.

## 미구현 / 계약과 차이

- registry key unique와 per-user uniqueness는 later constraint migration에서 붙는다.
- stamp trigger와 RLS는 later migration에서 구현된다.
