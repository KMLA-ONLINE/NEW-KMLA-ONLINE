import { Link } from "react-router"

import { Twemoji } from "~/components/ui/twemoji"
import { clubTypeLabel } from "~/lib/club/format"
import type { Club } from "~/lib/club/types"

export function ClubCard({ club }: { club: Club }) {
  return (
    <Link to={`/clubs/${club.slug}`} className="group block min-w-0 outline-none">
      <div className="bg-muted group-focus-visible:ring-ring aspect-square overflow-hidden rounded-xl group-focus-visible:ring-2">
        {club.imageUrl ? (
          <img
            src={club.imageUrl}
            alt=""
            className="size-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="grid size-full place-items-center text-2xl sm:text-3xl">
            <Twemoji text={club.emoji} />
          </div>
        )}
      </div>

      <div className="mt-2 min-w-0">
        <h2 className="truncate text-sm font-semibold sm:text-base">{club.name}</h2>
        <p className="text-muted-foreground mt-0.5 truncate text-xs">
          {clubTypeLabel[club.type]}
          {club.recruitment?.isOpen ? <span className="text-primary"> · 지원 가능</span> : null}
        </p>
        <p className="text-muted-foreground mt-1 line-clamp-2 text-xs leading-5 sm:text-sm">
          {club.cardDescription}
        </p>
      </div>
    </Link>
  )
}
