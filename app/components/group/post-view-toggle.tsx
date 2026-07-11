import { GalleryVerticalIcon, ListIcon } from "lucide-react"

import type { PostViewMode } from "~/components/group/use-post-view-mode"
import { Button } from "~/components/ui/button"
import { cn } from "~/lib/utils"

const OPTIONS = [
  { value: "card", label: "카드", icon: GalleryVerticalIcon },
  { value: "list", label: "목록", icon: ListIcon },
] as const satisfies ReadonlyArray<{
  value: PostViewMode
  label: string
  icon: typeof ListIcon
}>

type PostViewToggleProps = {
  value: PostViewMode
  onChange: (mode: PostViewMode) => void
  className?: string
}

export function PostViewToggle({ value, onChange, className }: PostViewToggleProps) {
  return (
    <div
      role="group"
      aria-label="게시물 보기 방식"
      className={cn("bg-muted inline-flex items-center gap-0.5 rounded-md p-0.5", className)}
    >
      {OPTIONS.map(({ value: option, label, icon: Icon }) => {
        const active = value === option
        return (
          <Button
            key={option}
            type="button"
            size="sm"
            variant="ghost"
            aria-pressed={active}
            onClick={() => onChange(option)}
            className={cn(
              active
                ? "bg-background text-foreground hover:bg-background shadow-sm"
                : "text-muted-foreground"
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">{label}</span>
          </Button>
        )
      })}
    </div>
  )
}
