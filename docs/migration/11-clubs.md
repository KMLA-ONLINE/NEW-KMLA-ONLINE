# 11. Clubs

- SQL 파일: `supabase/migrations/20260612120427_tables_clubs.sql`

## 역할

이 파일은 동아리 catalog와 지원 라운드 구조를 만든다. 데이터는 크게 세 층으로 나뉜다.

- `clubs`: 어떤 동아리가 있는가
- `club_apply_rounds`: 언제 지원을 받는가
- `clubs_apply`: 누가 어떤 라운드에 어떤 동아리에 지원했는가

## 관련 스키마

```text
clubs(
  id bigserial PK,
  name text,
  description text?,
  type club_type,
  created_at timestamptz
)

club_apply_rounds(
  id bigserial PK,
  name text,
  starts_at timestamptz,
  ends_at timestamptz,
  apply_range tstzrange generated stored,
  created_by bigint? -> profiles.id,
  created_at timestamptz
)

clubs_apply(
  id bigserial PK,
  round_id bigint -> club_apply_rounds.id,
  user_id bigint -> profiles.id,
  club_id bigint -> clubs.id,
  created_at timestamptz
)
```

## 현재 작동 방식

### clubs

- `clubs`는 동아리 기본 정보 테이블이다.
- 이름, 설명, 타입, 생성 시각을 가진다.

### apply rounds

- `club_apply_rounds`는 지원 기간 단위를 나타낸다.
- 시작/종료 시각과 함께 generated stored `apply_range`를 갖는다.
- 누가 만든 라운드인지 `created_by`를 남길 수 있다.

### applications

- `clubs_apply`는 round, user, club을 연결하는 지원 row다.
- 구조적으로는 “한 사용자가 한 라운드에서 어떤 동아리에 지원했는가”를 저장한다.

## 현재 사용하는 RPC

- 관리자용 catalog / round 관리
  - `create_club()`
  - `update_club()`
  - `delete_club()`
  - `create_club_apply_round()`
  - `update_club_apply_round()`
  - `delete_club_apply_round()`
- 일반 사용자의 지원 생성/취소는 현재 direct SQL + RLS 경로를 사용한다.

## 권한과 쓰기 경로

- 실제 관리 기능은 later RPC migration의 admin 함수로 모인다.
- 일반 사용자 직접 insert/delete 허용 범위는 later RLS migration에서 정해진다.

## 현재 주의점

- round는 단순 기간 row가 아니라 later exclusion constraint와 결합돼 “서로 겹치지 않는 모집 기간”으로 해석되는 구조다.
- application row는 이후 uniqueness와 round-open 판단 helper에 의존한다.

## 미구현 / 계약과 차이

- `clubs.name` unique, `(round_id, user_id, club_id)` unique, `starts_at < ends_at`, round overlap exclusion은 later constraint migration에서 완성된다.
- admin-only management와 applicant direct access 범위는 later RPC/RLS migration에서 보강된다.

## 기존 합의 세부 규칙

- `club_apply_rounds`는 generated stored `apply_range`를 사용한다.
- 기간이 겹치는 round는 exclusion constraint로 막는 방향을 유지한다.
- 신청은 accepted 사용자가 열린 round에 자기 `user_id`로만 생성하는 것이 원래 합의다.
- 신청 취소는 round 종료 전 본인 row delete만 허용하는 방향을 유지한다.
- clubs와 rounds의 생성/수정/삭제는 app admin RPC 전용을 목표로 한다.
