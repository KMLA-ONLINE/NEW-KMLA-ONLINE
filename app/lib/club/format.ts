import type { ClubType } from "~/lib/club/types"

export const clubTypeLabel: Record<ClubType, string> = {
  major: "수동",
  general: "목동",
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
