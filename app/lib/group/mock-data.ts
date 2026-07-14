import type {
  GroupCategory,
  GroupJoinRequest,
  GroupMember,
  GroupPost,
  GroupSpace,
} from "~/lib/group/types"

// 실제 이미지 자산 없이 그리드를 보여주기 위한 그라디언트 SVG data-URI. 서명 URL을
// 내려줄 로더가 붙으면 사라진다. alt는 스키마에 캡션 컬럼이 없어 file_name에서 온다.
function mockImage(from: string, to: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="800" height="600" fill="url(#g)"/></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

// 로더가 space와 글을 읽어올 때까지의 대역. 값은 스키마가 실제로 담는 것만 쓴다.
export const mockGroup: GroupSpace = {
  name: "행정위원회",
  description: "학생 자치 활동, 행사 공지, 건의사항을 나누는 공간입니다.",
  type: "group",
  pubId: "student-council",
  // 서명 URL을 내려줄 로더가 붙기 전이라 이니셜/그라디언트 폴백이다. 설정 탭에서 올려 보면 화면에 반영된다.
  imageUrl: null,
  coverImageUrl: null,
  joinPolicy: "request",
  // 기본은 멤버 전원이 글을 쓴다. 'managers'로 바꾸면 owner/admin/manager만 메인 글을 쓰고
  // 나머지는 댓글만 단다(공지형 그룹). 그룹 설정에서 관리자가 켠다.
  postPolicy: "all",
  // postPolicy와 내 viewerRole에서 파생한다(로더가 can_post_in_space와 같은 규칙으로 계산).
  canPost: true,
  allowAnonymous: true,
  // 로더가 space_anonymity_suspensions에서 내 행만 읽어 파생한다. 정지 중이면 false가 되고
  // 작성 화면의 익명 토글이 사라진다.
  canPostAnonymously: true,
  anonymitySuspendedUntil: null,
  memberCount: 128,
  isMember: true,
  pinnedAt: null,
  // mock상 현재 사용자는 일반 멤버(mockGroupMembers의 id:1 "나" = member). 관리자 화면은
  // 개발용으로 group 라우트에서 ?as=admin 파라미터로 미리 볼 수 있다.
  viewerRole: "member",
}

// 이 그룹이 정의한 카테고리(게시판/말머리). sort_order로 칩 순서를 정한다.
export const mockGroupCategories: GroupCategory[] = [
  { id: 1, name: "공지", sortOrder: 0 },
  { id: 2, name: "행사", sortOrder: 1 },
  { id: 3, name: "건의", sortOrder: 2 },
  { id: 4, name: "자유", sortOrder: 3 },
]

// 글의 category_id → 카테고리 객체(로더가 조인할 자리). 못 찾으면 미분류(null).
const cat = (id: number): GroupCategory | null =>
  mockGroupCategories.find((category) => category.id === id) ?? null

// 댓글은 각 글에 트리로 들고 있다(parentId 스레드). 4번 글은 빈 상태 확인용으로 댓글이 없다.
// commentCount는 아래에서 comments.length로 채운다 -- 실제 피드 로더는 트리 대신 count(*)만 내려준다.
const rawGroupPosts: Omit<GroupPost, "commentCount">[] = [
  {
    id: 1,
    pubId: "a1f0c3e2-0001-4aaa-9aaa-000000000001",
    category: cat(2),
    title: "5월 축제 자원봉사자 모집",
    content:
      "부스 운영과 안전 관리를 도와줄 자원봉사자를 모집합니다. 이번 축제는 예년보다 규모가 커져 많은 인원이 필요합니다. 활동 시간은 오전·오후 교대로 배정되며, 봉사 시간 인증서도 발급됩니다. 관심 있는 분은 이번 주 금요일까지 댓글로 신청해 주세요. 문의는 학생회 인스타 DM으로 받습니다.",
    author: { name: "김지원" },
    isPinned: true,
    createdAt: "2026-07-11T05:00:00.000Z",
    images: [
      { src: mockImage("#2563eb", "#38bdf8"), alt: "festival-booths-2025.jpg" },
      { src: mockImage("#7c3aed", "#f472b6"), alt: "volunteer-poster.png" },
    ],
    files: [
      {
        name: "자원봉사_신청_안내.pdf",
        contentType: "application/pdf",
        sizeBytes: 248000,
        url: "#",
      },
    ],
    reactionCount: 21,
    topReactions: ["👍", "❤️"],
    comments: [
      {
        id: 1,
        parentId: null,
        author: { name: "이민서" },
        content: "저 참여할게요! 신청은 언제까지 받나요?",
        createdAt: "2026-07-11T06:00:00.000Z",
      },
      {
        id: 7,
        parentId: 1,
        author: { name: "김지원" },
        content: "이번 주 금요일까지예요. 신청해 주셔서 감사합니다!",
        createdAt: "2026-07-11T06:15:00.000Z",
      },
      {
        id: 8,
        parentId: 7,
        author: { name: "이민서" },
        content: "네 신청했어요, 감사합니다!",
        createdAt: "2026-07-11T06:20:00.000Z",
      },
      // 익명 댓글. author는 서버가 지우고 anonymousLabel만 내려준다. 번호는 이 글 안에서만 유효하다.
      {
        id: 2,
        parentId: null,
        author: null,
        anonymousLabel: "익명1",
        content: "봉사 시간 인증서는 어디서 받을 수 있나요?",
        createdAt: "2026-07-11T06:30:00.000Z",
      },
      // 같은 사람이 또 달면 같은 번호 -- 익명끼리 구분되는지 보이는 케이스.
      {
        id: 11,
        parentId: 2,
        author: null,
        anonymousLabel: "익명1",
        content: "아 그리고 봉사 확인서 양식도 있나요?",
        createdAt: "2026-07-11T06:33:00.000Z",
      },
      // 다른 익명 사람이면 다른 번호.
      {
        id: 12,
        parentId: null,
        author: null,
        anonymousLabel: "익명2",
        content: "저도 같은 게 궁금했어요.",
        createdAt: "2026-07-11T06:36:00.000Z",
      },
      // 삭제됐지만 답글이 살아 있어 tombstone으로 남는 댓글. get_post_comments가 이런 행을 계속
      // 내려주고(has_active_descendant), content와 author는 서버가 비운다.
      {
        id: 9,
        parentId: null,
        author: null,
        isDeleted: true,
        content: null,
        createdAt: "2026-07-11T06:40:00.000Z",
      },
      {
        id: 10,
        parentId: 9,
        author: { name: "박준서" },
        content: "위 댓글에 달린 답글입니다. 부모가 지워져도 이 답글은 남아요.",
        createdAt: "2026-07-11T06:45:00.000Z",
      },
      {
        id: 3,
        parentId: null,
        author: { name: "나" },
        isMine: true,
        content: "저도 참여하고 싶어요! 방금 신청했습니다.",
        createdAt: "2026-07-11T07:00:00.000Z",
      },
    ],
  },
  {
    id: 2,
    pubId: "a1f0c3e2-0002-4aaa-9aaa-000000000002",
    category: cat(1),
    title: "기말고사 기간 열람실 연장 운영 안내",
    content:
      "다음 주부터 2주간 열람실을 밤 12시까지 연장 운영합니다. 쓸데없이 긴 문장 만들기 용.쓸데없이 긴 문장 만들기 용.쓸데없이 긴 문장 만들기 용.쓸데없이 긴 문장 만들기 용. 쓸데없이 긴 문장 만들기 용.쓸데없이 긴 문장 만들기 용.쓸데없이 긴 문장 만들기 용.쓸데없이 긴 문장 만들기 용.쓸데없이 긴 문장 만들기 용.쓸데없이 긴 문장 만들기 용.쓸데없이 긴 문장 만들기 용.쓸데없이 긴 문장 만들기 용.쓸데없이 긴 문장 만들기 용.쓸데없이 긴 문장 만들기 용.쓸데없이 긴 문장 만들기 용.쓸데없이 긴 문장 만들기 용.쓸데없이 긴 문장 만들기 용.쓸데없이 긴 문장 만들기 용.쓸데없이 긴 문장 만들기 용. 자리는 선착순입니다.",
    author: { name: "이현우" },
    isPinned: false,
    createdAt: "2026-07-11T02:00:00.000Z",
    images: [],
    reactionCount: 14,
    topReactions: ["👍"],
    comments: [
      {
        id: 4,
        parentId: null,
        author: { name: "정하늘" },
        content: "감사합니다! 자리 넉넉했으면 좋겠어요.",
        createdAt: "2026-07-11T03:00:00.000Z",
      },
    ],
  },
  {
    id: 3,
    pubId: "a1f0c3e2-0003-4aaa-9aaa-000000000003",
    category: cat(3),
    title: "매점 메뉴에 건강한 간식도 추가해 주세요",
    content: "샐러드나 과일 같은 간식도 있으면 좋겠어요. 다들 어떻게 생각하시나요?",
    author: null,
    isPinned: false,
    createdAt: "2026-07-10T07:00:00.000Z",
    images: [],
    reactionCount: 9,
    topReactions: ["😆", "👍"],
    comments: [
      {
        id: 5,
        parentId: null,
        author: { name: "김도윤" },
        content: "완전 찬성이에요.",
        createdAt: "2026-07-10T08:00:00.000Z",
      },
      {
        id: 6,
        parentId: null,
        author: null,
        anonymousLabel: "익명1",
        content: "저도요! 요거트도 있으면 좋겠어요.",
        createdAt: "2026-07-10T09:00:00.000Z",
      },
      // 익명 글의 글쓴이가 자기 글에 단 익명 댓글 -- 번호 대신 "글쓴이". 신원은 여전히 안 드러난다
      // (어차피 익명 글이니까). 글이 실명이면 이 라벨을 붙이면 안 된다 -- 곧바로 까진다.
      {
        id: 13,
        parentId: 6,
        author: null,
        anonymousLabel: "글쓴이",
        content: "요거트 좋네요, 같이 건의해 볼게요.",
        createdAt: "2026-07-10T09:30:00.000Z",
      },
    ],
  },
  {
    id: 4,
    pubId: "a1f0c3e2-0004-4aaa-9aaa-000000000004",
    category: cat(2),
    title: "동아리 발표회 일정 확정",
    content: "동아리 발표회는 7월 25일 대강당에서 진행됩니다. 많은 참여 부탁드려요.",
    author: { name: "박서연" },
    isPinned: false,
    createdAt: "2026-07-09T07:00:00.000Z",
    // 수정된 글. 서버가 trg_mark_post_edited로 찍는다 -- 이 값이 있으면 "수정됨"이 붙는다.
    updatedAt: "2026-07-09T09:30:00.000Z",
    images: [{ src: mockImage("#15803d", "#5eead4"), alt: "auditorium-stage.jpg" }],
    reactionCount: 12,
    topReactions: ["👍", "❤️"],
    comments: [],
  },
  {
    id: 5,
    pubId: "a1f0c3e2-0005-4aaa-9aaa-000000000005",
    category: cat(1),
    title: "3분기 학생회 정기회의 회의록 모음",
    content: "지난 분기 정기회의 회의록과 예산 내역을 첨부합니다. 안건별로 나눠 올렸어요.",
    author: { name: "이현우" },
    isPinned: false,
    createdAt: "2026-07-08T09:00:00.000Z",
    images: [],
    files: [
      {
        name: "7월_정기회의_회의록.pdf",
        contentType: "application/pdf",
        sizeBytes: 312000,
        url: "#",
      },
      {
        name: "8월_정기회의_회의록.pdf",
        contentType: "application/pdf",
        sizeBytes: 287000,
        url: "#",
      },
      {
        name: "9월_정기회의_회의록.pdf",
        contentType: "application/pdf",
        sizeBytes: 356000,
        url: "#",
      },
      {
        name: "예산_집행_내역.xlsx",
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        sizeBytes: 45000,
        url: "#",
      },
    ],
    reactionCount: 6,
    topReactions: ["👍"],
    comments: [],
  },
  {
    id: 6,
    pubId: "a1f0c3e2-0006-4aaa-9aaa-000000000006",
    category: cat(4),
    title: "코딩 동아리 부원 모집합니다",
    content:
      "이번 학기 코딩 동아리에서 새 부원을 모집해요. 웹/앱 프로젝트를 함께 만들 사람 환영합니다. 관심 있으면 댓글이나 DM 주세요!",
    author: { name: "나" },
    isMine: true,
    isPinned: false,
    createdAt: "2026-07-11T04:00:00.000Z",
    images: [{ src: mockImage("#f59e0b", "#fbbf24"), alt: "coding-club-recruit.png" }],
    reactionCount: 3,
    topReactions: ["👍"],
    comments: [],
  },
  {
    id: 7,
    pubId: "a1f0c3e2-0007-4aaa-9aaa-000000000007",
    category: cat(2),
    title: "체육대회 현장 사진 공유합니다",
    content:
      "어제 열린 체육대회 사진 몇 장 올려요. 다들 정말 열심히 했고 응원 열기도 대단했어요! 나머지 사진은 정리해서 앨범으로 따로 공유할게요.",
    author: { name: "박서연" },
    isPinned: false,
    createdAt: "2026-07-11T01:00:00.000Z",
    images: [
      { src: mockImage("#dc2626", "#fb923c"), alt: "sports-day-relay.jpg" },
      { src: mockImage("#0891b2", "#67e8f9"), alt: "sports-day-tug-of-war.jpg" },
      { src: mockImage("#4f46e5", "#a5b4fc"), alt: "sports-day-cheering.jpg" },
    ],
    reactionCount: 34,
    topReactions: ["❤️", "👍"],
    comments: [
      {
        id: 9,
        parentId: null,
        author: { name: "정하늘" },
        content: "사진 너무 잘 나왔네요! 앨범도 기대할게요.",
        createdAt: "2026-07-11T02:00:00.000Z",
      },
    ],
  },
  {
    id: 8,
    pubId: "a1f0c3e2-0008-4aaa-9aaa-000000000008",
    category: cat(4),
    title: "수학여행 3일차 사진 모음",
    content:
      "수학여행 마지막 날 사진들이에요. 바다도 가고 야경도 보고 알찬 하루였습니다. 다섯 장 골라 올려요!",
    author: { name: "김지원" },
    isPinned: false,
    createdAt: "2026-07-10T12:00:00.000Z",
    images: [
      { src: mockImage("#0284c7", "#7dd3fc"), alt: "trip-beach.jpg" },
      { src: mockImage("#be185d", "#fda4af"), alt: "trip-sunset.jpg" },
      { src: mockImage("#166534", "#86efac"), alt: "trip-hiking.jpg" },
      { src: mockImage("#7c2d12", "#fdba74"), alt: "trip-market.jpg" },
      { src: mockImage("#1e293b", "#94a3b8"), alt: "trip-nightview.jpg" },
    ],
    reactionCount: 41,
    topReactions: ["❤️", "😆"],
    comments: [
      {
        id: 10,
        parentId: null,
        author: { name: "이민서" },
        content: "야경 사진 진짜 멋있어요!",
        createdAt: "2026-07-10T13:00:00.000Z",
      },
    ],
  },
  {
    id: 9,
    pubId: "a1f0c3e2-0009-4aaa-9aaa-000000000009",
    category: cat(2),
    title: "학교 축제 부스 전체 사진 아카이브",
    content:
      "축제 때 운영한 부스들 사진을 모아봤어요. 다섯 장까지만 미리 보이고 나머지는 눌러서 넘겨보세요. 총 일곱 장이에요!",
    author: { name: "박서연" },
    isPinned: false,
    createdAt: "2026-07-09T12:00:00.000Z",
    images: [
      { src: mockImage("#9333ea", "#d8b4fe"), alt: "festival-food-booth.jpg" },
      { src: mockImage("#c2410c", "#fdba74"), alt: "festival-game-booth.jpg" },
      { src: mockImage("#0d9488", "#5eead4"), alt: "festival-craft-booth.jpg" },
      { src: mockImage("#b91c1c", "#fca5a5"), alt: "festival-photo-booth.jpg" },
      { src: mockImage("#1d4ed8", "#93c5fd"), alt: "festival-band-stage.jpg" },
      { src: mockImage("#4d7c0f", "#bef264"), alt: "festival-flea-market.jpg" },
      { src: mockImage("#7e22ce", "#f0abfc"), alt: "festival-closing.jpg" },
    ],
    reactionCount: 27,
    topReactions: ["👍", "❤️"],
    comments: [
      {
        id: 11,
        parentId: null,
        author: { name: "김도윤" },
        content: "부스 다 돌았는데 사진으로 보니 또 새롭네요!",
        createdAt: "2026-07-09T13:00:00.000Z",
      },
    ],
  },
  {
    id: 10,
    pubId: "a1f0c3e2-0010-4aaa-9aaa-000000000010",
    category: null,
    title: "분실물 찾아가세요 (검은색 우산)",
    content: "3층 복도에서 검은색 장우산 주웠어요. 학생회실로 오시면 돌려드릴게요.",
    author: { name: "정하늘" },
    isPinned: false,
    createdAt: "2026-07-08T04:00:00.000Z",
    images: [],
    reactionCount: 2,
    topReactions: ["👍"],
    comments: [],
  },
]

// 삭제된 댓글(tombstone)은 세지 않는다 -- 서버도 deleted_at is null만 센다. tombstone은 답글
// 사슬을 잇기 위해 목록에 남을 뿐 "댓글 n개"의 n은 아니다.
export const mockGroupPosts: GroupPost[] = rawGroupPosts.map((post) => ({
  ...post,
  commentCount: post.comments?.filter((comment) => !comment.isDeleted).length ?? 0,
}))

// space_members 목데이터. memberCount(128)의 대표 일부만 -- 로더가 붙으면 페이지네이션으로
// 채운다. avatarUrl은 아직 자산이 없어 전부 null(이니셜 폴백). owner는 스키마상 정확히 1명.
//
// 동명이인(김도윤 30기/32기, 이민서 31기/33기)을 일부러 심어 뒀다 -- 기수를 안 보여주면 목록에서
// 누가 누군지 가를 수가 없다. profiles.name엔 유니크 제약이 없고, 실제로 흔하다.
export const mockGroupMembers: GroupMember[] = [
  {
    id: 101,
    name: "김지원",
    cohort: 29,
    avatarUrl: null,
    role: "owner",
    joinedAt: "2025-03-02T00:00:00.000Z",
  },
  {
    id: 102,
    name: "이현우",
    cohort: 30,
    avatarUrl: null,
    role: "admin",
    joinedAt: "2025-03-05T00:00:00.000Z",
  },
  {
    id: 103,
    name: "박서연",
    cohort: 30,
    avatarUrl: null,
    role: "admin",
    joinedAt: "2025-04-10T00:00:00.000Z",
  },
  {
    id: 104,
    name: "정하늘",
    cohort: 31,
    avatarUrl: null,
    role: "manager",
    joinedAt: "2025-05-21T00:00:00.000Z",
  },
  {
    id: 1,
    name: "나",
    cohort: 32,
    avatarUrl: null,
    role: "member",
    joinedAt: "2025-06-01T00:00:00.000Z",
    isMe: true,
  },
  {
    id: 105,
    name: "이민서",
    cohort: 31,
    avatarUrl: null,
    role: "member",
    joinedAt: "2025-06-15T00:00:00.000Z",
  },
  {
    id: 106,
    name: "김도윤",
    cohort: 30,
    avatarUrl: null,
    role: "member",
    joinedAt: "2025-09-03T00:00:00.000Z",
  },
  // 위 김도윤(30기)과 동명이인. 기수가 없으면 이 둘은 목록에서 구분이 불가능하다.
  {
    id: 121,
    name: "김도윤",
    cohort: 32,
    avatarUrl: null,
    role: "member",
    joinedAt: "2026-03-04T00:00:00.000Z",
  },
  {
    id: 107,
    name: "최유진",
    cohort: 32,
    avatarUrl: null,
    role: "member",
    joinedAt: "2026-01-12T00:00:00.000Z",
  },
  {
    id: 108,
    name: "한지호",
    cohort: 31,
    avatarUrl: null,
    role: "member",
    joinedAt: "2026-03-28T00:00:00.000Z",
  },
  // 페이지네이션(더 보기) 확인용 일반 멤버 -- 실제로는 memberCount(128)만큼 있고 로더가
  // keyset(space_members: role, joined_at)로 페이지 단위로 내려준다. 여기선 대표 일부.
  {
    id: 109,
    name: "강서윤",
    cohort: 33,
    avatarUrl: null,
    role: "member",
    joinedAt: "2026-04-02T00:00:00.000Z",
  },
  {
    id: 110,
    name: "조은우",
    cohort: 32,
    avatarUrl: null,
    role: "member",
    joinedAt: "2026-04-11T00:00:00.000Z",
  },
  {
    id: 111,
    name: "임채원",
    cohort: 33,
    avatarUrl: null,
    role: "member",
    joinedAt: "2026-04-19T00:00:00.000Z",
  },
  {
    id: 112,
    name: "신도현",
    cohort: 31,
    avatarUrl: null,
    role: "member",
    joinedAt: "2026-05-03T00:00:00.000Z",
  },
  {
    id: 113,
    name: "오지안",
    cohort: 33,
    avatarUrl: null,
    role: "member",
    joinedAt: "2026-05-15T00:00:00.000Z",
  },
  // 위 이민서(31기)와 동명이인.
  {
    id: 122,
    name: "이민서",
    cohort: 33,
    avatarUrl: null,
    role: "member",
    joinedAt: "2026-05-20T00:00:00.000Z",
  },
  {
    id: 114,
    name: "배준서",
    cohort: 32,
    avatarUrl: null,
    role: "member",
    joinedAt: "2026-05-27T00:00:00.000Z",
  },
  {
    id: 115,
    name: "홍시우",
    cohort: 30,
    avatarUrl: null,
    role: "member",
    joinedAt: "2026-06-08T00:00:00.000Z",
  },
  {
    id: 116,
    name: "문가람",
    cohort: 33,
    avatarUrl: null,
    role: "member",
    joinedAt: "2026-06-20T00:00:00.000Z",
  },
  {
    id: 117,
    name: "안예린",
    cohort: 31,
    avatarUrl: null,
    role: "member",
    joinedAt: "2026-06-30T00:00:00.000Z",
  },
  {
    id: 118,
    name: "유하준",
    cohort: 32,
    avatarUrl: null,
    role: "member",
    joinedAt: "2026-07-04T00:00:00.000Z",
  },
  {
    id: 119,
    name: "곽민준",
    cohort: 33,
    avatarUrl: null,
    role: "member",
    joinedAt: "2026-07-08T00:00:00.000Z",
  },
  {
    id: 120,
    name: "남서아",
    cohort: 30,
    avatarUrl: null,
    role: "member",
    joinedAt: "2026-07-11T00:00:00.000Z",
  },
]

// space_join_requests 목데이터. request 정책 그룹에서 승인 대기 중인 가입 요청 -- 관리자
// (owner/admin)만 본다. 승인 전까지는 멤버가 아니므로 space_members가 아닌 별도 테이블.
export const mockJoinRequests: GroupJoinRequest[] = [
  { id: 201, name: "서준혁", cohort: 33, avatarUrl: null, createdAt: "2026-07-11T22:00:00.000Z" },
  { id: 202, name: "윤가은", cohort: 32, avatarUrl: null, createdAt: "2026-07-12T01:30:00.000Z" },
  { id: 203, name: "장민재", cohort: 33, avatarUrl: null, createdAt: "2026-07-12T06:45:00.000Z" },
]
