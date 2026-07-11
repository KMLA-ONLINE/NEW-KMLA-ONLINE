import {
  ArrowLeftIcon,
  ChevronRightIcon,
  ImageIcon,
  PanelRightCloseIcon,
  PinIcon,
  SearchIcon,
  UsersIcon,
} from "lucide-react"

import { Avatar, AvatarFallback } from "~/components/ui/avatar"
import { Button } from "~/components/ui/button"
import { getRoomSubtitle } from "~/lib/messenger/utils"
import { cn } from "~/lib/utils"
import type { Room } from "~/lib/messenger/types"

export function DetailPane({
  room,
  compact = false,
  onBack,
  onClose,
  onOpenMedia,
  onOpenMembers,
  onOpenPinnedMessages,
  onOpenSearch,
}: {
  room: Room
  compact?: boolean
  onBack?: () => void
  onClose?: () => void
  onOpenMedia?: () => void
  onOpenMembers?: () => void
  onOpenPinnedMessages?: () => void
  onOpenSearch?: () => void
}) {
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

        <section className="flex flex-col gap-1">
          <button
            type="button"
            onClick={onOpenMembers}
            className="hover:bg-muted/60 flex w-full items-center justify-between gap-3 rounded-2xl p-2.5 text-left transition-colors"
          >
            <span className="flex items-center gap-2 text-sm font-semibold">
              <UsersIcon className="text-muted-foreground size-4" aria-hidden="true" />
              멤버
            </span>
            <ChevronRightIcon className="text-muted-foreground size-4" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={onOpenPinnedMessages}
            className="hover:bg-muted/60 flex w-full items-center justify-between gap-3 rounded-2xl p-2.5 text-left transition-colors"
          >
            <span className="flex items-center gap-2 text-sm font-semibold">
              <PinIcon className="text-muted-foreground size-4" aria-hidden="true" />
              고정된 메시지
            </span>
            <ChevronRightIcon className="text-muted-foreground size-4" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={onOpenSearch}
            className="hover:bg-muted/60 flex w-full items-center justify-between gap-3 rounded-2xl p-2.5 text-left transition-colors"
          >
            <span className="flex items-center gap-2 text-sm font-semibold">
              <SearchIcon className="text-muted-foreground size-4" aria-hidden="true" />
              메시지 검색
            </span>
            <ChevronRightIcon className="text-muted-foreground size-4" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={onOpenMedia}
            className="hover:bg-muted/60 flex w-full items-center justify-between gap-3 rounded-2xl p-2.5 text-left transition-colors"
          >
            <span className="flex items-center gap-2 text-sm font-semibold">
              <ImageIcon className="text-muted-foreground size-4" aria-hidden="true" />
              공유된 미디어
            </span>
            <ChevronRightIcon className="text-muted-foreground size-4" aria-hidden="true" />
          </button>
        </section>
      </div>
    </aside>
  )
}
