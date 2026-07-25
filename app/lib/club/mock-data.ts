import type { Club, ClubApplicant, ClubApplyRoundRow, ClubRow } from "~/lib/club/types"

const createdAt = "2026-07-01T00:00:00+09:00"

const clubRows = {
  band: {
    id: 1,
    name: "밴드부",
    description: `# 밴드부

악기 연주와 보컬에 관심 있는 학생들이 함께 합주하고 공연을 준비합니다.


## 활동

매주 정기 합주를 진행하고 학교 행사와 자체 공연 무대를 준비합니다.


## 지원

연주 실력보다 꾸준히 연습하고 팀 활동에 책임감 있게 참여할 수 있는지를 중요하게 봅니다.`,
    type: "major",
    card_description: "합주와 공연을 준비하는 밴드 동아리",
    emoji: "🎸",
    image_url: null,
    meeting: "수요일 7교시",
    location: "음악실",
    updated_at: null,
    created_at: createdAt,
  },
  defcon: {
    id: 2,
    name: "DEFCON",
    description: `# DEFCON

학교생활에서 발견한 문제를 소프트웨어로 해결하는 프로젝트형 동아리입니다.


## 활동

프론트엔드, 백엔드, 인공지능, 임베디드 분야의 팀 프로젝트를 진행합니다.`,
    type: "general",
    card_description: "웹, 앱, AI 프로젝트를 만드는 IT 동아리",
    emoji: "💻",
    image_url: null,
    meeting: "목요일 7교시",
    location: "컴퓨터실",
    updated_at: null,
    created_at: createdAt,
  },
  ttl: {
    id: 3,
    name: "TTL",
    description: `# TTL

학교 행사와 일상을 촬영하고 사진을 선별해 전시하거나 기록물로 남깁니다.`,
    type: "major",
    card_description: "학교의 일상과 행사를 사진으로 기록하는 동아리",
    emoji: "📷",
    image_url: null,
    meeting: "격주 목요일 7교시",
    location: "미술실",
    updated_at: null,
    created_at: createdAt,
  },
  cgv: {
    id: 4,
    name: "CGV",
    description: `# CGV

기초 체력과 팀 전술을 함께 훈련하고 교내외 경기에 참가합니다.`,
    type: "general",
    card_description: "정기 훈련과 경기를 준비하는 축구 동아리",
    emoji: "⚽",
    image_url: null,
    meeting: "화요일 방과 후",
    location: "운동장",
    updated_at: null,
    created_at: createdAt,
  },
  art: {
    id: 5,
    name: "경국지화",
    description: `# 경국지화

각자의 작업을 이어가면서 서로 피드백하고 학기말 공동 전시를 준비합니다.`,
    type: "major",
    card_description: "개인 작업과 공동 전시를 준비하는 미술 동아리",
    emoji: "🎨",
    image_url: null,
    meeting: "월요일 7교시",
    location: "미술실",
    updated_at: null,
    created_at: createdAt,
  },
  debate: {
    id: 6,
    name: "EDS",
    description: `# EDS

여러 관점에서 자료를 조사하고 논리를 구성해 토론하는 활동을 진행합니다.`,
    type: "general",
    card_description: "시사 주제를 조사하고 토론하는 동아리",
    emoji: "🗣️",
    image_url: null,
    meeting: "격주 금요일 7교시",
    location: "세미나실",
    updated_at: null,
    created_at: createdAt,
  },
} satisfies Record<string, ClubRow>

export const mockClubApplyRound: ClubApplyRoundRow = {
  id: 1,
  name: "2026 동아리 모집",
  starts_at: "2026-07-20T09:00:00+09:00",
  ends_at: "2026-07-29T17:00:00+09:00",
  apply_range: null,
  created_by: 1,
  created_at: createdAt,
}

export const mockClubs: Club[] = [
  {
    ...clubRows.band,
    slug: "band",
    emoji: "🎸",
    imageUrl: null,
    cardDescription: "합주와 공연을 준비하는 밴드 동아리",
    meeting: "수요일 7교시",
    location: "음악실",
    managers: [
      { id: 11, name: "김민준", cohort: 29 },
      { id: 12, name: "박서연", cohort: 30 },
    ],
    recruitment: {
      ...mockClubApplyRound,
      isOpen: true,
      announcementMarkdown: `보컬, 기타, 베이스, 키보드, 드럼 파트를 모집합니다.


지원 버튼을 누른 뒤 희망 파트와 가능한 연습 시간을 보내주세요.`,
    },
    myApplication: {
      id: 1,
      round_id: mockClubApplyRound.id,
      user_id: 100,
      club_id: clubRows.band.id,
      created_at: "2026-07-22T18:30:00+09:00",
      conversationId: "band-application",
    },
  },
  {
    ...clubRows.defcon,
    slug: "defcon",
    emoji: "💻",
    imageUrl: null,
    cardDescription: "웹, 앱, AI 프로젝트를 만드는 IT 동아리",
    meeting: "목요일 7교시",
    location: "컴퓨터실",
    managers: [
      { id: 21, name: "김서혁", cohort: 30 },
      { id: 22, name: "반예안", cohort: 30 },
    ],
    recruitment: {
      ...mockClubApplyRound,
      isOpen: true,
      announcementMarkdown: "개발, 디자인, 기획 분야에서 함께 프로젝트를 진행할 학생을 모집합니다.",
    },
    myApplication: null,
  },
  {
    ...clubRows.ttl,
    slug: "ttl",
    emoji: "📷",
    imageUrl: null,
    cardDescription: "학교의 일상과 행사를 사진으로 기록하는 동아리",
    meeting: "격주 목요일 7교시",
    location: "미술실",
    managers: [{ id: 31, name: "이서현", cohort: 29 }],
    recruitment: {
      ...mockClubApplyRound,
      isOpen: false,
      announcementMarkdown: "현재 지원을 받지 않습니다.",
    },
    myApplication: {
      id: 2,
      round_id: mockClubApplyRound.id,
      user_id: 100,
      club_id: clubRows.ttl.id,
      created_at: "2026-07-18T16:20:00+09:00",
      conversationId: "ttl-application",
    },
  },
  {
    ...clubRows.cgv,
    slug: "cgv",
    emoji: "⚽",
    imageUrl: null,
    cardDescription: "정기 훈련과 경기를 준비하는 축구 동아리",
    meeting: "화요일 방과 후",
    location: "운동장",
    managers: [{ id: 41, name: "정우진", cohort: 29 }],
    recruitment: null,
    myApplication: null,
  },
  {
    ...clubRows.art,
    slug: "art",
    emoji: "🎨",
    imageUrl: null,
    cardDescription: "개인 작업과 공동 전시를 준비하는 미술 동아리",
    meeting: "월요일 7교시",
    location: "미술실",
    managers: [{ id: 51, name: "한지우", cohort: 29 }],
    recruitment: {
      ...mockClubApplyRound,
      isOpen: true,
      announcementMarkdown: "드로잉, 회화, 입체 작업에 관심 있는 학생을 모집합니다.",
    },
    myApplication: null,
  },
  {
    ...clubRows.debate,
    slug: "debate",
    emoji: "🗣️",
    imageUrl: null,
    cardDescription: "시사 주제를 조사하고 토론하는 동아리",
    meeting: "격주 금요일 7교시",
    location: "세미나실",
    managers: [{ id: 61, name: "오수빈", cohort: 29 }],
    recruitment: {
      ...mockClubApplyRound,
      isOpen: false,
      announcementMarkdown: "현재 지원을 받지 않습니다.",
    },
    myApplication: null,
  },
]

export const mockClubApplicantsByClubSlug: Record<string, ClubApplicant[]> = {
  band: [
    {
      id: 11,
      round_id: mockClubApplyRound.id,
      user_id: 201,
      club_id: clubRows.band.id,
      created_at: "2026-07-21T19:10:00+09:00",
      profile: { id: 201, name: "김도현", cohort: 31 },
      conversationId: "band-applicant-1",
    },
    {
      id: 12,
      round_id: mockClubApplyRound.id,
      user_id: 202,
      club_id: clubRows.band.id,
      created_at: "2026-07-22T15:40:00+09:00",
      profile: { id: 202, name: "이하은", cohort: 31 },
      conversationId: "band-applicant-2",
    },
    {
      id: 13,
      round_id: mockClubApplyRound.id,
      user_id: 203,
      club_id: clubRows.band.id,
      created_at: "2026-07-20T21:05:00+09:00",
      profile: { id: 203, name: "박시우", cohort: 30 },
      conversationId: "band-applicant-3",
    },
  ],
  defcon: [
    {
      id: 21,
      round_id: mockClubApplyRound.id,
      user_id: 204,
      club_id: clubRows.defcon.id,
      created_at: "2026-07-22T11:00:00+09:00",
      profile: { id: 204, name: "문서준", cohort: 30 },
      conversationId: "defcon-applicant-1",
    },
  ],
  ttl: [],
  cgv: [],
  art: [],
  debate: [],
}
