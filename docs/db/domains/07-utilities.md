# 07. Utilities

Source: [`supabase/schemas/07-utilities.sql`](../../../supabase/schemas/07-utilities.sql)

공강, 노래방 예약과 노래 신청을 관리한다.

## 테이블

- `gongangs` — 기존 장소·요일·시간 범위 데이터
- `song_requests` — 노래 URL 신청
- `utility_bookings` — 이번 주 공강·노래방 신청

## 권한

- `gongang` — 공강 조회·신청
- `karaoke` — 노래방 조회·신청
- `gongang_master` — 공강 신청자 지정·초기화
- `karaoke_master` — 노래방 신청자 지정·초기화
- 앱 관리자도 두 기능의 마스터로 처리한다.

## RPC

| 함수 | 용도 |
| --- | --- |
| `get_my_utility_access()` | 현재 사용자의 공강·노래방 권한 반환 |
| `get_current_utility_bookings()` | 현재 주 예약 조회 |
| `create_utility_booking()` | 공강 또는 노래방 신청 |
| `cancel_utility_booking()` | 본인 또는 마스터가 예약 취소 |
| `reset_current_utility_bookings()` | 마스터가 현재 주 예약 초기화 |

현재 주는 한국 시간 기준 월요일부터 일요일이다. 새로운 주가 시작되면 이전 주 예약은 화면에 표시되지 않는다.
