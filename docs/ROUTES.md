## 5. Route

## 루트 / 인증

| Route | 설명 | 접근 권한 |
| --- | --- | --- |
| `/` | 로그인 여부와 승인 상태에 따라 `/`, `/login`, `/profile/set`, `/pending`으로 분기 | 전체 |
| `/login` | Google OAuth 로그인? | 비로그인 |
| `/logout` | 로그아웃 처리 | 로그인 유저 |

## 가입 / 승인

| Route | 설명 | 접근 권한 |
| --- | --- | --- |
| `/profile/set` | 가입 후 기본 정보 입력: 이름, 학번, 행정반, 기수, 성별, 전화번호, 생일 | 로그인 유저, status 미완료 |
| `/pending` | 관리자 승인 대기 페이지 | status = pending |
| `/rejected` | 가입 승인 거절 안내 | status = rejected |

## 홈 / 메뉴 / 검색

| Route | 설명 | 접근 권한 |
| --- | --- | --- |
| `/` | 메인 페이지: 이름, 학번, 즐겨찾기 그룹, 오늘의 급식, 메뉴 바로가기 | accepted 유저 |
| `/search` | 전체 검색: 그룹, 사용자 검색 | accepted 유저 |
| `/menu` | 설정, 바로가기, 프로필 수정, 로그아웃 | accepted 유저 |

## 프로필

| Route | 설명 | 접근 권한 |
| --- | --- | --- |
| `/profile` | 내 프로필 | accepted 유저 |
| `/profile/edit` | 내 프로필 수정 | accepted 유저 |
| `/profile/:userId` | 다른 사용자 프로필 | accepted 유저 |
| `/profile/:userId/posts` | 해당 사용자가 작성한 게시글 목록 | accepted 유저 + 조회 권한 |

## 그룹

| Route | 설명 | 접근 권한 |
| --- | --- | --- |
| `/groups` | 공식 게시판, 사설 게시판, 즐겨찾는 게시판 목록 | accepted 유저 |
| `/groups/new` | 사설 그룹 생성 | accepted 유저 |
| `/groups/:groupId` | 그룹 홈 / 게시글 목록 | 그룹 접근 권한 |
| `/groups/:groupId/about` | 그룹 설명 | 그룹 접근 권한 |
| `/groups/:groupId/members` | 그룹 멤버 목록 | 그룹 접근 권한 |
| `/groups/:groupId/settings` | 알림 설정, 그룹 나가기, 즐겨찾기, 신고 | 그룹 멤버 |
| `/groups/:groupId/manage` | 그룹명/설명 수정, 멤버 관리 | group owner/admin 또는 site admin |
| `/groups/:groupId/search` | 그룹 내 게시글 검색 | 그룹 접근 권한 |
| `/groups/:groupId/media` | 그룹 내 게시글 이미지 모음 | 그룹 접근 권한 |

## 게시글

| Route | 설명 | 접근 권한 |
| --- | --- | --- |
| `/groups/:groupId/posts/new` | 그룹 게시글 작성 | 그룹 멤버 |
| `/groups/:groupId/posts/:postId` | 게시글 상세, 댓글, 답글, 반응 | 게시글 접근 권한 |
| `/groups/:groupId/posts/:postId/edit` | 게시글 수정 | 작성자 |

## 댓글 / 반응

| 위치 | 설명 | 접근 권한 |
| --- | --- | --- |
| 게시글 상세 내부 | 댓글 작성 | 그룹 멤버 |
| 게시글 상세 내부 | 댓글 수정 | 작성자 |
| 게시글 상세 내부 | 댓글 삭제 | 작성자, group admin/owner, site admin |
| 게시글 목록 / 상세 내부 | 게시글 반응 | 게시글 접근 권한 |
| 게시글 상세 내부 | 댓글 반응 | 게시글 접근 권한 |

## 채팅

| Route | 설명 | 접근 권한 |
| --- | --- | --- |
| `/chat` | 채팅방 목록 | accepted 유저 |
| `/chat/new` | 새 1:1 채팅 또는 그룹 채팅 생성 | accepted 유저 |
| `/chat/:roomId` | 채팅방 상세 | chat room member |
| `/chat/:roomId/settings` | 채팅방 설정 / 멤버 확인 | chat room member |

## 알림

| Route | 설명 | 접근 권한 |
| --- | --- | --- |
| `/noti` | 알림 목록. 채팅 알림은 제외 | accepted 유저 |

## 공강 / 생활 기능

| Route | 설명 | 접근 권한 |
| --- | --- | --- |
| `/gongang` | 공강 목록 / 예약 현황 | accepted 유저 |
| `/karaoke` | 노래방 관련 기능 | accepted 유저 + karaoke permission |
| `/meal` | 오늘의 급식 | accepted 유저 |
| `/timetable` | 시간표 | accepted 유저 |

## 기상송

| Route | 설명 | 접근 권한 |
| --- | --- | --- |
| `/gisangsong` | 기상송 목록 / 오늘의 기상송 | accepted 유저 |
| `/gisangsong/request` | 기상송 신청 | accepted 유저 |
| `/admin/gisangsong` | 기상송 관리 | site admin |

## 동아리

| Route | 설명 | 접근 권한 |
| --- | --- | --- |
| `/clubs` | 동아리 목록 | accepted 유저 |
| `/clubs/:clubId` | 동아리 상세 | accepted 유저 |
| `/clubs/:clubId/applications` | 동아리 신청 | accepted 유저 |
| `/admin/clubs` | 동아리 생성 / 수정 / 삭제 | site admin |
| `/admin/clubs/:clubId/applications` | 동아리 신청자 관리 | site admin 또는 club manager |

## 관리자 - 미정

## 에러 / 상태

| Route | 설명 | 접근 권한 |
| --- | --- | --- |
| `/403` | 접근 권한 없음 | 전체 |
| `/404` | 존재하지 않는 페이지 | 전체 |
| `/500` | 서버 오류 | 전체 |