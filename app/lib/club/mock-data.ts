import type { Club, ClubApplicant } from "~/lib/club/types"

export const mockClubs: Club[] = [
  {
    id: "band",
    name: "밴드부",
    emoji: "🎸",
    imageUrl: null,
    division: "sudo",
    cardDescription: "합주와 공연을 준비하는 밴드 동아리",
    descriptionMarkdown: `# 밴드부

악기 연주와 보컬에 관심 있는 학생들이 함께 합주하고 공연을 준비합니다.


## 활동

매주 정기 합주를 진행하고 학교 행사와 자체 공연 무대를 준비합니다.


## 지원

연주 실력보다 꾸준히 연습하고 팀 활동에 책임감 있게 참여할 수 있는지를 중요하게 봅니다.`,
    meeting: "수요일 7교시",
    location: "음악실",
    managers: [
      { userId: "club-band-1", name: "김민준", cohort: 29 },
      { userId: "club-band-2", name: "박서연", cohort: 30 },
    ],
    recruitment: {
      id: "band-2026",
      title: "2026 동아리 모집",
      isOpen: true,
      startsAt: "2026-07-20T09:00:00+09:00",
      endsAt: "2026-07-27T17:00:00+09:00",
      announcementMarkdown: `보컬, 기타, 베이스, 키보드, 드럼 파트를 모집합니다.


지원 버튼을 누른 뒤 희망 파트와 가능한 연습 시간을 보내주세요.`,
    },
    myApplication: {
      submittedAt: "2026-07-22T18:30:00+09:00",
      conversationId: "band-application",
    },
  },
  {
    id: "defcon",
    name: "DEFCON",
    emoji: "💻",
    imageUrl: null,
    division: "mokdong",
    cardDescription: "웹, 앱, AI 프로젝트를 만드는 IT 동아리",
    descriptionMarkdown: `# DEFCON

학교생활에서 발견한 문제를 소프트웨어로 해결하는 프로젝트형 동아리입니다.


## 활동

프론트엔드, 백엔드, 인공지능, 임베디드 분야의 팀 프로젝트를 진행합니다.`,
    meeting: "목요일 7교시",
    location: "컴퓨터실",
    managers: [
      { userId: "club-qubit-1", name: "김서혁", cohort: 30 },
      { userId: "club-qubit-2", name: "반예안", cohort: 30 },
    ],
    recruitment: {
      id: "qubit-2026",
      title: "2026 동아리 모집",
      isOpen: true,
      startsAt: "2026-07-20T09:00:00+09:00",
      endsAt: "2026-07-29T17:00:00+09:00",
      announcementMarkdown: `개발, 디자인, 기획 분야에서 함께 프로젝트를 진행할 학생을 모집합니다.`,
    },
    myApplication: null,
  },
  {
    id: "ttl",
    name: "TTL",
    emoji: "📷",
    imageUrl: null,
    division: "sudo",
    cardDescription: "학교의 일상과 행사를 사진으로 기록하는 동아리",
    descriptionMarkdown: `# TTL

학교 행사와 일상을 촬영하고 사진을 선별해 전시하거나 기록물로 남깁니다.`,
    meeting: "격주 목요일 7교시",
    location: "미술실",
    managers: [{ userId: "club-ttl-1", name: "이서현", cohort: 29 }],
    recruitment: {
      id: "ttl-2026",
      title: "2026 동아리 모집",
      isOpen: false,
      startsAt: "2026-07-10T09:00:00+09:00",
      endsAt: "2026-07-18T17:00:00+09:00",
      announcementMarkdown: `현재 지원을 받지 않습니다.`,
    },
    myApplication: {
      submittedAt: "2026-07-18T16:20:00+09:00",
      conversationId: "ttl-application",
    },
  },
  {
    id: "cgv",
    name: "CGV",
    emoji: "⚽",
    imageUrl: null,
    division: "mokdong",
    cardDescription: "정기 훈련과 경기를 준비하는 축구 동아리",
    descriptionMarkdown: `# CGV

기초 체력과 팀 전술을 함께 훈련하고 교내외 경기에 참가합니다.`,
    meeting: "화요일 방과 후",
    location: "운동장",
    managers: [{ userId: "club-cgv-1", name: "정우진", cohort: 29 }],
    recruitment: null,
    myApplication: null,
  },
  {
    id: "art",
    name: "경국지화",
    emoji: "🎨",
    imageUrl: null,
    division: "sudo",
    cardDescription: "개인 작업과 공동 전시를 준비하는 미술 동아리",
    descriptionMarkdown: `# 경국지화

각자의 작업을 이어가면서 서로 피드백하고 학기말 공동 전시를 준비합니다.`,
    meeting: "월요일 7교시",
    location: "미술실",
    managers: [{ userId: "club-art-1", name: "한지우", cohort: 29 }],
    recruitment: {
      id: "art-2026",
      title: "2026 동아리 모집",
      isOpen: true,
      startsAt: "2026-07-20T09:00:00+09:00",
      endsAt: "2026-07-28T17:00:00+09:00",
      announcementMarkdown: `드로잉, 회화, 입체 작업에 관심 있는 학생을 모집합니다.`,
    },
    myApplication: null,
  },
  {
    id: "debate",
    name: "EDS",
    emoji: "🗣️",
    imageUrl: null,
    division: "mokdong",
    cardDescription: "시사 주제를 조사하고 토론하는 동아리",
    descriptionMarkdown: `# EDS

여러 관점에서 자료를 조사하고 논리를 구성해 토론하는 활동을 진행합니다.`,
    meeting: "격주 금요일 7교시",
    location: "세미나실",
    managers: [{ userId: "club-debate-1", name: "오수빈", cohort: 29 }],
    recruitment: {
      id: "debate-2026",
      title: "2026 동아리 모집",
      isOpen: false,
      startsAt: "2026-07-01T09:00:00+09:00",
      endsAt: "2026-07-10T17:00:00+09:00",
      announcementMarkdown: `현재 지원을 받지 않습니다.`,
    },
    myApplication: null,
  },
]

export const mockClubApplicantsByClubId: Record<string, ClubApplicant[]> = {
  band: [
    {
      id: "band-applicant-1",
      name: "김도현",
      cohort: 31,
      submittedAt: "2026-07-21T19:10:00+09:00",
      conversationId: "band-applicant-1",
    },
    {
      id: "band-applicant-2",
      name: "이하은",
      cohort: 31,
      submittedAt: "2026-07-22T15:40:00+09:00",
      conversationId: "band-applicant-2",
    },
    {
      id: "band-applicant-3",
      name: "박시우",
      cohort: 30,
      submittedAt: "2026-07-20T21:05:00+09:00",
      conversationId: "band-applicant-3",
    },
  ],
  qubit: [
    {
      id: "qubit-applicant-1",
      name: "문서준",
      cohort: 30,
      submittedAt: "2026-07-22T11:00:00+09:00",
      conversationId: "qubit-applicant-1",
    },
  ],
  photography: [],
  football: [],
  art: [],
  debate: [],
}
