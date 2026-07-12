# 08. Clubs

Source: [`supabase/schemas/08-clubs.sql`](../../../supabase/schemas/08-clubs.sql)

동아리 catalog, 모집 라운드, 사용자 지원.

## 테이블

- `clubs` — 이름 unique, type(`major`/`general`)
- `club_apply_rounds` — 모집 기간. generated range + gist exclusion으로 라운드 겹침 금지
- `clubs_apply` — `(round_id, user_id, club_id)` unique 지원 row

## RPC

없음. 관리자용 catalog/round RPC(`create/update/delete_club`, `*_club_apply_round`)는 2026-07 정리에서 제거됐다 — catalog/round 관리는 service-role 직접 SQL. 사용자 지원 생성/취소는 direct insert/delete + RLS.

## Private helper

| 함수                                   | 용도                                                                   |
| -------------------------------------- | ---------------------------------------------------------------------- |
| `private.is_club_round_open(round_id)` | 현재 시각이 라운드 모집 기간 내인지 (지원 insert/delete policy의 조건) |

## Trigger

없음.

## 주의

- 지원 insert/delete는 라운드가 열려 있는 동안 본인 row만 가능하다.
