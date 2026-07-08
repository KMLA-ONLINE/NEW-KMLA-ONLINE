import { QUICK_REACTIONS } from "~/lib/reactions"
import { cn } from "~/lib/utils"

export function QuickReactionList({
  onSelect,
  className,
}: {
  onSelect: (reaction: string) => void
  className?: string
}) {
  return (
    <div className={cn("flex flex-nowrap items-center gap-1 overflow-x-auto", className)}>
      {QUICK_REACTIONS.map((reaction) => (
        <button
          key={reaction}
          type="button"
          className="bg-background hover:bg-muted flex size-10 shrink-0 items-center justify-center rounded-full text-lg transition-colors"
          aria-label={`React with ${reaction}`}
          onClick={() => onSelect(reaction)}
        >
          <span aria-hidden="true">{reaction}</span>
        </button>
      ))}
    </div>
  )
}
