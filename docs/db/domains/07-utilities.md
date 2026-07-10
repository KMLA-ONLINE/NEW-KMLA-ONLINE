# 07. Utilities

Source: [`supabase/schemas/07-utilities.sql`](../../../supabase/schemas/07-utilities.sql)

부가 기능: 공강 예약(`gongangs`)과 노래 신청(`song_requests`). 둘 다 permission 기반 접근.

## 테이블

- `gongangs` — 장소/요일/시간 range. generated range 컬럼 + gist exclusion으로 같은 장소·요일·기간의 시간 겹침 금지
- `song_requests` — https URL 신청

## RPC

없음. 모든 읽기/쓰기는 direct SQL + RLS로 처리한다.

## Private helper

없음 (identity 도메인의 `has_permission('gongang')`/`has_permission('karaoke')`를 policy에서 사용).

## Trigger

없음.

## 주의

- permission row(`gongang`, `karaoke`)가 없으면 접근이 전부 막힌다 — seed는 baseline migration에 있다.
- gongang 소유자만 자기 행을 insert/update/delete할 수 있다.
