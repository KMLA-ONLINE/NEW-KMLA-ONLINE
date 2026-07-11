import type { GroupPost, GroupSpace } from "~/lib/group/types"

// 실제 이미지 자산 없이 그리드를 보여주기 위한 그라디언트 SVG data-URI. 서명 URL을
// 내려줄 로더가 붙으면 사라진다. alt는 스키마에 캡션 컬럼이 없어 file_name에서 온다.
function mockImage(from: string, to: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="800" height="600" fill="url(#g)"/></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

// 로더가 space와 글을 읽어올 때까지의 대역. 값은 스키마가 실제로 담는 것만 쓴다.
export const mockGroup: GroupSpace = {
  name: "학생회",
  description: "학생 자치 활동, 행사 공지, 건의사항을 나누는 공간입니다.",
  type: "group",
  pubId: "student-council",
  joinPolicy: "request",
  memberCount: 128,
  isMember: true,
}

// 댓글은 각 글에 들고 있고 개수는 comments.length로 파생한다(대댓글 포함 -- count(*)와
// 동일). parentId로 스레드를 이룬다. 4번 글은 빈 상태 확인용으로 댓글이 없다.
export const mockGroupPosts: GroupPost[] = [
  {
    id: 1,
    pubId: "a1f0c3e2-0001-4aaa-9aaa-000000000001",
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
      {
        id: 2,
        parentId: null,
        author: null,
        content: "봉사 시간 인증서는 어디서 받을 수 있나요?",
        createdAt: "2026-07-11T06:30:00.000Z",
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
    title: "기말고사 기간 열람실 연장 운영 안내",
    content: "다음 주부터 2주간 열람실을 밤 12시까지 연장 운영합니다. 자리는 선착순입니다.",
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
        content: "저도요! 요거트도 있으면 좋겠어요.",
        createdAt: "2026-07-10T09:00:00.000Z",
      },
    ],
  },
  {
    id: 4,
    pubId: "a1f0c3e2-0004-4aaa-9aaa-000000000004",
    title: "동아리 발표회 일정 확정",
    content: "동아리 발표회는 7월 25일 대강당에서 진행됩니다. 많은 참여 부탁드려요.",
    author: { name: "박서연" },
    isPinned: false,
    createdAt: "2026-07-09T07:00:00.000Z",
    images: [{ src: mockImage("#15803d", "#5eead4"), alt: "auditorium-stage.jpg" }],
    reactionCount: 12,
    topReactions: ["👍", "❤️"],
    comments: [],
  },
  {
    id: 5,
    pubId: "a1f0c3e2-0005-4aaa-9aaa-000000000005",
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
]
