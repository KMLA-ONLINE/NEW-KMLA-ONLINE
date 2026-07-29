import type { GroupPostReportReason } from "~/lib/group/types"

export const REPORT_CASE_PAGE_SIZE = 20
export const REPORT_DETAIL_PAGE_SIZE = 10

export const POST_REPORT_REASON_LABEL: Record<GroupPostReportReason, string> = {
  spam: "스팸 또는 광고",
  harassment: "괴롭힘 또는 모욕",
  privacy: "개인정보 노출",
  harmful: "위험하거나 유해한 내용",
  other: "기타",
}

export const POST_REPORT_REASONS = Object.entries(POST_REPORT_REASON_LABEL) as [
  GroupPostReportReason,
  string,
][]

export function formatReportCount(count: number) {
  return count > 99 ? "99+" : String(count)
}
