import type { Club, ClubApplicant } from "~/lib/club/types"

export const mockClubs: Club[] = [
  {
    id: "band",
    name: "밴드부",
    emoji: "🎸",
    division: "sudo",
    summary: "정기 공연과 합주를 중심으로 활동하는 밴드 동아리입니다.",
    descriptionMarkdown: `# 동아리 소개
밴드부는 악기 연주와 보컬에 관심 있는 학생들이 함께 합주하고 공연을 준비하는 동아리입니다.

## 주요 활동
매주 정기 합주를 진행하고, 학교 행사와 자체 공연 무대를 준비합니다.

## 지원 안내
연주 실력보다 꾸준히 연습하고 팀 활동에 책임감 있게 참여할 수 있는지를 중요하게 봅니다.`,
    meeting: "매주 수요일 7교시",
    location: "음악실",
    memberCount: 18,
    managers: [
      { userId: "club-band-owner", name: "김민준", role: "owner", cohort: 29 },
      { userId: "club-band-admin", name: "박서연", role: "admin", cohort: 30 },
    ],
    recruitment: {
      id: "band-2026-early",
      title: "2026 Early 모집",
      kind: "early",
      status: "open",
      startsAt: "2026-07-20T09:00:00+09:00",
      endsAt: "2026-07-27T17:00:00+09:00",
      resultAt: "2026-07-30T20:00:00+09:00",
      capacity: 6,
      announcementMarkdown: `# 2026 Early 모집
보컬, 기타, 베이스, 키보드, 드럼 파트를 모집합니다.

## 지원 방법
지원 버튼을 누르면 밴드부 관리자와의 1:1 대화로 이동합니다. 자기소개와 희망 파트, 가능한 연습 시간을 보내주세요.`,
    },
    myApplication: {
      status: "submitted",
      updatedAt: "2026-07-22T18:30:00+09:00",
      note: "관리자에게 지원 메시지를 보냈습니다.",
    },
  },
  {
    id: "qubit",
    name: "Qubit",
    emoji: "💻",
    division: "mokdong",
    summary: "웹, 앱, AI 프로젝트를 함께 만드는 IT 동아리입니다.",
    descriptionMarkdown: `# 동아리 소개
Qubit은 학교생활에서 발견한 문제를 소프트웨어로 해결하는 프로젝트형 동아리입니다.

## 주요 활동
프론트엔드, 백엔드, 인공지능, 임베디드 분야의 팀 프로젝트를 진행합니다.

## 지원 안내
개발 경험이 없어도 지원할 수 있지만, 한 학기 동안 하나의 결과물을 끝까지 완성할 의지가 필요합니다.`,
    meeting: "매주 금요일 7교시",
    location: "컴퓨터실",
    memberCount: 14,
    managers: [
      { userId: "club-qubit-owner", name: "신민기", role: "owner", cohort: 30 },
      { userId: "club-qubit-editor", name: "황민지", role: "editor", cohort: 30 },
    ],
    recruitment: {
      id: "qubit-2026-regular",
      title: "2026 일반 모집",
      kind: "regular",
      status: "upcoming",
      startsAt: "2026-08-03T09:00:00+09:00",
      endsAt: "2026-08-09T17:00:00+09:00",
      resultAt: "2026-08-12T20:00:00+09:00",
      capacity: 8,
      announcementMarkdown: `# 2026 일반 모집
개발, 디자인, 기획 분야에서 함께 프로젝트를 진행할 학생을 모집합니다.

## 지원 방법
모집 기간이 시작되면 관리자와의 1:1 대화를 통해 지원할 수 있습니다.`,
    },
    myApplication: null,
  },
  {
    id: "photography",
    name: "사진부",
    emoji: "📷",
    division: "sudo",
    summary: "학교의 일상과 행사를 사진으로 기록하는 동아리입니다.",
    descriptionMarkdown: `# 동아리 소개
사진부는 학교 행사와 일상을 촬영하고, 사진을 선별해 전시하거나 기록물로 남깁니다.

## 주요 활동
촬영 실습, 사진 피드백, 교내 행사 기록, 학기말 전시를 진행합니다.`,
    meeting: "격주 목요일 7교시",
    location: "미술실",
    memberCount: 12,
    managers: [{ userId: "club-photo-owner", name: "이서현", role: "owner", cohort: 29 }],
    recruitment: {
      id: "photo-2026-early",
      title: "2026 Early 모집",
      kind: "early",
      status: "reviewing",
      startsAt: "2026-07-10T09:00:00+09:00",
      endsAt: "2026-07-18T17:00:00+09:00",
      resultAt: "2026-07-25T20:00:00+09:00",
      capacity: 5,
      announcementMarkdown: `# 모집 마감
현재 제출된 지원 메시지를 검토하고 있습니다. 결과는 공지된 시간에 공개됩니다.`,
    },
    myApplication: {
      status: "reviewing",
      updatedAt: "2026-07-18T16:20:00+09:00",
    },
  },
  {
    id: "football",
    name: "CGV",
    emoji: "⚽",
    division: "mokdong",
    summary: "정기 훈련과 교내외 경기를 준비하는 축구 동아리입니다.",
    descriptionMarkdown: `# 동아리 소개
축구부는 기초 체력과 팀 전술을 함께 훈련하고 교내외 경기에 참가합니다.

## 주요 활동
주 1회 정기 훈련, 연습 경기, 대회 준비를 진행합니다.`,
    meeting: "매주 화요일 방과 후",
    location: "운동장",
    memberCount: 24,
    managers: [
      { userId: "club-football-owner", name: "정우진", role: "owner", cohort: 29 },
      { userId: "club-football-admin", name: "최도윤", role: "admin", cohort: 30 },
    ],
    recruitment: {
      id: "football-2026-early",
      title: "2026 Early 모집",
      kind: "early",
      status: "announced",
      startsAt: "2026-07-01T09:00:00+09:00",
      endsAt: "2026-07-08T17:00:00+09:00",
      resultAt: "2026-07-12T20:00:00+09:00",
      capacity: 7,
      announcementMarkdown: `# 결과 발표
지원 결과가 공개되었습니다. 합격자는 관리자 안내에 따라 첫 모임에 참여해주세요.`,
    },
    myApplication: {
      status: "accepted",
      updatedAt: "2026-07-12T20:00:00+09:00",
      note: "첫 모임 일정은 관리자에게 별도로 안내받습니다.",
    },
  },
  {
    id: "art",
    name: "경국지화",
    emoji: "🎨",
    division: "sudo",
    summary: "개인 작업과 공동 전시를 함께 준비하는 미술 동아리입니다.",
    descriptionMarkdown: `# 동아리 소개
미술부는 각자의 작업을 이어가면서 서로 피드백하고, 학기말 공동 전시를 준비합니다.

## 주요 활동
드로잉, 회화, 입체 작업, 전시 기획을 진행합니다.`,
    meeting: "매주 월요일 7교시",
    location: "미술실",
    memberCount: 16,
    managers: [{ userId: "club-art-owner", name: "한지우", role: "owner", cohort: 29 }],
    recruitment: {
      id: "art-2026-early",
      title: "2026 Early 모집",
      kind: "early",
      status: "announced",
      startsAt: "2026-06-25T09:00:00+09:00",
      endsAt: "2026-07-03T17:00:00+09:00",
      resultAt: "2026-07-07T20:00:00+09:00",
      capacity: 4,
      announcementMarkdown: `# 결과 발표
지원 결과가 공개되었습니다. 결과와 관련된 문의는 관리자에게 1:1로 전달해주세요.`,
    },
    myApplication: {
      status: "rejected",
      updatedAt: "2026-07-07T20:00:00+09:00",
    },
  },
  {
    id: "science",
    name: "과학탐구반",
    emoji: "🔬",
    division: "mokdong",
    summary: "관심 있는 과학 주제를 정하고 장기 탐구를 수행하는 동아리입니다.",
    descriptionMarkdown: `# 동아리 소개
과학탐구반은 스스로 연구 질문을 정하고 실험 또는 자료 분석을 통해 결과를 정리합니다.

## 주요 활동
연구 주제 선정, 실험 설계, 중간 발표, 최종 보고서 작성 활동을 진행합니다.`,
    meeting: "매주 목요일 7교시",
    location: "과학실",
    memberCount: 20,
    managers: [
      { userId: "club-science-owner", name: "윤하준", role: "owner", cohort: 29 },
      { userId: "club-science-admin", name: "김채원", role: "admin", cohort: 30 },
    ],
    recruitment: {
      id: "science-2026-regular",
      title: "2026 일반 모집",
      kind: "regular",
      status: "open",
      startsAt: "2026-07-21T09:00:00+09:00",
      endsAt: "2026-07-29T17:00:00+09:00",
      resultAt: "2026-08-02T20:00:00+09:00",
      capacity: 10,
      announcementMarkdown: `# 2026 일반 모집
관심 있는 과학 분야와 탐구해보고 싶은 질문을 관리자에게 보내주세요.

## 지원 방법
지원 버튼을 누르면 관리자와의 1:1 대화로 이동합니다.`,
    },
    myApplication: null,
  },
  {
    id: "debate",
    name: "CONCEPT",
    emoji: "🗣️",
    division: "mokdong",
    summary: "시사 주제를 조사하고 토론과 발표를 연습하는 동아리입니다.",
    descriptionMarkdown: `# 동아리 소개
토론부는 여러 관점에서 자료를 조사하고 논리를 구성해 토론하는 활동을 진행합니다.

## 주요 활동
주제 조사, 팀별 토론, 피드백, 교내 토론 행사 운영을 진행합니다.`,
    meeting: "격주 금요일 7교시",
    location: "세미나실",
    memberCount: 11,
    managers: [{ userId: "club-debate-owner", name: "오수빈", role: "owner", cohort: 29 }],
    recruitment: null,
    myApplication: null,
  },
]

export const mockClubApplicantsByClubId: Record<string, ClubApplicant[]> = {
  band: [
    {
      id: "application-band-1",
      userId: "student-1",
      name: "김도현",
      cohort: 31,
      status: "submitted",
      submittedAt: "2026-07-21T19:10:00+09:00",
      conversationId: "conversation-band-1",
    },
    {
      id: "application-band-2",
      userId: "student-2",
      name: "이하은",
      cohort: 31,
      status: "reviewing",
      submittedAt: "2026-07-22T15:40:00+09:00",
      conversationId: "conversation-band-2",
    },
    {
      id: "application-band-3",
      userId: "student-3",
      name: "박시우",
      cohort: 30,
      status: "accepted",
      submittedAt: "2026-07-20T21:05:00+09:00",
      conversationId: "conversation-band-3",
    },
    {
      id: "application-band-4",
      userId: "student-4",
      name: "최유진",
      cohort: 31,
      status: "rejected",
      submittedAt: "2026-07-20T20:20:00+09:00",
      conversationId: "conversation-band-4",
    },
  ],
  qubit: [],
  photography: [
    {
      id: "application-photo-1",
      userId: "student-5",
      name: "강민서",
      cohort: 31,
      status: "reviewing",
      submittedAt: "2026-07-17T22:30:00+09:00",
      conversationId: "conversation-photo-1",
    },
  ],
  football: [],
  art: [],
  science: [
    {
      id: "application-science-1",
      userId: "student-6",
      name: "문서준",
      cohort: 30,
      status: "submitted",
      submittedAt: "2026-07-22T11:00:00+09:00",
      conversationId: "conversation-science-1",
    },
  ],
  debate: [],
}
