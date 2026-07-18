import { Twemoji } from "~/components/ui/twemoji"
import { getReactionGlyph, type ReactionType } from "~/lib/reactions"
import { cn } from "~/lib/utils"

export function QuickReactionList({
  reactionTypes,
  onSelect,
  className,
}: {
  reactionTypes: ReactionType[]
  onSelect: (reactionType: ReactionType) => void
  className?: string
}) {
  return (
    <div className={cn("flex flex-nowrap items-center gap-1", className)}>
      {reactionTypes.map((reactionType) => (
        <button
          key={reactionType.id}
          type="button"
          className="flex size-10 shrink-0 origin-bottom items-center justify-center rounded-full text-2xl transition-[transform,background-color] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:-translate-y-0.5 hover:scale-125 focus-visible:-translate-y-1.5 focus-visible:scale-125 focus-visible:outline-none"
          aria-label={`${reactionType.name} 반응 남기기`}
          onClick={() => onSelect(reactionType)}
        >
          <Twemoji text={getReactionGlyph(reactionType)} aria-hidden="true" />
        </button>
      ))}
    </div>
  )
}
