import type { GroupCategory, GroupPost, GroupPostSpace } from "~/lib/group/types"

// 홈 피드의 대역 데이터. 로더가 list_feed_posts로 "내가 가입한 space들의 글"을 최신순으로
// 읽어올 때까지 이걸 쓴다. group/mock-data.ts와 다른 점은 딱 하나 -- 글마다 space(출처)가 붙는다.
// 여러 그룹의 글을 한 흐름에 섞으므로 어디서 왔는지 알아야 하기 때문이다. 값은 스키마가 실제로
// 담는 것만 쓴다.
//
// 고정(isPinned)은 전부 false다: 고정은 한 그룹 안에서의 정렬 개념이라 여러 그룹을 가로지르는
// 피드에선 의미가 없다("무슨 기준으로 맨 위?"). 피드의 정렬은 순수 최신순 하나뿐이다.

// 실제 이미지 자산 없이 그리드를 보여주기 위한 그라디언트 SVG data-URI. 서명 URL을 내려줄
// 로더가 붙으면 사라진다(group/mock-data.ts와 같은 대역).
function mockImage(from: string, to: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="800" height="600" fill="url(#g)"/></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

// 내가 가입해 있다고 가정하는 space들. pubId는 /groups/:pubId 링크에 실린다.
const SPACES = {
  council: { name: "행정위원회", type: "group", pubId: "student-council" },
  library: { name: "도서부", type: "group", pubId: "library-committee" },
  dorm: { name: "사감부", type: "group", pubId: "dorm-office" },
  coding: { name: "코딩 동아리", type: "community", pubId: "coding-club" },
  market: { name: "중고장터", type: "community", pubId: "secondhand" },
  lost: { name: "분실물 센터", type: "community", pubId: "lost-and-found" },
} satisfies Record<string, GroupPostSpace>

// 카테고리는 space마다 따로다(같은 이름이어도 다른 그룹의 것). 표시엔 이름만 쓰이니 간단히.
const category = (id: number, name: string, sortOrder = 0): GroupCategory => ({
  id,
  name,
  sortOrder,
})

// 이미 최신순으로 두었지만, 라우트가 created_at 내림차순으로 한 번 더 정렬한다(방어).
export const mockFeedPosts: GroupPost[] = [
  {
    id: 5001,
    pubId: "f1a00001-0001-4aaa-9aaa-000000000001",
    space: SPACES.dorm,
    category: category(1, "공지"),
    title: "이번 주 저녁 점호 20분 앞당깁니다",
    content:
      "기말고사 기간 동안 저녁 점호를 21시 40분에서 21시 20분으로 앞당깁니다. 자습 연장을 신청한 학생은 사감실에 미리 알려주세요.",
    author: { name: "이정민 사감" },
    isPinned: false,
    createdAt: "2026-07-13T09:30:00.000Z",
    images: [],
    commentCount: 4,
    reactionCount: 12,
    topReactions: ["👍"],
  },
  {
    id: 5002,
    pubId: "f1a00002-0002-4aaa-9aaa-000000000002",
    space: SPACES.market,
    category: null,
    title: "TI-84 그래픽 계산기 팝니다 (상태 좋음)",
    content:
      "졸업하는 선배한테 받은 거라 상태 깨끗해요. 커버랑 여분 배터리도 같이 드립니다. 자습 끝나고 기숙사 로비에서 거래 가능합니다.",
    author: { name: "3-2 이현우" },
    isPinned: false,
    createdAt: "2026-07-13T08:10:00.000Z",
    images: [{ src: mockImage("#0f766e", "#5eead4"), alt: "ti84-calculator.jpg" }],
    commentCount: 6,
    reactionCount: 5,
    topReactions: ["👍"],
  },
  {
    id: 5003,
    pubId: "f1a00003-0003-4aaa-9aaa-000000000003",
    space: SPACES.council,
    category: category(2, "행사"),
    title: "여름 축제 부스 신청 내일 마감",
    content:
      "부스를 운영할 동아리·학급은 내일 저녁 6시까지 신청해 주세요. 신청서는 학생회 링크에 있고, 부스 위치는 신청 순서대로 배정됩니다.",
    author: { name: "김지원" },
    isPinned: false,
    createdAt: "2026-07-13T05:00:00.000Z",
    images: [],
    commentCount: 9,
    reactionCount: 23,
    topReactions: ["❤️", "👍"],
  },
  {
    id: 5004,
    pubId: "f1a00004-0004-4aaa-9aaa-000000000004",
    space: SPACES.lost,
    category: null,
    title: "도서관 앞에서 무선이어폰 주웠습니다",
    content:
      "흰색 케이스에 스티커가 붙어 있어요. 케이스 색이랑 스티커 모양을 말해주시면 돌려드릴게요.",
    author: null,
    isPinned: false,
    createdAt: "2026-07-12T23:40:00.000Z",
    images: [],
    commentCount: 3,
    reactionCount: 2,
    topReactions: ["👍"],
  },
  {
    id: 5005,
    pubId: "f1a00005-0005-4aaa-9aaa-000000000005",
    space: SPACES.library,
    category: category(1, "공지"),
    title: "신착 도서 30권 입고 — 오늘부터 대출 시작",
    content:
      "이번 달 신청받은 도서들이 들어왔습니다. 목록을 첨부하니 확인하시고, 인기 도서는 예약 걸어두세요. 대출은 1인 3권까지입니다.",
    author: { name: "박서연" },
    isPinned: false,
    createdAt: "2026-07-12T12:00:00.000Z",
    images: [],
    files: [
      {
        name: "7월_신착도서_목록.pdf",
        contentType: "application/pdf",
        sizeBytes: 184000,
        url: "#",
      },
    ],
    commentCount: 2,
    reactionCount: 15,
    topReactions: ["👍", "❤️"],
  },
  {
    id: 5006,
    pubId: "f1a00006-0006-4aaa-9aaa-000000000006",
    space: SPACES.coding,
    category: category(4, "자유"),
    title: "이번 학기 프로젝트 팀원 구해요",
    content:
      "웹앱 하나 같이 만들 사람 두세 명 찾습니다. 디자인이든 백엔드든 관심만 있으면 환영이에요. 매주 수요일 저녁에 모입니다.",
    author: { name: "나" },
    isMine: true,
    isPinned: false,
    createdAt: "2026-07-12T07:30:00.000Z",
    images: [{ src: mockImage("#4338ca", "#a5b4fc"), alt: "project-recruit.png" }],
    commentCount: 5,
    reactionCount: 8,
    topReactions: ["👍", "😆"],
  },
  {
    id: 5007,
    pubId: "f1a00007-0007-4aaa-9aaa-000000000007",
    space: SPACES.council,
    category: category(3, "건의"),
    title: "매점에 건강한 간식도 들여놔 주세요",
    content: "샐러드나 과일, 그릭요거트 같은 것도 있으면 좋겠어요. 공감하시면 반응 눌러주세요!",
    author: null,
    isPinned: false,
    createdAt: "2026-07-11T22:15:00.000Z",
    images: [],
    commentCount: 7,
    reactionCount: 19,
    topReactions: ["👍", "❤️"],
  },
  {
    id: 5008,
    pubId: "f1a00008-0008-4aaa-9aaa-000000000008",
    space: SPACES.library,
    category: category(4, "자유"),
    title: "기말 대비 열람실 자리 나눔 팁",
    content:
      "창가 자리는 오전엔 해가 안 들어서 오래 앉아 있기 좋아요. 콘센트는 3열이랑 7열에만 있으니 노트북 쓸 사람은 참고하세요.",
    author: { name: "최유진" },
    isPinned: false,
    createdAt: "2026-07-11T14:00:00.000Z",
    images: [],
    commentCount: 1,
    reactionCount: 6,
    topReactions: ["👍"],
  },
]

// 오른쪽 사이드바의 급식 카드. 지금은 레이아웃용 mock -- 나중에 cron이 급식 API에서 받아 채운다.
// 표시에 필요한 것만 담는다: 날짜 한 줄, 끼니별 메뉴 목록.
export type MealMenu = {
  /** 끼니 이름(조식·중식·석식). */
  label: string
  /** 메뉴 항목들. */
  items: string[]
}

export const mockMealPlan: { dateLabel: string; meals: MealMenu[] } = {
  dateLabel: "7월 13일 (월)",
  meals: [
    { label: "조식", items: ["흑미밥", "된장찌개", "계란말이", "배추김치", "요구르트"] },
    { label: "중식", items: ["백미밥", "제육볶음", "미역국", "코울슬로", "깍두기", "오렌지"] },
    { label: "석식", items: ["김치볶음밥", "유부장국", "치킨텐더", "단무지", "청포도"] },
  ],
}
