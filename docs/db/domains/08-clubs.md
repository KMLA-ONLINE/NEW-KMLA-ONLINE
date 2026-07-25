# 08. Clubs

Source: [`supabase/schemas/08-clubs.sql`](../../../supabase/schemas/08-clubs.sql)

동아리 catalog, 앱 관리자와 동아리별 관리자 권한, 전역 모집 라운드, 동아리별 모집 설정, 사용자 지원 row를 관리한다.

## 테이블

- `clubs` — 동아리 이름, 소개, 카드 소개, 이모지, 이미지 URL, 활동 시간·장소, 구분(`major`/`general`). 이름은 unique
- `club_apply_rounds` — 전체 동아리에 적용되는 모집 기간. `starts_at`/`ends_at`으로 열림 여부를 판단
- `club_managers` — `(club_id, user_id)`별 동아리 관리자. 임명은 앱 관리자만 가능
- `club_recruitments` — 라운드별·동아리별 모집 활성화와 공고
- `clubs_apply` — 사용자의 동아리 지원. `(round_id, user_id, club_id)` unique
- `club_settings` — 동아리 페이지 전체 공개 여부를 보관하는 singleton

## 관리자 구분

앱 관리자와 동아리별 관리자는 서로 다른 권한이다.

| 역할 | source of truth | 권한 |
| --- | --- | --- |
| 앱 관리자 | `profiles.role = 'admin'` | 동아리 관리자 임명·해제, 모집 라운드와 전체 페이지 설정, 모든 동아리 편집·지원자 조회 |
| 동아리 관리자 | `club_managers (club_id, user_id)` | 자신이 맡은 동아리 정보·모집 공고 편집, 해당 동아리 지원자 조회 |
| 일반 사용자 | accepted profile | 동아리 조회, 열린 모집에 본인 지원·취소 |

동아리 관리자가 앱 관리자 권한을 얻는 것은 아니며, 다른 동아리나 전역 설정을 관리할 수 없다. 앱 관리자는 `private.is_app_admin()`, 동아리 권한은 `private.manages_club(club_id)`로 각각 판별한다.

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
| 지원 목록 조회 | 본인 지원, 앱 관리자 전체, 동아리 관리자는 담당 동아리 |
| 지원 생성 | 본인 `user_id`, 페이지 공개 + 모집 기간 + 해당 동아리 모집 활성화 |
| 지원 취소 | 앱 관리자 또는 해당 동아리 관리자 |
| 동아리 정보·모집 공고 관리 | 앱 관리자 또는 해당 동아리 관리자 |
| 라운드·관리자 임명·페이지 공개 관리 | 앱 관리자 |

## RPC

| 함수 | 호출자 | 용도 |
| --- | --- | --- |
| `get_my_club_access()` | authenticated | 현재 profile id, 앱 관리자 여부, 담당 동아리 id 목록 반환 |

나머지 관리는 direct insert/update/delete와 RLS로 제한한다. 향후 모집 지원자를 모아 단체 대화를 만드는 기능이 필요하면 별도의 RPC로 추가한다. 현재 schema에는 지원 row와 대화방의 연결 컬럼이 없다.

## Private helper

| 함수 | 용도 |
| --- | --- |
| `private.manages_club(club_id)` | 현재 사용자가 해당 동아리 관리자인지 확인 |
| `private.is_club_round_open(round_id)` | 현재 시각이 해당 모집 라운드 안인지 확인 |
| `private.is_club_recruiting(round_id, club_id)` | 페이지·기간·동아리별 모집 설정을 함께 확인 |

## UI mock 연결

동아리 mock은 생성된 Supabase 타입을 기준으로 작성한다.

- `Database["public"]["Tables"]["clubs"]["Row"]`
- `Database["public"]["Tables"]["club_apply_rounds"]["Row"]`
- `Database["public"]["Tables"]["clubs_apply"]["Row"]`

`slug`, 대화방 ID는 아직 UI 확인용 필드다. 카드 소개, 이미지 URL, 활동 시간·장소, 관리자 관계와 모집 공고는 DB에 반영되어 있다.

`club_type`은 화면에서 다음처럼 표시한다.

| DB 값 | 화면 표시 |
| --- | --- |
| `major` | 수동 |
| `general` | 목동 |

## 주의

- 지원 가능 여부의 source of truth는 `club_settings.page_open`, 모집 라운드 시간, `club_recruitments.enabled`와 RLS다.
- 앱 관리자와 동아리 관리자는 별도 관계이며 동아리 관리자에게 앱 전역 권한을 부여하지 않는다.
- 지원자는 열린 모집에 본인 지원만 생성할 수 있고, 생성한 지원을 직접 취소할 수 없다.
- 지원 취소는 앱 관리자 또는 해당 동아리 관리자만 할 수 있다.
- 지원 인덱스는 unique `(round_id, user_id, club_id)`, 동아리별 목록 `(club_id, round_id, created_at)`, 사용자 FK 역조회 `(user_id)`로 역할을 나눠 중복 선두 컬럼을 두지 않는다.
