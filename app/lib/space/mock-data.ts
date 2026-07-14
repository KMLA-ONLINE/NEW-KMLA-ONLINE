import type { SpaceSummary } from "~/lib/space/types"

// 로더가 spaces + 내 space_members/space_join_requests 행을 읽어올 때까지의 대역.
//
// **한 배열이다.** 공식/비공식, 가입/미가입은 전부 이 목록에서 파생한다 -- 목록을 셋으로 쪼개
// 두면 가입 버튼을 누를 때 "미가입 목록에서 빼고 내 목록에 넣는" 이사가 필요해지고, 그 이사가
// 곧 두 목록이 어긋나는 자리가 된다. 서버도 spaces 한 번 읽고 내 관계만 조인해 붙인다.

// 실제 이미지 자산 없이 아이콘·커버를 보여주기 위한 그라디언트 SVG data-URI. 서명 URL을 내려줄
// 로더가 붙으면 사라진다.
function mockImage(from: string, to: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="400" height="300" fill="url(#g)"/></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export const mockSpaces: SpaceSummary[] = [
  // ---------------------------------------------------------------------------
  // 공식 -- 학교가 운영한다. 전교생이 속해 있으므로 가입/미가입이 갈리지 않는다.
  // ---------------------------------------------------------------------------
  {
    pubId: "student-council",
    name: "학생회",
    description: "학생회 공지, 행사 운영, 회의 내용",
    type: "group",
    imageUrl: mockImage("#2563eb", "#38bdf8"),
    coverImageUrl: null,
    joinPolicy: "invite_only",
    memberCount: 1247,
    isMember: true,
    pinnedAt: null,
    hasPendingRequest: false,
  },
  {
    pubId: "academics",
    name: "학사운영",
    description: "학사 일정, 시험 안내, 수업 관련 공지",
    type: "group",
    imageUrl: null,
    coverImageUrl: null,
    joinPolicy: "invite_only",
    memberCount: 1247,
    isMember: true,
    pinnedAt: null,
    hasPendingRequest: false,
  },
  {
    pubId: "dormitory",
    name: "기숙사",
    description: "기숙사 생활, 시설 점검, 생활 규칙",
    type: "group",
    imageUrl: mockImage("#7c3aed", "#c4b5fd"),
    coverImageUrl: null,
    joinPolicy: "invite_only",
    memberCount: 1247,
    // 고정한 그룹은 맨 위로 올라온다.
    isMember: true,
    pinnedAt: "2026-07-13T02:00:00.000Z",
    hasPendingRequest: false,
  },
  {
    pubId: "clubs",
    name: "동아리",
    description: "동아리 모집, 활동 일정, 행사 안내",
    type: "group",
    imageUrl: null,
    coverImageUrl: null,
    joinPolicy: "invite_only",
    memberCount: 1247,
    isMember: true,
    pinnedAt: null,
    hasPendingRequest: false,
  },

  // ---------------------------------------------------------------------------
  // 비공식 -- 내가 가입한 것
  // ---------------------------------------------------------------------------
  {
    pubId: "market",
    name: "민사고 먹9 사9 팔9",
    description: "학교 안에서 필요한 물건을 사고팔거나 나눔합니다.",
    type: "community",
    imageUrl: mockImage("#0f766e", "#5eead4"),
    coverImageUrl: mockImage("#0d9488", "#99f6e4"),
    joinPolicy: "public",
    memberCount: 1204,
    isMember: true,
    pinnedAt: null,
    hasPendingRequest: false,
  },
  {
    pubId: "class-30",
    name: "30기 민사 재학생",
    description: "30기끼리 학교생활 정보와 일정을 공유합니다.",
    type: "community",
    imageUrl: null,
    coverImageUrl: null,
    joinPolicy: "request",
    memberCount: 734,
    isMember: true,
    pinnedAt: "2026-07-13T05:00:00.000Z",
    hasPendingRequest: false,
  },
  {
    pubId: "lost-and-found",
    name: "민사고 떨99 줍9",
    description: "분실물과 습득물을 공유하고 찾아줍니다.",
    type: "community",
    imageUrl: null,
    coverImageUrl: null,
    joinPolicy: "public",
    memberCount: 856,
    isMember: true,
    pinnedAt: null,
    hasPendingRequest: false,
  },
  {
    pubId: "coding-club",
    name: "코딩 동아리",
    description: "웹·앱 프로젝트를 함께 만듭니다.",
    type: "community",
    imageUrl: mockImage("#4338ca", "#a5b4fc"),
    coverImageUrl: null,
    joinPolicy: "request",
    memberCount: 96,
    isMember: true,
    pinnedAt: null,
    hasPendingRequest: false,
  },

  // ---------------------------------------------------------------------------
  // 비공식 -- 아직 안 들어간 것. 찾기·인기 목록에 뜬다.
  // 정책이 public 아니면 request다 -- invite_only는 여기 올 수가 없다(spaces_select가 숨긴다).
  // ---------------------------------------------------------------------------
  {
    pubId: "dorm-life",
    name: "기숙사 생활 공유",
    description: "기숙사 생활 팁, 필요한 물건, 생활 정보를 나눕니다.",
    type: "community",
    imageUrl: null,
    coverImageUrl: mockImage("#c2410c", "#fdba74"),
    joinPolicy: "public",
    memberCount: 321,
    isMember: false,
    pinnedAt: null,
    hasPendingRequest: false,
  },
  {
    pubId: "meal-review",
    name: "급식 리뷰",
    description: "오늘 급식 후기와 메뉴 이야기를 가볍게 나눕니다.",
    type: "community",
    imageUrl: mockImage("#ca8a04", "#fde68a"),
    coverImageUrl: mockImage("#b45309", "#fcd34d"),
    joinPolicy: "public",
    memberCount: 287,
    isMember: false,
    pinnedAt: null,
    hasPendingRequest: false,
  },
  {
    pubId: "photos",
    name: "민사고 사진 공유",
    description: "학교 행사, 일상, 풍경 사진을 함께 올립니다.",
    type: "community",
    imageUrl: null,
    coverImageUrl: mockImage("#1d4ed8", "#93c5fd"),
    joinPolicy: "public",
    memberCount: 248,
    isMember: false,
    pinnedAt: null,
    hasPendingRequest: false,
  },
  {
    pubId: "exam-survival",
    name: "시험기간 생존방",
    description: "시험 공부법, 자료, 멘탈 관리 팁을 나눕니다.",
    type: "community",
    imageUrl: null,
    coverImageUrl: null,
    // 승인제. 가입 버튼이 "가입 요청"이 되고, 누르면 승인 대기 상태로 넘어간다.
    joinPolicy: "request",
    memberCount: 193,
    isMember: false,
    pinnedAt: null,
    hasPendingRequest: false,
  },
  {
    pubId: "band",
    name: "밴드부 비공식",
    description: "합주 일정과 곡 선정을 논의합니다.",
    type: "community",
    imageUrl: null,
    coverImageUrl: null,
    joinPolicy: "request",
    memberCount: 74,
    isMember: false,
    // 이미 요청을 넣고 기다리는 중 -- 가입도 미가입도 아닌 제3의 상태다.
    pinnedAt: null,
    hasPendingRequest: true,
  },
]
