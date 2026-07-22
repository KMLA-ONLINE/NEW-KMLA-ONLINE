import type { MyProfile } from "~/lib/profile/types"

// `?as=`로 역할별 프로필을 확인하는 목 데이터.
export const mockProfile: MyProfile = {
  id: 1,
  name: "김민족",
  role: "user",
  type: "student",
  student_number: "251000",
  class_no: 1,
  cohort: 30,
  gender: "male",
  track: "international",
  department: "과학기술부",
  phone_number: "01000000000",
  contact_email: null,
  avatar_url: null,
  cover_image_url: null,
  birthday: "2009-03-01",
  description: "소개글입니다. 소개글입니다. 소개글입니다. ",
  status: "accepted",
  dorm_room: 305,
  is_reenrolled: false,
  onboarding_completed_at: "2026-03-02T01:12:00.000Z",
  status_updated_at: "2026-03-03T08:40:00.000Z",
  created_at: "2026-03-01T09:00:00.000Z",
  updated_at: null,
}

export const mockTeacherProfile: MyProfile = {
  ...mockProfile,
  name: "박선생",
  type: "teacher",
  student_number: null,
  class_no: null,
  cohort: null,
  track: null,
  department: null,
  dorm_room: null,
  gender: null,
  birthday: "1987-05-12",
  contact_email: "park.teacher@kmlaonline.kr",
  description: "국어와 글쓰기를 가르칩니다.",
}

export const mockAlumniProfile: MyProfile = {
  ...mockProfile,
  name: "이민족",
  type: "alumni",
  student_number: "201000",
  class_no: null,
  cohort: 25,
  track: "domestic",
  department: null,
  dorm_room: null,
  gender: "male",
  birthday: "2004-09-18",
  description: "KMLA 25기 졸업생입니다.",
}

export const mockAdminProfile: MyProfile = {
  ...mockProfile,
  name: "최관리",
  role: "admin",
  description: "KMLA Online을 관리합니다.",
}

export function mockProfileForPreview(preview: string | null): MyProfile {
  switch (preview) {
    case "teacher":
      return mockTeacherProfile
    case "alumni":
      return mockAlumniProfile
    case "admin":
      return mockAdminProfile
    default:
      return mockProfile
  }
}

export const mockProfileEmail = "minjok.kim@kmlaonline.kr"

export const mockProfileAvatarUrl: string | null = null
export const mockProfileCoverUrl: string | null = null

export const mockProfileDepartments: { name: string }[] = [
  { name: "과학기술부" },
  { name: "금융정보부" },
  { name: "도서부" },
  { name: "동아리관리부" },
  { name: "문화기획부" },
  { name: "방송부" },
  { name: "법무부" },
  { name: "식품영양부" },
  { name: "영어상용부" },
  { name: "체육부" },
  { name: "학습부" },
  { name: "환경부" },
]
