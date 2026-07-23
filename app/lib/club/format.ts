import type { ClubDivision } from "~/lib/club/types"

export const clubDivisionLabel: Record<ClubDivision, string> = {
  sudo: "수동",
  mokdong: "목동",
}

const dateTimeFormatter = new Intl.DateTimeFormat("ko-KR", {
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
})

export function formatDateTime(value: string) {
  return dateTimeFormatter.format(new Date(value))
}

export function formatRecruitmentPeriod(startsAt: string, endsAt: string) {
  return `${formatDateTime(startsAt)} ~ ${formatDateTime(endsAt)}`
}
