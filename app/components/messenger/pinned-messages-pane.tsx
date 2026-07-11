import { ArrowLeftIcon, PinIcon, PinOffIcon } from "lucide-react"

import { Avatar, AvatarFallback } from "~/components/ui/avatar"
import { Button } from "~/components/ui/button"
import {
  formatMessageTime,
  getMessageAuthor,
  getPinnedMessages,
  getReplyText,
} from "~/lib/messenger/utils"
import { cn } from "~/lib/utils"
import type { Message, Room } from "~/lib/messenger/types"

export function PinnedMessagesPane({
  room,
  compact = false,
  onBack,
  onOpenMessage,
  onUnpinMessage,
}: {
  room: Room
  compact?: boolean
  onBack: () => void
  onOpenMessage: (messageId: string) => void
  onUnpinMessage: (message: Message) => void
}) {
  const pinnedMessages = getPinnedMessages(room)

  const renderPinned = (message: Message) => {
    const author = getMessageAuthor(room, message)

    return (
      <div
        key={message.id}
        className="hover:bg-muted/60 flex items-start gap-1 rounded-2xl p-1 pr-2 transition-colors"
      >
        <button
          type="button"
          onClick={() => onOpenMessage(message.id)}
          className="flex min-w-0 flex-1 items-start gap-3 rounded-xl p-1 text-left"
        >
          <Avatar size="sm">
            <AvatarFallback>{author.initials}</AvatarFallback>
          </Avatar>
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-medium">{author.name}</span>
              <span className="text-muted-foreground shrink-0 text-xs">
                {formatMessageTime(message.createdAt)}
              </span>
            </span>
            <span className="text-muted-foreground mt-0.5 text-sm">{getReplyText(message)}</span>
          </span>
        </button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="고정 해제"
          className="mt-1 shrink-0"
          onClick={() => onUnpinMessage(message)}
        >
          <PinOffIcon className="size-4" />
        </Button>
      </div>
    )
  }

  return (
    <aside
      className={cn(
        "bg-card flex h-full min-h-0 min-w-0 flex-col overflow-hidden",
        !compact && "border-l"
      )}
    >
      <header className="flex shrink-0 items-center gap-2 border-b px-4 py-3">
        <Button variant="ghost" size="icon-sm" aria-label="정보로 돌아가기" onClick={onBack}>
          <ArrowLeftIcon />
        </Button>
        <p className="min-w-0 truncate text-sm font-semibold">
          고정된 메시지 {pinnedMessages.length}
        </p>
      </header>

      <div className="messenger-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {pinnedMessages.length > 0 ? (
          <div className="flex flex-col gap-1">{pinnedMessages.map(renderPinned)}</div>
        ) : (
          <div className="text-muted-foreground flex h-full items-center justify-center rounded-2xl border border-dashed p-8 text-center text-sm">
            <span className="flex flex-col items-center gap-2">
              <PinIcon className="size-6" aria-hidden="true" />
              고정된 메시지가 없습니다.
            </span>
          </div>
        )}
      </div>
    </aside>
  )
}
