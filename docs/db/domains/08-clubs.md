# 08. Clubs

Source: [`supabase/schemas/08-clubs.sql`](../../../supabase/schemas/08-clubs.sql)

동아리 catalog, 전역 모집 라운드, 사용자 지원 row를 관리한다.

## 테이블

- `clubs` — 동아리 이름, 소개, 구분(`major`/`general`). 이름은 unique
- `club_apply_rounds` — 전체 동아리에 적용되는 모집 기간. `starts_at`/`ends_at`으로 열림 여부를 판단
- `clubs_apply` — 사용자의 동아리 지원. `(round_id, user_id, club_id)` unique

## 모집 라운드

`club_apply_rounds`에는 별도의 상태나 `is_active` 컬럼이 없다. 현재 시간이 아래 범위에 포함되는지로 모집 중 여부를 판단한다.

```text
starts_at <= now() < ends_at
```

`apply_range`는 `[starts_at, ends_at)` 범위로 생성되며 gist exclusion constraint가 서로 겹치는 라운드를 막는다. 따라서 동시에 열린 모집 라운드는 하나뿐이다.

## 지원

한 사용자는 같은 라운드에서 여러 동아리에 지원할 수 있다. 같은 동아리에 중복 지원하는 것만 unique constraint로 차단한다.

지원 row에는 심사, 합격, 불합격 상태가 없다. 이 도메인은 신청 수집까지만 담당한다.

| 작업 | 조건 |
| --- | --- |
| 지원 목록 조회 | accepted 사용자 |
| 지원 생성 | 본인 `user_id`, 모집 기간 안 |
| 지원 취소 | 본인 row, 모집 기간 안 |
| 동아리·라운드 관리 | service role |

## RPC

없음. 동아리 catalog와 모집 라운드는 service role에서 관리하고, 사용자의 지원 생성·취소는 `clubs_apply` direct insert/delete와 RLS로 처리한다.

향후 모집 지원자를 모아 단체 대화를 만드는 기능이 필요하면 별도의 RPC로 추가한다. 현재 schema에는 지원 row와 대화방의 연결 컬럼이 없다.

## Private helper

| 함수 | 용도 |
| --- | --- |
| `private.is_club_round_open(round_id)` | 현재 시각이 해당 모집 라운드 안인지 확인 |

## UI mock 연결

동아리 mock은 생성된 Supabase 타입을 기준으로 작성한다.

- `Database["public"]["Tables"]["clubs"]["Row"]`
- `Database["public"]["Tables"]["club_apply_rounds"]["Row"]`
- `Database["public"]["Tables"]["clubs_apply"]["Row"]`

목록용 짧은 소개, slug, 이미지 미리보기, 활동 시간·장소, 관리자 목록, 모집 공고 Markdown, 대화방 ID는 현재 UI 확인용 필드다. 실제 DB 컬럼이 아니므로 저장 기능을 붙일 때는 먼저 schema migration을 추가하고 `database.types.ts`를 다시 생성해야 한다.

`club_type`은 화면에서 다음처럼 표시한다.

| DB 값 | 화면 표시 |
| --- | --- |
| `major` | 수동 |
| `general` | 목동 |

## 주의

- 지원 가능 여부의 source of truth는 UI 스위치가 아니라 모집 라운드 시간과 RLS다.
- `clubs`에는 현재 이미지 URL이나 관리자 관계가 없다.
- 지원 insert/delete는 라운드가 열린 동안 본인 row만 가능하다.
