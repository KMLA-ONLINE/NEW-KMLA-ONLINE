import { useState } from "react"
import {
  ArrowLeftIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ImageIcon,
  PanelRightCloseIcon,
  SearchIcon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react"

import { Avatar, AvatarFallback } from "~/components/ui/avatar"
import { Button } from "~/components/ui/button"
import { getRoomSubtitle, isImageAttachment } from "~/lib/messenger/utils"
import { cn } from "~/lib/utils"
import type { Room } from "~/lib/messenger/types"

const MEMBERS_PREVIEW_COUNT = 4

export function DetailPane({
  room,
  compact = false,
  onBack,
  onClose,
  onInviteMembers,
  onOpenMedia,
  onOpenSearch,
}: {
  room: Room
  compact?: boolean
  onBack?: () => void
  onClose?: () => void
  onInviteMembers?: () => void
  onOpenMedia?: () => void
  onOpenSearch?: () => void
}) {
  const [showAllMembers, setShowAllMembers] = useState(false)
  const mediaCount = room.messages.reduce(
    (total, message) =>
      total +
      (message.attachments?.filter((attachment) => isImageAttachment(attachment)).length ?? 0),
    0
  )
  const hasMoreMembers = room.participants.length > MEMBERS_PREVIEW_COUNT
  const visibleParticipants =
    showAllMembers || !hasMoreMembers
      ? room.participants
      : room.participants.slice(0, MEMBERS_PREVIEW_COUNT)

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
            <span>멤버</span>
            <span className="text-muted-foreground ml-auto text-xs font-normal">
              {room.participants.length}
            </span>
          </div>
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
            {visibleParticipants.map((participant) => (
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
          {hasMoreMembers ? (
            <button
              type="button"
              onClick={() => setShowAllMembers((previous) => !previous)}
              className="text-muted-foreground hover:bg-muted/60 flex items-center justify-center gap-1 rounded-2xl py-2 text-xs font-medium transition-colors"
            >
              {showAllMembers
                ? "접기"
                : `${room.participants.length - MEMBERS_PREVIEW_COUNT}명 더 보기`}
              <ChevronDownIcon
                className={cn("size-4 transition-transform", showAllMembers && "rotate-180")}
                aria-hidden="true"
              />
            </button>
          ) : null}
        </section>

        <section className="flex flex-col gap-1">
          <button
            type="button"
            onClick={onOpenSearch}
            className="hover:bg-muted/60 flex w-full items-center justify-between gap-3 rounded-2xl p-2 text-left transition-colors"
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
            className="hover:bg-muted/60 flex w-full items-center justify-between gap-3 rounded-2xl p-2 text-left transition-colors"
          >
            <span className="flex items-center gap-2 text-sm font-semibold">
              <ImageIcon className="text-muted-foreground size-4" aria-hidden="true" />
              공유된 미디어
            </span>
            <span className="text-muted-foreground flex items-center gap-1 text-xs">
              {mediaCount}
              <ChevronRightIcon className="size-4" aria-hidden="true" />
            </span>
          </button>
        </section>
      </div>
    </aside>
  )
}
