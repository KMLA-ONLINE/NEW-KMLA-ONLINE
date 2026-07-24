import { ArrowLeftRightIcon } from "lucide-react"

import { AnonymousAvatar } from "~/components/profile/profile-avatar"
import { GroupStaffAvatar } from "~/components/group/group-staff-avatar"
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip"
import { cn } from "~/lib/utils"

export function GroupStaffAttributionToggle({
  staff,
  onToggle,
  size,
  className,
}: {
  staff: boolean
  onToggle: () => void
  size?: "lg"
  className?: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={staff}
          aria-label={
            staff
              ? "운영진으로 작성 중. 눌러서 일반 익명으로"
              : "일반 익명으로 작성 중. 눌러서 운영진으로"
          }
          className={cn(
            "focus-visible:ring-ring relative shrink-0 rounded-full focus-visible:ring-2 focus-visible:outline-none",
            className
          )}
        >
          {staff ? <GroupStaffAvatar size={size} /> : <AnonymousAvatar size={size} />}
          <span className="bg-background text-muted-foreground absolute -right-0.5 -bottom-0.5 flex rounded-full border p-0.5">
            <ArrowLeftRightIcon className="size-2.5" aria-hidden="true" />
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent>{staff ? "운영진으로 작성 중" : "일반 익명으로 작성 중"}</TooltipContent>
    </Tooltip>
  )
}
