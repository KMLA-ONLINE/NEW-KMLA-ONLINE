import { ChevronRightIcon } from "lucide-react"
import { Link } from "react-router"

import { Twemoji } from "~/components/ui/twemoji"
import { withClubPreview, type ClubPreviewRole } from "~/lib/club/access"
import { clubTypeLabel } from "~/lib/club/format"
import type { Club } from "~/lib/club/types"

export function ClubCard({
  club,
  previewRole = null,
}: {
  club: Club
  previewRole?: ClubPreviewRole
}) {
  return (
    <Link
      to={withClubPreview(`/clubs/${club.slug}`, previewRole)}
      className="group focus-visible:ring-ring hover:bg-muted/50 flex min-w-0 items-center gap-4 rounded-lg px-2 py-4 transition-colors outline-none focus-visible:ring-2"
    >
      <div className="bg-muted grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg sm:size-14">
        {club.imageUrl ? (
          <img
            src={club.imageUrl}
            alt=""
            className="size-full object-cover transition-transform duration-200 group-hover:scale-105"
          />
        ) : (
          <span className="text-xl sm:text-2xl">
            <Twemoji text={club.emoji} />
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="truncate text-sm font-semibold sm:text-base">{club.name}</h2>

          {club.recruitment?.isOpen ? (
            <span className="bg-primary/10 text-primary shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold sm:hidden">
              지원 가능
            </span>
          ) : null}
        </div>

        <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span>{clubTypeLabel[club.type]}</span>
          <span aria-hidden>·</span>
          <span>{club.meeting}</span>
          <span className="hidden sm:inline" aria-hidden>
            ·
          </span>
          <span className="hidden sm:inline">{club.location}</span>
        </div>

        <p className="text-muted-foreground mt-1.5 line-clamp-2 text-xs leading-5 sm:text-sm">
          {club.cardDescription}
        </p>
      </div>

      <div className="hidden shrink-0 items-center gap-3 sm:flex">
        {club.recruitment ? (
          <span
            className={
              club.recruitment.isOpen
                ? "bg-primary/10 text-primary rounded-full px-2.5 py-1 text-xs font-semibold"
                : "bg-muted text-muted-foreground rounded-full px-2.5 py-1 text-xs font-medium"
            }
          >
            {club.recruitment.isOpen ? "지원 가능" : "모집 마감"}
          </span>
        ) : null}

        <ChevronRightIcon
          className="text-muted-foreground size-4 transition-transform group-hover:translate-x-0.5"
          aria-hidden
        />
      </div>

      <ChevronRightIcon
        className="text-muted-foreground size-4 shrink-0 transition-transform group-hover:translate-x-0.5 sm:hidden"
        aria-hidden
      />
    </Link>
  )
}
