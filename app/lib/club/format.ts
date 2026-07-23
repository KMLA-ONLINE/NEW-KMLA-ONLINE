import type {
  ClubApplicationStatus,
  ClubDivision,
  ClubManagerRole,
  ClubRecruitmentStatus,
} from "~/lib/club/types"

export const clubDivisionLabel: Record<ClubDivision, string> = {
  sudo: "수동",
  mokdong: "목동",
}

export const clubManagerRoleLabel: Record<ClubManagerRole, string> = {
  owner: "대표 관리자",
  admin: "관리자",
  editor: "공고 편집자",
}

export const recruitmentStatusLabel: Record<ClubRecruitmentStatus, string> = {
  upcoming: "모집 예정",
  open: "모집 중",
  reviewing: "심사 중",
  announced: "결과 발표",
  closed: "모집 종료",
}

export const applicationStatusLabel: Record<ClubApplicationStatus, string> = {
  submitted: "지원 완료",
  reviewing: "심사 중",
  accepted: "합격",
  rejected: "불합격",
  withdrawn: "지원 취소",
}

const shortDateFormatter = new Intl.DateTimeFormat("ko-KR", {
  month: "numeric",
  day: "numeric",
})

const dateTimeFormatter = new Intl.DateTimeFormat("ko-KR", {
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
})

export function formatShortDate(value: string) {
  return shortDateFormatter.format(new Date(value))
}

export function formatDateTime(value: string) {
  return dateTimeFormatter.format(new Date(value))
}

export function formatRecruitmentPeriod(startsAt: string, endsAt: string) {
  return `${formatShortDate(startsAt)} ~ ${formatDateTime(endsAt)}`
}
