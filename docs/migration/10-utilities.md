
# 10. Utilities

- SQL 파일: `supabase/migrations/20260612120424_tables_utilities.sql`

## 역할

이 파일은 커뮤니티 기능 외에 별도 유틸리티 성격의 데이터 구조를 만든다. 현재는 공강 예약 성격의 `gongangs`와 요청 로그인 `song_requests`가 들어 있다.

## 관련 스키마

```text
gongangs(
  id bigserial PK,
  location gongang_location,
  owner_id bigint -> profiles.id,
  day_of_week int2,
  start_minute int2,
  end_minute int2,
  valid_from date,
  valid_until date,
  time_range int4range generated stored,
  validity_range daterange generated stored,
  created_at timestamptz
)

song_requests(
  id bigserial PK,
  requester_id bigint -> profiles.id,
  url text,
  requested_at timestamptz
)
```

## 현재 작동 방식

### gongangs

- `gongangs`는 시간/기간 기반 예약 데이터를 저장한다.
- row는 다음 정보를 가진다.
  - 위치 `location`
  - 소유자 `owner_id`
  - 요일 `day_of_week`
  - 시작/종료 분 단위 `start_minute`, `end_minute`
  - 유효 날짜 범위 `valid_from`, `valid_until`
- 여기에 두 generated stored range가 붙는다.
  - `time_range`
  - `validity_range`
- 즉 예약 충돌 검사나 범위 비교를 later constraint에서 쉽게 할 수 있도록, 기본 데이터와 파생 range를 같이 저장하는 구조다.

### song_requests

- `song_requests`는 별도 상태 컬럼이 없는 append-only 요청 로그다.
- 핵심 데이터는 `requester_id`, `url`, `requested_at`이다.

## 현재 사용하는 RPC

- 현재 이 도메인에는 전용 user-facing RPC가 없다.
- `gongangs`, `song_requests`는 direct SQL + RLS/GRANT 조합으로 사용하는 구조에 가깝다.

## 권한과 쓰기 경로

- 실제 owner stamping, permission 체크, CRUD 범위는 later RLS/RPC migration에서 결정된다.
- 현재 구조상 `gongangs`는 owner 중심 데이터, `song_requests`는 requester 중심 로그로 해석된다.

## 현재 주의점

- `gongangs`는 일반 scalar 컬럼과 range 컬럼을 동시에 갖는 구조라, 실제 충돌 차단은 later constraint migration에 의존한다.
- `song_requests`는 처리 상태가 없기 때문에, 애플리케이션 레벨에서 “요청됨” 이상의 lifecycle은 가지지 않는다.

## 미구현 / 계약과 차이

- 요일/시간/기간 check와 gongang overlap exclusion은 later constraint migration에서 붙는다.
- permission 기반 RLS와 identity stamping은 later migration에서 구현된다.

## 기존 합의 세부 규칙

- `gongangs`는 `time_range`, `validity_range` generated column을 사용한다.
- 같은 location/day/time/validity 충돌은 exclusion constraint로 막는 방향을 유지한다.
- `gongangs` mutation은 `gongang` permission 보유자 본인 행만 허용하는 것이 원래 합의다.
- `song_requests`는 처리 상태 없는 append-only 로그로 유지한다.
- song request URL은 HTTPS, 최대 2048자를 기준으로 한다.
- `song_requests`는 `karaoke` permission 보유자만 사용하고, 직접 UPDATE/DELETE는 금지하는 방향을 유지한다.
