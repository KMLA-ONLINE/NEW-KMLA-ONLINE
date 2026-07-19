import type { Database } from "~/lib/supabase/database.types"

type MyProfileRow = Database["public"]["Functions"]["get_my_profile"]["Returns"][number]

/**
 * `get_my_profile()`이 내주는 한 행.
 *
 * 생성기는 table-returning 함수의 컬럼을 전부 non-null로 뽑는다 -- 뒤에 있는 `profiles` 컬럼이
 * nullable이어도 그렇다. 그대로 쓰면 온보딩만 마치고 연락처를 비운 사람에게서 런타임에 null이
 * 튀어나오는데 타입은 조용하다. 그래서 실제로 비어 있을 수 있는 컬럼만 여기서 되돌린다 --
 * 손으로 다시 적는 게 아니라 생성된 행에서 덮어쓰므로, 컬럼이 늘면 그대로 따라온다.
 */
export type MyProfile = Omit<
  MyProfileRow,
  | "student_number"
  | "class_no"
  | "cohort"
  | "gender"
  | "track"
  | "department"
  | "phone_number"
  | "avatar_url"
  | "cover_image_url"
  | "birthday"
  | "description"
  | "dorm_room"
  | "onboarding_completed_at"
  | "status_updated_at"
  | "updated_at"
> & {
  student_number: MyProfileRow["student_number"] | null
  class_no: MyProfileRow["class_no"] | null
  cohort: MyProfileRow["cohort"] | null
  gender: MyProfileRow["gender"] | null
  track: MyProfileRow["track"] | null
  department: MyProfileRow["department"] | null
  phone_number: MyProfileRow["phone_number"] | null
  avatar_url: MyProfileRow["avatar_url"] | null
  cover_image_url: MyProfileRow["cover_image_url"] | null
  birthday: MyProfileRow["birthday"] | null
  description: MyProfileRow["description"] | null
  dorm_room: MyProfileRow["dorm_room"] | null
  onboarding_completed_at: MyProfileRow["onboarding_completed_at"] | null
  status_updated_at: MyProfileRow["status_updated_at"] | null
  updated_at: MyProfileRow["updated_at"] | null
}

/**
 * 편집 화면이 저장하는 필드. `profiles`의 update 컬럼 grant와 정확히 같은 열 개다.
 *
 * 이 타입에서 벗어난 컬럼을 폼에 얹으면 서버가 조용히 무시하는 게 아니라 요청 전체를 거절한다.
 * 빠져 있는 것 중 눈에 띄는 건 `student_number`다 -- 학번은 심사에서 신원을 대조한 값이고
 * unique라, 열어두면 남의 학번을 선점할 수 있다. `role`/`status`는 각자 RPC가 유일한 문이고,
 * `avatar_url`/`cover_image_url`은 finalize RPC만이 붙인다.
 */
export type ProfileEditableField =
  | "name"
  | "gender"
  | "phone_number"
  | "birthday"
  | "description"
  | "cohort"
  | "class_no"
  | "track"
  | "department"
  | "dorm_room"

export const GENDER_LABEL: Record<Database["public"]["Enums"]["profile_gender"], string> = {
  male: "남자",
  female: "여자",
}

export const TRACK_LABEL: Record<Database["public"]["Enums"]["profile_track"], string> = {
  domestic: "국내반",
  international: "국제반",
}

export const PROFILE_TYPE_LABEL: Record<Database["public"]["Enums"]["profile_type"], string> = {
  student: "학생",
  teacher: "선생님",
  alumni: "졸업생",
}
