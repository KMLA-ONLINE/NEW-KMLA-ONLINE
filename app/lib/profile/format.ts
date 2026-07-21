import { GENDER_LABEL, TRACK_LABEL, type MyProfile } from "~/lib/profile/types"

/** 아바타 폴백. 한글 이름은 성 한 글자가 관례라 앞 한 글자만 쓴다. */
export function profileInitials(name: string): string {
  return name.trim().charAt(0) || "?"
}

/**
 * `profiles_phone_number_check`가 숫자(+ 선택적 `+`)만 받으므로 DB에는 하이픈 없이 저장된다.
 * 화면에서만 다시 끊어 읽는다. 국내 휴대폰 모양이 아니면 손대지 않는다 -- 아는 척하다 틀린
 * 자리에서 끊는 것보다 그대로 보여주는 편이 낫다.
 */
export function formatPhoneNumber(value: string): string {
  const digits = value.replace(/\D/g, "")
  if (digits.length === 11 && digits.startsWith("01")) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
  }
  if (digits.length === 10 && digits.startsWith("01")) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
  }
  return value
}

/** `date` 컬럼이라 시각도 시간대도 없다. `new Date()`에 태우면 UTC 자정으로 읽혀 하루가 밀린다. */
export function formatBirthday(value: string): string {
  const [year, month, day] = value.split("-")
  if (!year || !month || !day) return value
  return `${year}년 ${Number(month)}월 ${Number(day)}일`
}

/** 이름 옆 한 줄. 학생이면 "30기 · 국제반 1반", 선생님·졸업생이면 비어 있을 수 있다. */
export function formatAffiliation(profile: MyProfile): string {
  const parts: string[] = []
  if (profile.cohort !== null) parts.push(`${profile.cohort}기`)
  if (profile.track !== null) parts.push(TRACK_LABEL[profile.track])
  if (profile.class_no !== null) parts.push(`${profile.class_no}반`)
  return parts.join(" · ")
}

/** 정보 카드의 값 한 칸. 비어 있으면 null을 주고, 렌더러가 "-"를 그린다. */
export function formatProfileValue(
  profile: MyProfile,
  field:
    | "student_number"
    | "cohort"
    | "class_no"
    | "track"
    | "department"
    | "dorm_room"
    | "gender"
    | "birthday"
    | "phone_number"
): string | null {
  switch (field) {
    case "student_number":
      return profile.student_number
    case "cohort":
      return profile.cohort === null ? null : `${profile.cohort}기`
    case "class_no":
      return profile.class_no === null ? null : `${profile.class_no}반`
    case "track":
      return profile.track === null ? null : TRACK_LABEL[profile.track]
    case "department":
      return profile.department
    case "dorm_room":
      return profile.dorm_room === null ? null : `${profile.dorm_room}호`
    case "gender":
      return profile.gender === null ? null : GENDER_LABEL[profile.gender]
    case "birthday":
      return profile.birthday === null ? null : formatBirthday(profile.birthday)
    case "phone_number":
      return profile.phone_number === null ? null : formatPhoneNumber(profile.phone_number)
  }
}
