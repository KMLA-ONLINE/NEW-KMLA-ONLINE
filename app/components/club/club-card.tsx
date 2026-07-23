import { CalendarClockIcon, ChevronRightIcon, MapPinIcon, UsersRoundIcon } from "lucide-react"
import { Link } from "react-router"

import { ApplicationStatusBadge, RecruitmentStatusBadge } from "~/components/club/club-status-badge"
import { Badge } from "~/components/ui/badge"
import { Twemoji } from "~/components/ui/twemoji"
import { clubDivisionLabel, formatRecruitmentPeriod } from "~/lib/club/format"
import type { Club } from "~/lib/club/types"

export function ClubCard({ club, adminMode }: { club: Club; adminMode: boolean }) {
  const target = adminMode ? `/clubs/${club.id}?as=admin` : `/clubs/${club.id}`

  return (
    <article className="bg-card hover:bg-muted/40 flex h-full flex-col overflow-hidden rounded-xl border transition-colors">
      <Link
        to={target}
        className="focus-visible:ring-ring flex h-full flex-col gap-4 p-4 focus-visible:ring-2 focus-visible:outline-none"
      >
        <header className="flex items-start gap-3">
          <div className="bg-muted flex size-12 shrink-0 items-center justify-center rounded-xl text-2xl">
            <Twemoji text={club.emoji} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-base font-semibold">{club.name}</h2>
              <Badge variant="secondary">{clubDivisionLabel[club.division]}</Badge>
              {club.recruitment?.kind === "early" ? <Badge variant="outline">Early</Badge> : null}
            </div>

            <p className="text-muted-foreground mt-1 line-clamp-2 text-sm leading-5">
              {club.summary}
            </p>
          </div>
        </header>

        <div className="text-muted-foreground grid gap-2 text-xs">
          <span className="flex items-center gap-2">
            <UsersRoundIcon className="size-3.5" aria-hidden />
            현재 멤버 {club.memberCount}명
          </span>
          <span className="flex items-center gap-2">
            <MapPinIcon className="size-3.5" aria-hidden />
            {club.meeting} · {club.location}
          </span>
          {club.recruitment ? (
            <span className="flex items-center gap-2">
              <CalendarClockIcon className="size-3.5" aria-hidden />
              {formatRecruitmentPeriod(club.recruitment.startsAt, club.recruitment.endsAt)}
            </span>
          ) : null}
        </div>

        <footer className="mt-auto flex items-center justify-between gap-3 border-t pt-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {club.recruitment ? (
              <RecruitmentStatusBadge status={club.recruitment.status} />
            ) : (
              <Badge variant="secondary">현재 모집 없음</Badge>
            )}
            {club.myApplication ? (
              <ApplicationStatusBadge status={club.myApplication.status} />
            ) : null}
          </div>

          <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs font-medium">
            {adminMode ? "관리" : "자세히"}
            <ChevronRightIcon className="size-3.5" aria-hidden />
          </span>
        </footer>
      </Link>
    </article>
  )
}
