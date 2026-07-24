import type { Database } from "~/lib/supabase/database.types"

/** public.list_pending_profiles 한 행. 승인을 기다리는 가입 신청 하나. */
export type PendingProfile = {
  id: number
  name: string
  type: Database["public"]["Enums"]["profile_type"]
  /** 심사자가 학교 명부와 대조하는 값이라 이 화면에서 가장 중요한 한 줄이다. 학생만 채워진다. */
  studentNumber: string | null
  classNo: number | null
  /** 기수. */
  cohort: number | null
  gender: Database["public"]["Enums"]["profile_gender"] | null
  /** 국내반/국제반. 학생만 채워진다(profiles_track_required_check). */
  track: Database["public"]["Enums"]["profile_track"] | null
  department: string | null
  /** 재입학이면 명부의 기수와 학번이 어긋날 수 있다 -- 심사자가 알아야 대조에 실패하지 않는다. */
  isReenrolled: boolean
  phoneNumber: string | null
  birthday: string | null
  dormRoom: number | null
  description: string | null
  /** avatars 버킷이 private이라 서명 URL이어야 한다(로더가 채움). null이면 공통 사용자 SVG 폴백. */
  avatarUrl: string | null
  /** onboarding_completed_at. **큐의 정렬 키** -- 오래된 신청이 위로 온다. */
  submittedAt: string
}

/**
 * 앱 관리자 한 명, 또는 관리자로 세울 수 있는 후보 한 명. 둘 다 profiles의 accepted 행이라
 * 모양이 같다 -- 가르는 건 role뿐이다(app_role: 'user' | 'admin').
 *
 * 이 목록은 RPC가 아니라 profiles 직접 select다. 승인 큐(pending)와 달리 accepted 행은
 * profiles_select가 이미 모두에게 열어두고 있어서 창을 따로 낼 이유가 없다.
 */
export type AppAdminProfile = {
  id: number
  name: string
  type: PendingProfile["type"]
  /** 기수. **동명이인을 가르는 값이라** 확인 모달까지 따라간다 -- profiles.name엔 유니크 제약이 없다. */
  cohort: number | null
  department: string | null
  /** avatars 버킷이 private이라 서명 URL이어야 한다(로더가 채움). null이면 공통 사용자 SVG 폴백. */
  avatarUrl: string | null
  isMe?: boolean
}

export const PROFILE_TYPE_LABEL: Record<PendingProfile["type"], string> = {
  student: "학생",
  teacher: "교사",
  alumni: "졸업생",
}

export const TRACK_LABEL: Record<Database["public"]["Enums"]["profile_track"], string> = {
  domestic: "국내반",
  international: "국제반",
}
