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
    <div className={cn("flex flex-nowrap items-center gap-1 overflow-x-auto", className)}>
      {reactionTypes.map((reactionType) => (
        <button
          key={reactionType.id}
          type="button"
          className="bg-background hover:bg-muted flex size-10 shrink-0 items-center justify-center rounded-full text-lg transition-colors"
          aria-label={`${reactionType.name} 반응 남기기`}
          onClick={() => onSelect(reactionType)}
        >
          <span aria-hidden="true">{getReactionGlyph(reactionType)}</span>
        </button>
      ))}
    </div>
  )
}
