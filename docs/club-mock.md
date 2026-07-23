# Club mock 설계

이 문서는 백엔드를 구현하지 않은 상태에서 동아리 페이지의 라우트, 상태, 권한, 향후 스키마와 RPC 방향을 정리한다.

기존 `supabase/schemas/08-clubs.sql`과 `docs/db/domains/08-clubs.md`는 건드리지 않는다. domain 문서는 실제 SQL source of truth와 1:1로 동기화되어야 하므로, mock UI만 만든 작업에서 내용을 바꾸면 문서가 실제 DB와 어긋난다.

## 라우트

| 경로 | 목적 |
| --- | --- |
| `/clubs` | 동아리 검색, 의미 있는 필터, 내 지원 현황 |
| `/clubs?as=admin` | 앱 관리자 관점 목록 미리보기 |
| `/clubs/:clubId` | 동아리 소개, 모집 공고, 1:1 지원 |
| `/clubs/:clubId?as=admin` | 공고 편집, 지원자 관리, 운영진 관리 mock |

별도의 `/apply` 라우트는 만들지 않는다. 지원 내용은 사이트 자체 폼에 저장하지 않고 동아리 관리자와의 1:1 대화에서 전달한다.

## 필터 UX

필터는 사용자가 다음 행동을 결정하는 데 직접 도움이 되는 것만 둔다.

- 수동 / 목동
- 모집 중 / 모집 예정 / 마감 이후
- 이름과 활동 내용 검색

`Early`와 `일반`은 카드에서 정보로 표시하지만 기본 필터로 두지 않는다. 이것만으로 동아리를 선택하는 경우가 적고, 필터가 많아질수록 빈 결과 화면이 자주 나오기 때문이다. 운영 결과를 보고 실제 사용성이 확인되면 추가한다.

## 상태

### 모집

- `upcoming`: 모집 시작 전
- `open`: 지원 가능
- `reviewing`: 마감 후 심사 중
- `announced`: 결과 발표
- `closed`: 모집 완전 종료

UI에 저장된 상태만 믿지 않는다. 실제 백엔드에서는 서버 시간이 `starts_at <= now() < ends_at`인지 다시 확인해야 한다.

### 지원

- `submitted`: 관리자와 1:1 지원 대화를 시작하고 접수
- `reviewing`: 관리자가 검토 중으로 변경
- `accepted`: 합격
- `rejected`: 불합격
- `withdrawn`: 지원 취소

지원서 본문은 채팅 메시지에 남고, application row에는 대화방 참조와 상태만 저장한다.

## 제안 스키마

### `clubs`

- `id`
- `pub_id`
- `name`
- `division` (`sudo` / `mokdong`)
- `summary`
- `description_markdown`
- `emoji`
- `meeting_text`
- `location`
- `member_count`
- `created_at`
- `updated_at`
- `deleted_at`

### `club_managers`

- `club_id`
- `user_id`
- `role` (`owner` / `admin` / `editor`)
- `created_at`

동아리별 owner는 정확히 한 명이어야 한다.

### `club_recruitment_rounds`

- `id`
- `club_id`
- `title`
- `kind` (`early` / `regular`)
- `announcement_markdown`
- `starts_at`
- `ends_at`
- `result_at`
- `capacity`
- `status`
- `created_by`
- `created_at`
- `updated_at`

지원 가능 여부는 status와 서버 시간을 함께 확인한다. 마감된 라운드는 지원 시작 RPC에서 거절한다.

### `club_applications`

- `id`
- `round_id`
- `club_id`
- `applicant_id`
- `conversation_id`
- `status`
- `submitted_at`
- `reviewed_at`
- `reviewed_by`

`(round_id, applicant_id)`는 unique다. 지원 내용 자체는 `conversation_id`가 가리키는 1:1 채팅에 저장한다.

## 권한

| 작업 | app admin | club owner | club admin | editor |
| --- | --- | --- | --- | --- |
| 동아리 생성/삭제 | O | X | X | X |
| 동아리 기본 정보 편집 | O | O | O | O |
| 모집 라운드 생성/마감 | O | O | O | X |
| 지원자 상태 변경 | O | O | O | X |
| 운영진 변경 | O | O | X | X |
| owner 이양 | O | O | X | X |

`?as=admin`은 개발용 미리보기일 뿐 실제 권한 판단에 사용하지 않는다.

## 제안 RPC

### 읽기

- `list_clubs(query, division, recruitment_state, limit, cursor)`
- `get_club(pub_id)`
- `list_my_club_applications()`
- `list_club_applicants(round_id)` — club owner/admin 또는 app admin

### 일반 사용자

- `start_club_application(round_id)`
  - 서버 시간으로 모집 중인지 검사
  - 기존 지원이 있으면 기존 conversation을 반환
  - 없으면 동아리 대표 관리자와 1:1 conversation을 만들고 application row를 생성
- `withdraw_club_application(application_id)`

### 동아리 관리자

- `create_club_recruitment_round(club_id, ...)`
- `update_club_recruitment_round(round_id, ...)`
- `close_club_recruitment_round(round_id)`
- `set_club_application_status(application_id, status)`
- `set_club_manager_role(club_id, user_id, role)`
- `transfer_club_ownership(club_id, new_owner_id)`

### 향후 기능

- 모집 마감 후 해당 round의 지원자 전원을 모아 그룹 대화를 생성하거나 관리자에게 생성 여부를 묻는 기능
- 합격자 전용 그룹 또는 동아리 공식 그룹과 자동 연결하는 기능

현재 mock 코드에는 단체 펨방 기능을 `TODO(backend)` 주석으로만 남긴다.

## Markdown과 이모지

- 동아리 소개와 모집 공고는 기존 `RichText` component를 사용한다.
- 이모지는 기존 `Twemoji` component를 사용한다.
- 현재 RichText가 지원하는 문법 범위를 넘는 편집 기능은 이 mock에서 새로 만들지 않는다.
- 작성자의 자유도를 위해 소개/활동/자격/기간을 고정 필드로 분리하지 않고 Markdown 본문 하나로 둔다.

## 반응형

- 모바일: 카드 1열, 상세 페이지 본문과 모집 패널 세로 배치
- 태블릿: 카드 2열
- 데스크톱: 카드 3열, 상세 페이지 본문과 우측 모집 패널 분리
- 관리자 탭은 모바일에서 가로 스크롤 가능
