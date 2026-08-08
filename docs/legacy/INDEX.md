# Legacy Design Reference Index

이 문서는 현재 KMLA Online 저장소를 새 프로젝트의 **디자인·사용자 흐름 참고 자료**로 탐색하기 위한
색인이다. 기존 코드를 새 프로젝트의 정답이나 복사 원본으로 만드는 것이 목적이 아니다.

## 1. 문서 범위

| 항목        | 값                                                                           |
| ----------- | ---------------------------------------------------------------------------- |
| 조사 기준일 | 2026-08-07                                                                   |
| 기준 HEAD   | `845f0ec0deec4ffb839f0432a1741e5e9c9a358b`                                   |
| 주 용도     | 화면 구성, 정보 위계, 상호작용, 상태, 반응형 패턴, 디자인 구조 조사          |
| 제외 범위   | Supabase 호출, DB 스키마, RPC, RLS, migration의 재사용 판단                  |
| 조사 방식   | 정적 코드, mock 시나리오, UI 관련 테스트와 문서 대조                         |
| 시각 검증   | 이 조사에서는 실행 화면 캡처를 검증하지 못했으므로 별도 브라우저 QA가 필요함 |

`docs/KMLA_ONLINE_FUNCTIONAL_SPEC.md`는 조사 시점의 작업 트리에는 있지만 위 기준 HEAD에는 포함되지
않아, 저장소를 동결할 때 이 문서와 함께 커밋하거나 별도의 고정 revision을 기록해야 한다.

## 2. 새 프로젝트 agent가 지켜야 할 사용법

### 2.1 자료의 지위

- 기존 저장소는 읽기 전용 디자인 증거 보관소다.
- 새 프로젝트의 사용자 지시, 제품 문서, 승인된 ADR과 디자인 시스템이 항상 우선한다.
- 기존 화면이 존재한다는 사실은 그 화면을 유지해야 한다는 뜻이 아니다.
- mock 데이터는 서버 계약이 아니라 UI가 표현하려 했던 상태와 엣지 케이스의 모음이다.
- 기존 컴포넌트를 통째로 복사하지 않는다. 정보 구조와 상호작용을 먼저 추출한 뒤 새 구조로 다시
  설계한다.
- 이 인덱스에서 제외한 Supabase 관련 코드는 디자인 판단 근거로 사용하지 않는다.

### 2.2 기능별 조사 순서

1. 이 문서의 `화면 지도`에서 작업할 화면을 찾는다.
2. 지정된 route module을 읽어 페이지의 정보 위계와 상태 전환을 확인한다.
3. `주요 UI`에 적힌 컴포넌트만 추가로 읽는다.
4. 대응 mock 파일에서 정상, 빈 상태, 권한 차이, 콘텐츠 길이, 첨부 조합을 확인한다.
5. 대응 UI 테스트가 있으면 구현보다 테스트의 상호작용 계약을 먼저 확인한다.
6. 아래 형식으로 조사 결과를 정리한 뒤 새 디자인을 제안한다.

```text
- 유지할 사용자 목표
- 유지할 정보와 상태
- 재사용할 상호작용 패턴
- 버릴 시각적·구조적 부채
- 새 구조에서 달라질 점
- 추가로 결정해야 할 사항
```

### 2.3 금지 사항

- 기존 저장소 전체를 매 작업마다 읽지 않는다.
- 페이지 파일이나 `app/components/ui/`를 폴더째 복사하지 않는다.
- `?as=`, `?role=`, `?type=` 같은 미리보기 query parameter를 제품 기능으로 이관하지 않는다.
- 로컬 state로만 성공하는 mock mutation을 새 제품 동작으로 해석하지 않는다.
- 기능 명세의 모든 항목을 새 버전의 확정 범위로 간주하지 않는다.
- 정적 코드 조사만으로 모바일, 키보드, 터치, 스크롤 동작이 검증됐다고 보고하지 않는다.

## 3. 디자인 기반 구조

### 3.1 기술과 스타일 기준점

| 관심사              | 기준 파일                                  | 참고할 내용                                                                            |
| ------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------- |
| 전역 스타일         | `app/app.css`                              | Tailwind CSS v4, Pretendard + Inter, OKLCH light/dark 토큰, radius, scrollbar, Twemoji |
| UI 프리미티브 설정  | `components.json`                          | shadcn `radix-vega`, neutral base, Lucide icons, CSS variables                         |
| 문서 셸             | `app/root.tsx`                             | 시스템 테마, tooltip, toast, 전역 오류 경계, 한국어 문서 언어                          |
| 라우트 선언         | `app/routes.ts`                            | 실제 URL과 route module의 유일한 대응표                                                |
| 앱 셸               | `app/components/layout/app-shell.tsx`      | 모바일 스크롤·여백·헤더·탭바를 독립 축으로 결정하는 route handle 구조                  |
| 데스크톱 내비게이션 | `app/components/layout/app-sidebar.tsx`    | hover 확장형 icon sidebar, 활성 상태, unread badge                                     |
| 모바일 내비게이션   | `app/components/layout/mobile-tab-bar.tsx` | 5개 고정 탭, safe area, unread badge, 현재 피드의 auto-hide 상태에 따른 숨김           |
| 상단 헤더           | `app/components/layout/app-header.tsx`     | 알림 진입, 비상호작용 프로필 avatar, 제출·결과가 없는 검색 mock                        |
| 공통 내비 항목      | `app/components/layout/app-nav-items.ts`   | 홈, 메시지, 그룹, 알림, 메뉴                                                           |

### 3.2 앱 셸의 반응형 축

`app/components/layout/app-shell.tsx`의 route handle은 기존 구조에서 보존 가치가 높은 아이디어다.
페이지 종류에 따라 다음 축을 서로 독립적으로 결정한다.

- `mobileScroll`: 셸이 스크롤하는 일반 페이지인지, 메신저처럼 화면 내부가 직접 스크롤하는지
- `mobileContentEdge`: 모바일에서 inset 여백을 둘지, 화면 가장자리까지 bleed할지
- `showMobileHeader`: 전역 모바일 헤더를 표시할지
- `mobileSafeAreaTop`: 자체 헤더가 safe area를 책임지는지
- `showMobileTabBar`: 하단 탭바를 표시할지
- `autoHideMobileChrome`: 긴 피드에서 아래로 읽을 때 상·하단 chrome을 숨길지

새 프로젝트에서는 이 개념을 유지할 수 있지만 문자열 handle을 화면마다 산발적으로 두기보다
`standard`, `feed`, `immersive`, `workspace`, `modal` 같은 명시적 layout preset으로 묶는 방안을 먼저
검토한다.

### 3.3 현재 시각 언어

- 기본 캔버스는 neutral 배경이며 카드, popover, sidebar가 밝기 단계로 구분된다.
- 브랜드 포인트는 blue-violet 계열 `primary` 하나에 집중되어 있다.
- 모바일 피드와 그룹 콘텐츠는 화면 가장자리까지 붙는 카드 스택, `sm` 이상은 둥근 카드와 border를
  사용한다.
- 긴 보조 정보는 데스크톱 `lg`에서 오른쪽 `18rem` sticky rail로 이동한다.
- 모바일 몰입형 화면은 fixed 자체 헤더와 safe-area inset을 사용한다.
- 중요한 편집·검색·목록 Dialog는 모바일에서 full-screen, 데스크톱에서 제한 폭 modal로 바뀐다.
- 이모지는 운영체제 차이를 줄이기 위해 Twemoji로 렌더링한다.

현재 토큰은 제품 고유 디자인 시스템이라기보다 shadcn neutral 기반에 가깝다. 새 프로젝트에서는 색,
타이포그래피, 간격, elevation, radius, motion을 제품 토큰으로 확정한 뒤 기존 조합을 선택적으로
채택해야 한다.

## 4. 전체 화면 지도

URL은 `app/routes.ts`를 기준으로 한다. `참고 성격`은 새 디자인에서 무엇을 추출해야 하는지를 뜻한다.

### 4.1 인증과 온보딩

| URL                | route module                          | 주요 UI·자료                                           | 참고 성격                               |
| ------------------ | ------------------------------------- | ------------------------------------------------------ | --------------------------------------- |
| `/login`           | `app/routes/auth/login.tsx`           | `Input`, password reveal, inline alert, pending button | 중앙 인증 카드, 오류와 제출 중 상태     |
| `/signup`          | `app/routes/auth/signup.tsx`          | 이메일, 비밀번호 확인, reveal controls                 | 다중 필드 인증 카드와 검증 오류         |
| `/forgot-password` | `app/routes/auth/forgot-password.tsx` | 요청 폼과 전송 완료 상태                               | 한 화면 안의 request → success 전환     |
| `/reset-password`  | `app/routes/auth/reset-password.tsx`  | 새 비밀번호와 확인                                     | 복구 흐름의 최소 폼                     |
| `/setup`           | `app/routes/auth/setup.tsx`           | 역할별 폼, 생년월일, 이미지 단계, OTP 단계             | 가장 풍부한 다단계 onboarding prototype |
| `/pending`         | `app/routes/auth/pending.tsx`         | 승인 대기 안내, 다음 행동                              | 비동기 심사 대기 상태                   |
| `/logout`          | `app/routes/auth/logout.tsx`          | 로그아웃 진행 spinner                                  | 진행 상태 표현 참고                     |

함께 읽을 자료:

- 제품 범위: `docs/KMLA_ONLINE_FUNCTIONAL_SPEC.md` 4-5장
- 프로필 변형: `app/lib/profile/mock-data.ts`
- 온보딩 이미지: `app/routes/auth/setup.tsx` 자체의 파일 선택과 object URL preview. cropper는 사용하지
  않는다.
- 실제 crop UX 비교: `app/components/profile/profile-hero.tsx`,
  `app/components/image/image-cropper.tsx`, `app/hooks/use-image-crop.ts`
- 인증 route들은 유사한 카드와 필드 패턴을 반복하므로 새 구조에서는 `AuthLayout`, `AuthCard`,
  `PasswordField`, `InlineFormError` 수준의 공통 패턴을 먼저 설계한다.
- `app/routes/auth/setup.tsx`는 약 700줄의 단계·검증·렌더링이 한 파일에 결합되어 있다. 새 버전에서는
  step model, step content, navigation footer, draft state를 분리한다.

세부 상태와 문구도 디자인 자산으로 취급한다.

- setup은 기본 신원 → 사용자 유형별 학교 정보 → 이미지·추가 정보 → 이메일 인증의 4단계이며 상단
  progress bar가 현재 위치를 보여 준다.
- 학생·졸업생·교사에 따라 성별, 기수, 계열, 학번, 반, 기숙사 방 등의 필드 구성이 달라진다.
- pending은 정상 대기뿐 아니라 설정을 먼저 완료해야 하는 fallback도 표현한다.
- reset-password는 세션 확인 중, 만료된 링크, 새 비밀번호 입력의 세 화면 상태를 가진다.
- 비밀번호 분실·재설정 화면의 과거 대화 손실 경고는 일반 validation 문구와 다른 위험 정보 위계로
  검토한다.

### 4.2 앱 셸과 홈 피드

| URL  | route module               | 주요 UI·자료                                 | 참고 성격                                                           |
| ---- | -------------------------- | -------------------------------------------- | ------------------------------------------------------------------- |
| 공통 | `app/routes/layout.tsx`    | `AppShell`, 전역 알림 context                | 주요 앱 화면 정보 구조. 인증·승인 guard는 별도 검증 필요            |
| `/`  | `app/routes/feed/feed.tsx` | `GroupPostFeed`, `PostViewToggle`, 급식 rail | 통합 피드, card/list 전환, infinite append, 모바일 chrome auto-hide |

홈 피드 read pack:

- `app/routes/feed/feed.tsx`
- `app/components/group/group-post-feed.tsx`
- `app/components/group/group-post-card.tsx`
- `app/components/group/group-post-row.tsx`
- `app/components/group/post-view-toggle.tsx`
- `app/lib/feed/mock-data.ts`
- `app/lib/group/types.ts`

중요한 디자인 상태:

- card 보기와 compact list 보기
- 가입한 여러 그룹의 글이 섞이고 각 글에 출처가 표시되는 상태
- 이미지 1장, 2장, 3-4장, 5장 이상 grid
- 파일 첨부, 반응 요약, 댓글 수, 수정됨 상태
- 데이터 없음
- 다음 페이지 append를 위한 sentinel
- `lg`에서만 나타나는 급식 보조 rail과 로딩·오류·식단 없음 상태

카드 본문은 기본 3줄 clamp이며 실제 DOM overflow가 있을 때만 더 보기를 표시한다. coarse pointer는
본문 tap으로 펼치고 fine pointer는 명시적 버튼을 사용하며, 텍스트 선택 중에는 tap toggle을 막는다.
이 동작은 시각 스타일보다 입력 방식에 따른 interaction variant로 기록해야 한다.

구조 개선 후보:

- 홈 피드가 그룹 도메인의 `GroupPost`와 컴포넌트를 그대로 사용한다. 새 버전에서는 `Post`의 제품
  모델과 `PostCard`의 표현 모델을 분리하고, 출처가 있는 통합 피드와 단일 그룹 피드를 variant로
  조립하는 편이 명확하다.
- 카드와 row가 공유하는 작성자·메타·반응 영역을 공통 subcomponent로 정의할 수 있다.

### 4.3 그룹 탐색과 그룹 목록

| URL                | route module                    | 주요 UI·자료                                         | 참고 성격                                 |
| ------------------ | ------------------------------- | ---------------------------------------------------- | ----------------------------------------- |
| `/groups`          | `app/routes/group/index.tsx`    | `SpaceRow`, `SpaceDiscoverCard`, `TeacherGroupsHome` | 공식/내 그룹/인기 그룹과 사용자 유형별 홈 |
| `/groups/discover` | `app/routes/group/discover.tsx` | 검색, filter, discover cards                         | 그룹 검색 결과·빈 상태·가입 상태          |
| `/groups/create`   | `app/routes/group/create.tsx`   | 단계형 선택 section, 정책 radio cards, 확인 summary  | 복잡한 생성 폼의 정보 순서                |

read pack:

- `app/lib/space/mock-data.ts`
- `app/lib/space/types.ts`
- `app/components/space/space-avatar.tsx`
- `app/components/space/space-row.tsx`
- `app/components/space/space-discover-card.tsx`
- `app/components/space/teacher-groups-home.tsx`

mock이 표현하는 상태:

- 공식 그룹과 비공식 그룹
- 가입됨, 미가입, 가입 요청 중
- pinned/unpinned
- 공개 즉시 가입, 승인 가입, 초대 전용
- 교사에게 가입 그룹이 하나도 없는 시작 상태
- 아이콘·커버가 없을 때의 gradient/initial fallback

주의:

- 코드에는 `space`와 `group` 명칭이 혼재한다. 새 정보 구조에서는 사용자 언어와 코드 도메인 이름을
  하나로 정한다.
- preview query parameter로 사용자 유형과 생성 권한을 바꾸는 부분은 시나리오 확인 장치일 뿐 제품
  상호작용이 아니다.

### 4.4 그룹 홈, 게시물, 댓글과 설정

| URL                                 | route module                 | 주요 UI·자료                                                           | 참고 성격                        |
| ----------------------------------- | ---------------------------- | ---------------------------------------------------------------------- | -------------------------------- |
| `/groups/:pubId`                    | `app/routes/group/group.tsx` | 자체 모바일 헤더, `GroupHeader`, feed/members/settings main, info rail | 그룹 내부의 몰입형 mini-app 구조 |
| `/groups/:pubId/new`                | `app/routes/group/new.tsx`   | full-screen mobile Dialog, editor, identity controls, attachments      | 게시물 composer                  |
| `/groups/:pubId/posts/:postId`      | `app/routes/group/post.tsx`  | route modal, post detail, comment thread/composer                      | 피드 위 상세 modal과 댓글        |
| `/groups/:pubId/posts/:postId/edit` | `app/routes/group/edit.tsx`  | dirty-close 확인, 기존 첨부, editor                                    | 게시물 편집 modal                |

핵심 read pack:

- 화면·데이터: `app/routes/group/group.tsx`, `app/lib/group/mock-data.ts`,
  `app/lib/group/types.ts`
- 헤더·탭: `app/components/group/group-header.tsx`,
  `app/components/group/group-category-chips.tsx`
- 피드: `app/components/group/group-post-feed.tsx`,
  `app/components/group/group-post-card.tsx`, `app/components/group/group-post-row.tsx`
- 작성: `app/components/group/group-content-editor.tsx`,
  `app/components/group/group-attachment-buttons.tsx`,
  `app/components/group/group-attachment-preview.tsx`,
  `app/components/group/group-anonymous-toggle.tsx`,
  `app/components/group/group-staff-attribution-toggle.tsx`
- 상세: `app/components/group/group-comment-list.tsx`,
  `app/components/group/group-comment-composer.tsx`,
  `app/components/group/group-post-action-bar.tsx`,
  `app/components/group/group-post-menu.tsx`
- 관리: `app/components/group/group-settings.tsx`,
  `app/components/group/group-member-list.tsx`,
  `app/components/group/group-join-requests.tsx`,
  `app/components/group/group-leave-dialog.tsx`
- 검색·반응: `app/components/group/group-search-dialog.tsx`,
  `app/components/group/group-reaction-button.tsx`,
  `app/components/group/group-reaction-list-dialog.tsx`

반드시 확인할 상호작용 시나리오:

- 모바일은 그룹 전역 탭바를 숨기고 자체 fixed back/search header를 제공한다.
- 데스크톱은 feed + `18rem` sticky info rail로 나뉜다.
- category chip은 가로 scroll이며 card/list view mode가 유지된다.
- 정책과 역할이 허용할 때 작성자는 실명, 익명, 운영진 명의를 전환할 수 있고 일부 전환에는 확인이
  필요하다.
- 반응 버튼은 짧게 누르면 기본 반응, 350ms 길게 누르면 quick reaction picker를 연다. desktop hover는
  500ms 뒤 열리며 선택 상태는 local-only이고 전용 테스트는 없다.
- 게시물·댓글의 삭제, 익명 제한처럼 중대한 행동은 일반 `Dialog` 확인을 사용한다.
- 답글은 기본으로 접혀 있고, 답글 작성 시작 시 thread가 자동으로 펼쳐진다.
- 삭제된 부모 댓글은 자식 답글을 유지하기 위한 tombstone으로 남는다.
- 검색, 반응자 목록, 작성·편집 화면은 모바일 full-screen Dialog로 전환된다.
- 나가기 안내는 재가입 정책에 따라 문구가 달라지고 owner는 소유권 이전을 먼저 요구한다.

구조 개선 후보:

- `group.tsx`가 탭, 권한 preview, 로컬 mutation, feed, members, settings를 한꺼번에 조정한다. 새
  버전은 group shell, tab route, section controller로 분리한다.
- `group-settings.tsx`는 600줄 이상으로 이미지, 기본 정보, 가입 정책, 카테고리, 글쓰기, 익명 정책을
  모두 가진다. 설정 section을 독립 form module로 분리한다.
- 권한에 따른 메뉴 노출을 JSX 곳곳에서 계산하지 말고 화면 capability model로 변환해 내려준다.
- modal route 패턴은 유용하지만, route가 modal lifecycle과 draft lifecycle을 각각 책임지도록
  경계를 명확히 한다.

### 4.5 프로필

| URL                        | route module                     | 주요 UI·자료                                             | 참고 성격                                 |
| -------------------------- | -------------------------------- | -------------------------------------------------------- | ----------------------------------------- |
| `/profile`                 | `app/routes/profile/me.tsx`      | 현재 사용자 redirect                                     | 디자인 참고 대상 아님                     |
| `/profile/:profileId`      | `app/routes/profile/profile.tsx` | `ProfileHero`, `ProfileInfo`, nested edit outlet         | cover + avatar + identity + profile facts |
| `/profile/:profileId/edit` | `app/routes/profile/edit.tsx`    | full-screen mobile Dialog, role별 필드, dirty-close 확인 | 복잡한 profile editor                     |

read pack:

- `app/components/profile/profile-hero.tsx`
- `app/components/profile/profile-info.tsx`
- `app/components/profile/profile-avatar.tsx`
- `app/lib/profile/mock-data.ts`
- `app/lib/profile/types.ts`
- `app/lib/profile/format.ts`
- `app/components/image/image-cropper.tsx`

mock은 학생, 교사, 졸업생, 앱 관리자 프로필을 각각 제공한다. 역할마다 표시 필드와 편집 필드가
달라지는 상태를 모두 확인해야 한다. cover/아바타가 없는 fallback, 자기 프로필의 편집 버튼,
다른 사용자용 메시지 버튼의 위치와 표현도 디자인 대상이지만 현재 버튼은 disabled placeholder다.

`profile/edit.tsx`는 draft, 역할별 필드, validation, close confirmation이 결합되어 있으므로 새
버전에서는 profile field schema와 section renderer를 분리한다. 실제 이미지 crop은
`app/components/profile/profile-hero.tsx`가 담당한다.

### 4.6 메신저

| URL                  | 표시 영역   | 주요 UI                                      |
| -------------------- | ----------- | -------------------------------------------- |
| `/messenger`         | 대화 목록   | `ChatListPane`                               |
| `/messenger/:roomId` | 대화방      | `RoomPane`, `MessageList`, `MessageComposer` |
| `.../details`        | 대화 정보   | `DetailPane`                                 |
| `.../invite`         | 멤버 초대   | `InviteMembersPane`                          |
| `.../media`          | 공유 미디어 | `SharedMediaPane`                            |
| `.../members`        | 참여자      | `MembersPane`                                |
| `.../pinned`         | 고정 메시지 | `PinnedMessagesPane`                         |
| `.../search`         | 대화 검색   | `MessageSearchPane`                          |

메신저 route module은 `app/routes/messenger/messenger.tsx` 하나가 실제 UI와 상태를 거의 모두
조정하고, 자식 route module은 대부분 layout handle만 가진 빈 marker다.

핵심 read pack:

- orchestration: `app/routes/messenger/messenger.tsx`
- 시나리오: `app/lib/messenger/mock-data.ts`, `public/messenger/`
- 모델·표현 규칙: `app/lib/messenger/types.ts`, `app/lib/messenger/utils.ts`,
  `app/lib/messenger/constants.ts`
- 목록·방: `app/components/messenger/chat-list-pane.tsx`,
  `app/components/messenger/room-pane.tsx`, `app/components/messenger/message-list.tsx`
- bubble: `app/components/messenger/message-bubble.tsx`,
  `app/components/messenger/message-actions.tsx`,
  `app/components/messenger/use-message-bubble-gestures.ts`
- composer·첨부: `app/components/messenger/message-composer.tsx`,
  `app/components/messenger/message-attachment-preview.tsx`,
  `app/lib/messenger/attachment-policy.ts`
- 보조 pane: `app/components/messenger/detail-pane.tsx`,
  `app/components/messenger/shared-media-pane.tsx`,
  `app/components/messenger/members-pane.tsx`,
  `app/components/messenger/pinned-messages-pane.tsx`,
  `app/components/messenger/message-search-pane.tsx`
- viewer·player: `app/components/media/image-viewer.tsx`,
  `app/components/media/video-player.tsx`, `app/components/media/audio-player.tsx`

mock 시나리오:

- 1:1과 그룹 대화, unread와 mute, 빈 대화
- 내 메시지와 상대 메시지, 연속 bubble grouping, 날짜·시각 separator
- 답장, 반응, 고정, 삭제 tombstone, 선택 삭제
- sending, failed, retry 상태
- 긴 텍스트, URL link, jumbo emoji
- 1장부터 6장까지 이미지 조합, panorama, portrait, 여러 aspect ratio
- PDF, spreadsheet, document, CSV, audio, video 첨부
- 공유 미디어, 고정 메시지, 검색 결과, 멤버 목록
- full-screen image viewer의 swipe, keyboard, thumbnail strip, download

메시지 micro-interaction 중 수치까지 확인해야 하는 계약:

- touch long press는 450ms, 8px 이상 움직이면 취소된다.
- reply swipe는 수평 이동이 우세할 때만 작동하며 trigger는 48px, 최대 이동은 72px이다.
- textarea는 최대 96px까지 자동으로 커지고 Enter는 전송, Shift+Enter는 개행이다.
- 모바일 composer는 focus/typing 중 첨부 버튼을 접고 별도 펼치기 버튼을 보인다.
- 빈 초안의 오른쪽 action은 빠른 `👍`, 텍스트가 있으면 send icon이며 빠른 반응에는 1초 cooldown이
  있다.
- 단독 emoji는 bubble 배경이 없는 jumbo 표현을 사용한다.
- sending은 opacity와 spinner, failed는 경고와 retry, read는 작은 겹친 avatar로 구분한다.

이 수치는 제품의 영구 상수가 아니라 기존 감각을 재현하는 비교 기준이다. 새 디자인이 값을 바꾸면
pointer/browser test와 함께 변경 이유를 남긴다.

반응형 구조:

- 모바일: 한 번에 목록 또는 방/pane 하나만 전체 화면으로 표시한다.
- `md`는 대화 목록 + 현재 작업 pane의 2-pane, `lg`는 목록 + 방 + 선택적 secondary pane의
  3-pane이다.
- room은 자체 스크롤을 가지며 앱 셸의 일반 문서 스크롤을 사용하지 않는다.
- mobile bubble action은 bottom sheet형 Dialog, desktop은 bubble 근처 popover다.

현재 breakpoint별 pane 구성은 모바일 1-pane, `md`에서 약 `19.5rem` 목록 + 방 또는 보조 pane,
`lg`에서 약 `22.5rem` 목록 + 방 + 약 `19rem` 보조 pane이다.

구조 개선 후보:

- `messenger.tsx` 약 750줄과 `message-bubble.tsx` 약 570줄을 그대로 이관하지 않는다.
- 자식 URL이 실제 자식 UI를 소유하지 않고 부모가 pathname suffix를 해석한다. 새 버전에서는
  responsive workspace layout은 부모가, 각 pane의 content와 lifecycle은 자식 route가 소유하게
  재구성한다.
- room state, composer state, selection state, viewer navigation을 분리된 reducer 또는 feature model로
  관리한다.
- 영어 mock 콘텐츠와 한국어 UI가 혼재하므로 새 디자인 QA fixture는 한국어 장문·이름·학교 맥락을
  포함해 다시 만든다.

### 4.7 알림

| URL     | route module                            | 주요 UI·자료                       | 참고 성격                     |
| ------- | --------------------------------------- | ---------------------------------- | ----------------------------- |
| `/noti` | `app/routes/noti/noti.tsx`              | 최근/이전 구분, 점진 노출, 빈 상태 | 시간 기반 notification inbox  |
| 공통    | `app/components/noti/noti-provider.tsx` | unread count와 read state          | sidebar/tab badge의 화면 상태 |

read pack:

- `app/components/noti/notification-item.tsx`
- `app/components/noti/noti-context.ts`
- `app/components/noti/noti-provider.tsx`
- `app/lib/noti/mock-data.ts`
- `app/lib/noti/types.ts`
- `app/components/layout/nav-badge.tsx`

mock 데이터는 화면이 지원하는 알림 유형을 한 번씩 보여 주도록 구성되어 있다. actor avatar, 익명 또는
운영진 표기, 읽음/안 읽음, deep-link 가능 여부, 최근 24시간과 이전 목록, 더 보기, 빈 상태를
디자인 fixture로 활용한다.

`notification-item.tsx`가 300줄 이상이며 종류별 문장·아이콘·링크를 직접 분기한다. 새 버전에서는
notification presentation descriptor를 만든 뒤 하나의 공통 row가 렌더하도록 분리한다.

### 4.8 메뉴, 개인 설정과 관리자

| URL                   | route module                        | 참고할 화면                                      |
| --------------------- | ----------------------------------- | ------------------------------------------------ |
| `/menu`               | `app/routes/menu/menu.tsx`          | 프로필 summary + 설정/서비스/관리자 section list |
| `/menu/notifications` | `app/routes/menu/notifications.tsx` | 그룹별 알림 수준 목록                            |
| `/menu/password`      | `app/routes/menu/password.tsx`      | 민감 작업 폼, pending/error                      |
| `/menu/meal`          | `app/routes/menu/meal.tsx`          | 날짜별 식단 목록과 상태                          |
| `/menu/licenses`      | `app/routes/menu/licenses.tsx`      | 단순 정보 화면                                   |
| `/admin/approvals`    | `app/routes/admin/approvals.tsx`    | bulk selection, 신청 카드, 승인/거절             |
| `/admin/admins`       | `app/routes/admin/admins.tsx`       | 재인증 gate, 현재 관리자, 후보 검색, 확인 Dialog |

read pack:

- `app/components/menu/menu-sub-header.tsx`
- `app/components/menu/theme-select.tsx`
- `app/components/admin/pending-profile-card.tsx`
- `app/lib/admin/mock-data.ts`
- `app/lib/menu/mock-data.ts`
- `app/lib/meal/neis.ts`

`app/lib/admin/mock-data.ts`는 오래 기다린 신청 우선, 여러 사용자 유형, 현재 관리자와 후보를
표현한다. 승인 카드의 compact/expanded 정보 밀도와 bulk action bar는 관리 화면 redesign의 주요
참고 대상이다.

### 4.9 동아리

| URL                   | route module                | 참고할 화면                                                |
| --------------------- | --------------------------- | ---------------------------------------------------------- |
| `/clubs`              | `app/routes/club/index.tsx` | 공개/비공개 상태, 검색, 유형 tab, 내 지원, admin banner    |
| `/clubs/:clubId`      | `app/routes/club/club.tsx`  | hero, Markdown 소개, 모집 공고, 지원/취소, 관리자와 지원자 |
| `/clubs/:clubId/edit` | `app/routes/club/edit.tsx`  | 기본 정보, 모집 설정, 관리자, preview Dialog               |

함께 읽을 파일:

- `app/components/club/club-card.tsx`
- `app/lib/club/mock-data.ts`
- `app/lib/club/types.ts`
- `app/lib/club/format.ts`

mock은 주요/일반 동아리, 모집 중/마감/모집 없음, 지원함/미지원, 학생/동아리 관리자/앱 관리자,
지원자 목록을 제공한다. 목록과 상세는 유용한 디자인 참고 자료지만 권한 preview query는 제품
기능으로 옮기지 않는다.

### 4.10 공강·노래방 예약

| URL             | route module                  | 참고할 화면                                      |
| --------------- | ----------------------------- | ------------------------------------------------ |
| `/util/gongang` | `app/routes/util/gongang.tsx` | 주 단위 예약표, 장소별 cell, 예약·취소·관리 상태 |
| `/util/karaoke` | `app/routes/util/karaoke.tsx` | 같은 화면의 karaoke tab 진입                     |

`gongang.tsx`는 약 670줄의 route 안에 날짜 계산, 표 렌더링, 권한, 편집 상태, mutation UI가 모두
들어 있다. 디자인 자료로는 desktop table과 mobile 사용성, 빈 slot/예약됨/내 예약/관리자 상태를
추출하되 새 구조에서는 calendar model, slot grid, booking form을 분리한다.

### 4.11 오류와 빈 상태

| URL·영역             | 파일                                  | 참고할 내용                            |
| -------------------- | ------------------------------------- | -------------------------------------- |
| 전역 route error     | `app/root.tsx`                        | 상태 코드와 개발 stack 전달            |
| 오류 표현            | `app/components/error/error-page.tsx` | 401, 403, 404, 500 계열 메시지와 retry |
| 오류 미리보기        | `app/routes/error-preview.tsx`        | 상태 코드별 시각 확인                  |
| wildcard             | `app/routes/not-found.tsx`            | 404 재사용                             |
| 공통 empty primitive | `app/components/ui/empty.tsx`         | icon, title, description, action 조합  |

새 버전에서는 route error, section error, inline form error, empty, no-result, first-use 상태를 서로 다른
패턴으로 명시한다. 현재 구현은 skeleton primitive는 있지만 실제 페이지 loading 체계는 충분히
검증되지 않았다.

## 5. 공통 상호작용 패턴 지도

### 5.1 route modal과 닫기

- `app/hooks/use-modal-close.ts`: history가 있으면 뒤로 가고 없으면 fallback으로 이동한다.
- `app/hooks/use-close-confirmation.ts`: dirty draft가 있을 때 browser/popstate와 UI close를 막는다.
- `app/components/group/group-discard-dialog.tsx`: 작성 내용 폐기 확인.
- `useModalClose` 사용: profile edit, post create/edit/detail.
- `useCloseConfirmation` 사용: dirty draft가 있는 profile edit, post create/edit. post detail은 dirty
  confirmation을 사용하지 않는다.

새 버전에서는 URL로 열 수 있는 modal과 단순 ephemeral Dialog를 구분한다. 모바일 full-screen과
데스크톱 modal을 같은 route state에서 표현하는 패턴은 유지 가치가 있다.

### 5.2 검색

- 전역 검색 shell: `app/components/layout/app-header.tsx`
- 그룹 찾기: `app/routes/group/discover.tsx`
- 그룹 내부 게시물: `app/components/group/group-search-dialog.tsx`
- 대화 목록: `app/components/messenger/chat-list-pane.tsx`
- 대화 내부: `app/components/messenger/message-search-pane.tsx`
- 관리자 후보: `app/routes/admin/admins.tsx`
- 공통 debounce: `app/hooks/use-debounced-value.ts`

현재 검색 UI는 위치마다 input, 결과, empty state가 별도로 구성되어 있다. 새 시스템에서는
`SearchField`, `SearchResults`, `SearchEmpty`를 공통 패턴으로 만들되 결과 row는 도메인별로 유지한다.

### 5.3 이미지 선택·편집·보기

- crop UI: `app/components/image/image-cropper.tsx`
- crop state: `app/hooks/use-image-crop.ts`, `app/hooks/use-image-draft.ts`
- crop geometry: `app/lib/image/crop.ts`
- compression preset: `app/lib/image/compress.ts`
- post grid: `app/components/group/group-post-image-grid.tsx`
- messenger preview: `app/components/messenger/message-attachment-preview.tsx`
- full viewer: `app/components/media/image-viewer.tsx`
- 정책 설명: `docs/image-handling.md`

프로필/cover crop, 업로드 전 preview와 제거, 여러 이미지 grid, full-screen viewer를 하나의 media
experience로 함께 검토한다. viewer는 touch swipe, keyboard, thumbnail, neighbor preload, safe area를
가지므로 재작성 시 interaction checklist로 사용한다.

cropper의 기존 정밀 계약:

- 이미지는 항상 frame을 덮고 빈 영역이 생기지 않는 범위로 pan을 제한한다.
- zoom은 1-4, 버튼은 0.2, slider는 0.01 단위다.
- 프로필 avatar는 원형 1:1 / 최대 512px, 프로필 cover는 사각 3:1 / 최대 1600px이다.
- 그룹 icon은 1:1 / 최대 512px, 그룹 cover는 4:1 / 최대 1600px이다.
- 동아리 이미지는 1:1 / 최대 1024px이다.
- 모바일은 `100svh` 편집기, `sm` 이상은 최대 `90svh` Dialog다.
- 처리 중에는 닫기와 취소를 막고 오류는 사용자에게 보이는 상태로 전환한다.
- object URL은 교체, 취소, unmount 때 해제한다.

crop·preview UX는 화면에 연결되어 있지만 저장은 local blob draft에 그친다. 압축·업로드 helper는
별도로 존재하나 이 UI 흐름에서는 호출되지 않는다. 따라서 이 section은 저장 완료가 아닌 편집 경험의
참고 자료다.

게시물 이미지 grid의 기존 배치:

- 1장: 16:9
- 2장: 2열, 전체 2:1
- 3장: 2 × 2에서 첫 이미지가 두 행을 차지
- 4장: 2 × 2
- 5장 이상: 최대 5장을 보이고 마지막 tile에 `+N`

full-screen viewer의 기존 정밀 계약:

- 검정 `bg-black/95` canvas와 상단 파일명·번호·다운로드·닫기, 하단 filmstrip을 사용한다.
- desktop은 좌우 버튼과 방향키, touch는 swipe를 사용한다.
- swipe threshold는 viewport의 20%와 80px 중 작은 값이며 끝에서는 0.25 비율 rubber band가
  적용된다.
- 현재 이미지와 양옆만 decode하고 나머지는 빈 slide geometry를 유지한다.
- 단일 이미지에서도 filmstrip 공간을 유지해 사진 영역 높이가 변하지 않는다.
- 열린 이미지 id는 URL search parameter에 기록하며 browser back으로 닫는 흐름을 고려한다.

이 viewer와 gesture에는 전용 자동화 테스트가 없으므로 새 프로젝트에서 우선 browser interaction
fixture로 승격해야 한다.

### 5.4 rich text와 editor

- 입력: `app/components/group/group-content-editor.tsx`
- 단축키: `app/hooks/use-markdown-shortcuts.ts`
- 출력: `app/components/rich-text/rich-text.tsx`, `app/lib/rich-text/render.ts`
- 지원 표현: 큰/작은 제목, bold, italic, escape, 줄바꿈, Twemoji, plain-text preview

동아리 소개와 게시물 본문이 이 표현을 사용한다. 새 프로젝트에서 editor 라이브러리를 바꾸더라도
기존 fixture와 테스트를 콘텐츠 표현 acceptance case로 활용할 수 있다.

### 5.5 날짜와 시간

- `app/components/relative-time.tsx`
- `app/lib/time.ts`
- `app/hooks/use-client-now.ts`
- messenger 시간 grouping: `app/lib/messenger/utils.ts`

상대 시각, 날짜 경계, hydration 이후 현재 시각, 메시지 minute grouping을 별도 디자인 규칙으로
정의해야 한다.

### 5.6 피드와 무한 목록

- `app/hooks/use-infinite-scroll.ts`
- `app/components/group/group-post-feed.tsx`
- `app/routes/feed/feed.tsx`
- `app/routes/noti/noti.tsx`

피드는 sentinel append, 알림은 명시적인 더 보기 방식을 사용한다. 새 디자인에서는 데이터 특성과
사용자 위치 복원 요구에 따라 방식을 선택하고, 로딩 row·끝 상태·재시도 상태를 함께 설계한다.

### 5.7 확인과 위험 행동

이 프로젝트는 위험 행동에도 regular `Dialog`를 사용한다. 참고 파일:

- `app/components/group/group-post-menu.tsx`
- `app/components/group/group-leave-dialog.tsx`
- `app/components/group/group-discard-dialog.tsx`
- `app/components/group/group-member-list.tsx`
- `app/routes/admin/admins.tsx`
- `app/routes/club/club.tsx`

새 버전에서는 문구를 `행동 결과 → 복구 가능 여부 → 확인 버튼` 순으로 통일하고 destructive color를
실제 비가역 행동에만 사용한다.

### 5.8 첨부 drag and drop

- `app/hooks/use-file-drop.ts`
- `app/components/file-drop-overlay.tsx`
- `app/components/group/use-file-attachments.ts`
- `app/components/group/group-attachment-preview.tsx`
- `app/components/messenger/message-attachment-preview.tsx`

내부 이미지·텍스트 drag와 OS 외부 파일 drag를 구분하고, `dragenter`/`dragleave` depth를 세어 자식
요소 경계에서 overlay가 깜빡이지 않게 한다. 이미지는 thumbnail, 일반 파일은 icon·파일명·용량
row로 미리 보며 각 항목은 안정적인 local id로 제거한다. 이 동작은 실제 저장 여부와 무관하게 독립
interaction contract로 이관할 가치가 있다.

`app/lib/messenger/attachment-policy.ts`는 현재 메신저 UI에 연결되지 않은 정책 후보다. 테스트가
reject reason을 고정하지만 현재 화면이 해당 오류를 사용자에게 표시한다는 뜻은 아니다.

### 5.9 오디오와 비디오

- `app/components/media/audio-player.tsx`
- `app/components/media/video-player.tsx`
- `app/components/media/media-playback.ts`

오디오는 compact card 안에 파일명, play/pause, seek, 현재·전체 시각을 제공한다. 비디오는 native
controls, `playsInline`, metadata preload, black contain canvas를 사용한다. 공용 playback helper는
페이지 전체에서 하나의 audio/video만 재생되게 한다. 새 버전에서 custom player를 택하더라도 이
접근성·동시 재생 계약을 먼저 보존한다.

## 6. mock 시나리오 색인

| 파일                             | 디자인 fixture로서의 가치                                                 |
| -------------------------------- | ------------------------------------------------------------------------- |
| `app/lib/profile/mock-data.ts`   | 학생, 교사, 졸업생, 앱 관리자와 역할별 필드                               |
| `app/lib/space/mock-data.ts`     | 공식/비공식, 가입/요청/미가입, 고정, 교사 empty state                     |
| `app/lib/group/mock-data.ts`     | 카테고리, 글·댓글 thread, tombstone, 첨부, 익명, 동명이인 멤버, 가입 요청 |
| `app/lib/feed/mock-data.ts`      | 여러 그룹 출처가 섞인 최신순 피드와 다양한 post card                      |
| `app/lib/group/mock-reactors.ts` | 실명 반응자, 익명 count, 반응 종류 tab과 긴 목록                          |
| `app/lib/messenger/mock-data.ts` | 대화·메시지·미디어 조합의 가장 큰 fixture set                             |
| `app/lib/noti/mock-data.ts`      | 지원하는 알림 presentation branch 전체                                    |
| `app/lib/menu/mock-data.ts`      | 그룹별 알림 수준 목록                                                     |
| `app/lib/admin/mock-data.ts`     | 승인 대기, 관리자, 후보와 사용자 유형 변형                                |
| `app/lib/club/mock-data.ts`      | 동아리 유형, 모집 상태, 지원 상태, 지원자                                 |

새 프로젝트에서는 이 파일들을 runtime mock으로 옮기지 말고 Storybook, visual fixture 또는 디자인 QA
시나리오로 다시 작성한다. 각 fixture는 `normal`, `empty`, `loading`, `error`, `long-content`,
`permission-variant`, `mobile-stress` 같은 목적을 이름에 드러내야 한다.

## 7. UI 컴포넌트 디렉터리 지도

| 경로                        | 역할                                             | 이관 판단                                               |
| --------------------------- | ------------------------------------------------ | ------------------------------------------------------- |
| `app/components/ui/`        | shadcn 기반 atom primitive                       | 새 프로젝트 preset에서 재생성 후 필요한 수정만 비교     |
| `app/components/layout/`    | 앱 shell, header, sidebar, mobile tab            | 정보 구조와 responsive behavior 우선 참고               |
| `app/components/group/`     | feed, post, comment, reaction, members, settings | 핵심 디자인 자산이지만 결합도가 높아 재구성 필요        |
| `app/components/messenger/` | three-pane workspace와 message UI                | interaction fixture로 가치 높음, orchestration은 재작성 |
| `app/components/profile/`   | avatar, hero, profile facts                      | 비교적 표현 컴포넌트로 분리되어 있음                    |
| `app/components/noti/`      | notification state와 row                         | presentation descriptor 분리 필요                       |
| `app/components/media/`     | image viewer와 audio/video player                | 독립 UX로 검토 가치 높음                                |
| `app/components/image/`     | cropper                                          | media workflow와 함께 검토                              |
| `app/components/space/`     | 그룹 목록·탐색 row/card                          | group naming 정리 후 재설계                             |
| `app/components/admin/`     | 가입 승인 카드                                   | 관리 화면 fixture                                       |
| `app/components/club/`      | 동아리 목록 카드                                 | 동아리 도메인 fixture                                   |
| `app/components/menu/`      | sub-header와 theme selector                      | 공통 설정 화면 패턴                                     |

## 8. UI 테스트를 interaction contract로 읽는 법

다음 테스트는 시각 회귀 테스트는 아니지만 새 구현에서 유지할 상호작용을 구체적으로 보여 준다.

| 테스트                                                 | 보장하는 디자인·상호작용                                 |
| ------------------------------------------------------ | -------------------------------------------------------- |
| `app/components/group/group-anonymous-toggle.test.tsx` | 실명 → 익명 확인, 익명 → 실명 즉시 전환                  |
| `app/components/group/group-comment-composer.test.tsx` | 익명 정책과 운영진 명의에 따른 composer 상태             |
| `app/components/group/group-comment-list.test.tsx`     | 접힌 답글, 펼치기, 답글 시작 시 자동 전개, composer 위치 |
| `app/components/group/group-content-editor.test.tsx`   | 여러 줄의 현재 textarea 값을 preview 전환 시 반영        |
| `app/hooks/use-infinite-scroll.test.tsx`               | 같은 intersection 중복 방지, pending 중단·완료 후 재연결 |
| `app/hooks/use-markdown-shortcuts.test.ts`             | heading toggle과 selection 처리                          |
| `app/lib/rich-text/render.test.ts`                     | 안전한 Markdown 표현과 preview                           |
| `app/lib/image/crop.test.ts`                           | canvas 출력이 아닌 crop geometry, pan, zoom, output size |
| `app/lib/image/compress.test.ts`                       | mock된 압축 호출, WebP 정규화, 원본 fallback             |
| `app/lib/messenger/attachment-policy.test.ts`          | accepted/rejected와 unsupported/large/many reason 분류   |
| `app/lib/meal/neis.test.ts`                            | 급식 날짜와 표시 데이터 변환                             |

새 디자인에서 패턴을 바꿀 수는 있지만, 바뀐 사용자 경험을 명시적으로 결정하지 않은 채 이 동작을
조용히 잃어서는 안 된다.

현재 `package.json`에는 Storybook, Playwright, screenshot/visual regression script가 없다. UI 자동화는
Vitest + jsdom 중심이며 pointer gesture, history, safe area, native media, 실제 canvas를 검증하지
않는다. 특히 image viewer/cropper, file drop, messenger gesture·composer·breakpoint, mobile chrome
auto-hide는 새 프로젝트에서 browser test 우선순위가 높다.

## 9. 공용 시각 자산

| 경로                     | 내용                                             |
| ------------------------ | ------------------------------------------------ |
| `public/avatar.svg`      | avatar fallback                                  |
| `public/messenger/*.png` | 이미지 grid, viewer, 다양한 aspect ratio fixture |
| `public/messenger/*.mp4` | inline video와 shared media fixture              |
| `public/messenger/*.wav` | audio player fixture                             |
| `public/sw.js`           | 디자인 참고 대상 아님                            |

`public/messenger/` 자산은 실제 제품 콘텐츠가 아니라 레이아웃 stress test용 fixture로 취급한다.

대표 fixture를 빠르게 찾는 표:

| 시나리오                     | 파일                                                                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 극단 세로 이미지             | `public/messenger/poster-full-page.png`                                                                                        |
| panorama                     | `public/messenger/hallway-panorama.png`                                                                                        |
| 2장 혼합 비율                | `public/messenger/board-photo-1.png`, `public/messenger/board-photo-2.png`                                                     |
| 3장 grid                     | `public/messenger/reaction-step-1.png`, `public/messenger/reaction-step-2.png`, `public/messenger/reaction-step-3.png`         |
| 4장 grid                     | `public/messenger/angle-1.png`, `public/messenger/angle-2.png`, `public/messenger/angle-3.png`, `public/messenger/angle-4.png` |
| overflow badge               | `public/messenger/notes-page-1.png`부터 `public/messenger/notes-page-6.png`                                                    |
| 세로 video                   | `public/messenger/poster-reveal.mp4`                                                                                           |
| 가로 video                   | `public/messenger/booth-walkthrough.mp4`                                                                                       |
| metadata 없는 video fallback | `public/messenger/stage-check.mp4`                                                                                             |
| audio                        | `public/messenger/rehearsal-clip.wav`                                                                                          |

## 10. 제품 명세에서 화면을 찾는 빠른 표

`docs/KMLA_ONLINE_FUNCTIONAL_SPEC.md`는 디자인 정답이 아니라 누락된 상태와 흐름을 찾는 체크리스트로
사용한다.

| 명세 장                     | 화면 read pack                                    |
| --------------------------- | ------------------------------------------------- |
| 2. 사용자 및 권한           | profile, admin, group member/permission variants  |
| 3. 공통 화면 및 내비게이션  | app shell, header, sidebar, mobile tab            |
| 4-5. 인증·프로필 설정       | auth routes, setup, image cropper                 |
| 6. 홈 통합 피드             | feed route, post feed/card/row, meal rail         |
| 7. 그룹                     | group index/discover/create/home/settings/members |
| 8-11. 게시물·댓글·반응·익명 | group post/editor/comment/reaction components     |
| 12. 프로필                  | profile route, hero, info, edit                   |
| 13. 메시지                  | messenger workspace 전체, media components        |
| 14. 알림                    | notification page, item, nav badge                |
| 15. 메뉴 및 설정            | menu routes, theme, meal, licenses                |
| 16. 앱 관리자               | approvals, admins, pending card                   |
| 17. 부가 기능               | gongang/karaoke routes                            |
| 18. 동아리                  | club routes, card, fixtures                       |
| 19. 미디어 공통 규칙        | image handling, attachment preview, viewer/player |

## 11. 새 프로젝트에서 우선 개선할 구조

### 11.1 먼저 유지할 개념

- 모바일 chrome과 스크롤 책임을 route별로 조정하는 앱 셸
- 모바일 full-screen / 데스크톱 modal로 변하는 route modal
- feed card/list variant와 모바일 bleed / 데스크톱 card 전환
- messenger의 responsive one-pane / three-pane 정보 구조
- mock에 담긴 권한, 빈 상태, 긴 콘텐츠, 첨부 조합
- safe-area, keyboard, touch, long-press, swipe를 고려한 상호작용
- 익명·운영진 명의처럼 결과가 되돌리기 어려운 선택의 확인 단계

### 11.2 재설계할 결합 구조

- `app/routes/messenger/messenger.tsx`: route ownership과 workspace state 분리
- `app/routes/auth/setup.tsx`: step model, field schema, view 분리
- `app/routes/util/gongang.tsx`: calendar model과 slot UI 분리
- `app/routes/group/group.tsx`: shell과 tab content 분리
- `app/components/group/group-settings.tsx`: 설정 section별 form 분리
- `app/components/messenger/message-bubble.tsx`: content renderer와 interaction layer 분리
- `app/components/noti/notification-item.tsx`: 종류별 descriptor와 row 분리

### 11.3 새로 추가할 디자인 운영 장치

- Storybook 또는 동등한 격리형 component fixture
- 주요 breakpoint별 screenshot baseline
- light/dark 및 reduced-motion 확인
- keyboard-only, focus order, screen-reader label checklist
- 한국어 긴 텍스트, 동명이인, 빈 avatar, 많은 badge 수, 긴 파일명을 포함한 stress fixture
- 화면별 loading, empty, error, first-use, partial-content 상태표
- 디자인 토큰 문서와 허용된 page/layout preset

## 12. agent 작업 요청 예시

```md
새 프로젝트의 그룹 홈을 설계한다.

기존 저장소는 읽기 전용 디자인 참고 자료다. Supabase와 DB 구현은 조사하지 않는다.
먼저 `docs/legacy/INDEX.md`의 "그룹 홈, 게시물, 댓글과 설정"을 읽고, 그 section의 read pack만
조사한다.

코드를 복사하기 전에 다음을 보고한다.

1. 기존 화면의 사용자 목표와 정보 위계
2. mobile/desktop에서 달라지는 구조
3. mock과 UI 테스트가 보여 주는 필수 상태
4. 유지할 interaction pattern
5. 구조적·시각적으로 버릴 부분
6. 새 디자인에서 결정이 필요한 사항

새 프로젝트의 제품 문서와 ADR이 기존 자료보다 우선한다. 기존 query parameter preview와 mock
mutation은 제품 기능으로 옮기지 않는다. 설계가 확정되면 실제 구현과 별개로 모든 상태를 격리된
fixture에서 확인할 수 있게 만든다.
```

## 13. 인덱스 유지 규칙

- 새 저장소에서 기존 화면을 조사할 때마다 해당 영역의 판정을 migration ledger에 남긴다.
- 기존 저장소가 동결되면 이 문서의 revision을 최종 tag 또는 commit SHA로 갱신한다.
- 실행 화면을 브라우저로 검증하면 viewport, theme, fixture, 확인 날짜를 별도 visual audit에 기록한다.
- 새 프로젝트에서 디자인 결정이 확정되면 이 인덱스를 수정해 정답처럼 만들지 말고 새 프로젝트의
  ADR이나 디자인 문서에 기록한다. 이 파일은 어디까지나 당시 레거시의 탐색 지도다.
