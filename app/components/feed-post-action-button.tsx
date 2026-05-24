import type { LucideIcon } from "lucide-react"

import { Button } from "~/components/ui/button"
import { cn } from "~/lib/utils"

type FeedPostActionButtonProps = {
  icon: LucideIcon
  label: string
  count?: number
  className?: string
}

export function FeedPostActionButton({
  icon: Icon,
  label,
  count,
  className,
}: FeedPostActionButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn("text-muted-foreground h-7 px-0 text-xs sm:px-2", className)}
      aria-label={count === undefined ? label : `${label} ${count}`}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      <span>{count ?? label}</span>
    </Button>
  )
}
