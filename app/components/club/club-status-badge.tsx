import { Badge } from "~/components/ui/badge"
import { applicationStatusLabel, recruitmentStatusLabel } from "~/lib/club/format"
import type { ClubApplicationStatus, ClubRecruitmentStatus } from "~/lib/club/types"

export function RecruitmentStatusBadge({ status }: { status: ClubRecruitmentStatus }) {
  const variant =
    status === "open"
      ? "default"
      : status === "announced"
        ? "teacher"
        : status === "closed"
          ? "secondary"
          : "outline"

  return <Badge variant={variant}>{recruitmentStatusLabel[status]}</Badge>
}

export function ApplicationStatusBadge({ status }: { status: ClubApplicationStatus }) {
  const variant =
    status === "accepted"
      ? "teacher"
      : status === "rejected"
        ? "destructive"
        : status === "withdrawn"
          ? "secondary"
          : "outline"

  return <Badge variant={variant}>{applicationStatusLabel[status]}</Badge>
}
