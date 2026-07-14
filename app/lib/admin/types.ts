/** public.list_pending_profiles 한 행. 승인을 기다리는 가입 신청 하나. */
export type PendingProfile = {
  /** profiles.id. review_profiles(p_profile_ids[])에 그대로 실린다. */
  id: number
  /** profiles.name */
  name: string
  /** profiles.type */
  type: "student" | "teacher" | "alumni"
  /**
   * profiles.student_number (6자리). 학생만 채워진다.
   * 심사자가 학교 명부와 대조하는 값이라 이 화면에서 가장 중요한 한 줄이다.
   */
  studentNumber: string | null
  /** profiles.class_no */
  classNo: number | null
  /** profiles.cohort (기수) */
  cohort: number | null
  /** profiles.gender */
  gender: "male" | "female" | null
  /** profiles.track. 국내반/국제반. 학생만 채워진다(profiles_track_required_check). */
  track: "domestic" | "international" | null
  /** profiles.department. profile_departments FK. */
  department: string | null
  /** profiles.is_reenrolled. 재입학이면 명부의 기수와 학번이 어긋날 수 있다. */
  isReenrolled: boolean
  /** profiles.phone_number */
  phoneNumber: string | null
  /** profiles.birthday (ISO date) */
  birthday: string | null
  /** profiles.dorm_room */
  dormRoom: number | null
  /** profiles.description (자기소개) */
  description: string | null
  /** profiles.avatar_url 기반 서명 URL(로더가 채움). null이면 이니셜 폴백. */
  avatarUrl: string | null
  /** profiles.onboarding_completed_at (ISO 8601). 큐의 정렬 키 -- 오래된 신청이 위로 온다. */
  submittedAt: string
}

export const PROFILE_TYPE_LABEL: Record<PendingProfile["type"], string> = {
  student: "학생",
  teacher: "교사",
  alumni: "졸업생",
}

export const TRACK_LABEL: Record<"domestic" | "international", string> = {
  domestic: "국내반",
  international: "국제반",
}
