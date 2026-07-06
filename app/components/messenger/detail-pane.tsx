import { ArrowLeftIcon, ImageIcon, PanelRightCloseIcon, UsersIcon } from "lucide-react"

import { Avatar, AvatarFallback } from "~/components/ui/avatar"
import { Button } from "~/components/ui/button"
import { getRoomSubtitle, isImageAttachment } from "~/lib/messenger/utils"
import { cn } from "~/lib/utils"
import type { Room } from "~/lib/messenger/types"

export function DetailPane({
  room,
  compact = false,
  onBack,
  onClose,
}: {
  room: Room
  compact?: boolean
  onBack?: () => void
  onClose?: () => void
}) {
  const media = room.messages.flatMap((message) =>
    (message.attachments ?? []).filter((attachment) => isImageAttachment(attachment))
  )

  return (
    <aside
      className={cn("bg-card flex h-full min-h-0 flex-col overflow-hidden", !compact && "border-l")}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          {compact && onBack ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Back to conversation"
              onClick={onBack}
            >
              <ArrowLeftIcon />
            </Button>
          ) : null}
          <p className="text-sm font-semibold">{room.type === "group" ? "그룹 정보" : "정보"}</p>
        </div>
        {!compact && onClose ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close conversation info"
            onClick={onClose}
          >
            <PanelRightCloseIcon />
          </Button>
        ) : null}
      </header>

      <div className="messenger-scrollbar min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
        <section className="bg-muted/50 rounded-[1.5rem] p-5 text-center">
          <Avatar size="lg" className="mx-auto">
            <AvatarFallback>{room.initials}</AvatarFallback>
          </Avatar>
          <h2 className="mt-3 text-lg font-semibold">{room.name}</h2>
          <p className="text-muted-foreground mt-1 text-sm">{getRoomSubtitle(room)}</p>
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <UsersIcon className="text-muted-foreground size-4" aria-hidden="true" />
            <span>Members</span>
          </div>
          <div className="flex flex-col gap-1">
            {room.participants.map((participant) => (
              <div
                key={participant.id}
                className="hover:bg-muted/60 flex items-center gap-3 rounded-2xl p-2"
              >
                <Avatar size="sm">
                  <AvatarFallback>{participant.initials}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{participant.name}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">Shared media</h3>
            <span className="text-muted-foreground text-xs">{media.length} items</span>
          </div>
          {media.length > 0 ? (
            <div className="grid grid-cols-3 gap-2">
              {media.map((attachment, index) =>
                attachment.src ? (
                  <img
                    key={attachment.id ?? `${attachment.name}-${index}`}
                    src={attachment.src}
                    alt={attachment.name}
                    className="aspect-square rounded-2xl object-cover"
                  />
                ) : (
                  <div
                    key={attachment.id ?? `${attachment.name}-${index}`}
                    className="bg-muted flex aspect-square items-center justify-center rounded-2xl border"
                    aria-label={attachment.name}
                    role="img"
                  >
                    <ImageIcon className="text-primary" />
                  </div>
                )
              )}
            </div>
          ) : (
            <div className="text-muted-foreground rounded-3xl border border-dashed p-6 text-center text-sm">
              No shared media yet.
            </div>
          )}
        </section>
      </div>
    </aside>
  )
}
