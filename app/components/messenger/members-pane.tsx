import { ArrowLeftIcon, UserPlusIcon } from "lucide-react"

import { Avatar, AvatarFallback } from "~/components/ui/avatar"
import { Button } from "~/components/ui/button"
import { cn } from "~/lib/utils"
import type { Room } from "~/lib/messenger/types"

export function MembersPane({
  room,
  compact = false,
  onBack,
  onInviteMembers,
}: {
  room: Room
  compact?: boolean
  onBack: () => void
  onInviteMembers?: () => void
}) {
  return (
    <aside
      className={cn(
        "bg-card flex h-full min-h-0 min-w-0 flex-col overflow-hidden",
        !compact && "border-l"
      )}
    >
      <header className="flex shrink-0 items-center gap-2 border-b px-4 py-3">
        <Button variant="ghost" size="icon-sm" aria-label="그룹 정보로 돌아가기" onClick={onBack}>
          <ArrowLeftIcon />
        </Button>
        <p className="min-w-0 truncate text-sm font-semibold">멤버 {room.participants.length}</p>
      </header>

      <div className="messenger-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-5">
        <div className="flex flex-col">
          {room.type === "group" && onInviteMembers ? (
            <button
              type="button"
              onClick={onInviteMembers}
              className="hover:bg-muted/60 flex items-center gap-3 rounded-2xl p-2 text-left transition-colors"
            >
              <span className="bg-background flex size-8 shrink-0 items-center justify-center rounded-full border">
                <UserPlusIcon className="text-muted-foreground size-4" aria-hidden="true" />
              </span>
              <span className="truncate text-sm font-medium">멤버 초대</span>
            </button>
          ) : null}
          {room.participants.map((participant) => (
            <div
              key={participant.id}
              className="hover:bg-muted/60 flex items-center gap-3 rounded-2xl p-2"
            >
              <Avatar>
                <AvatarFallback>{participant.initials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{participant.name}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  )
}
