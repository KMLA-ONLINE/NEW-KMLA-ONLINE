import { BellOffIcon, SearchIcon } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router"

import { ConversationAvatar } from "~/components/messenger/conversation-avatar"
import { Badge } from "~/components/ui/badge"
import { Input } from "~/components/ui/input"
import { Twemoji } from "~/components/ui/twemoji"
import { useInfiniteScroll } from "~/hooks/use-infinite-scroll"
import { getMessagePreview, formatRoomTime } from "~/lib/messenger/utils"
import { cn } from "~/lib/utils"
import type { ConversationId, RoomSummary } from "~/lib/messenger/types"

const ROOM_PAGE_SIZE = 15

export function ChatListPane({
  rooms,
  selectedRoomId,
  searchValue,
  getRoomHref,
  onSearchChange,
  onSelectRoom,
}: {
  rooms: RoomSummary[]
  selectedRoomId: ConversationId | null
  searchValue: string
  getRoomHref: (roomId: ConversationId) => string
  onSearchChange: (value: string) => void
  onSelectRoom: (roomId: ConversationId) => void
}) {
  const [visibleCount, setVisibleCount] = useState(ROOM_PAGE_SIZE)
  const shownRooms = rooms.slice(0, visibleCount)
  const hasMore = visibleCount < rooms.length
  const sentinelRef = useInfiniteScroll(
    () => setVisibleCount((count) => count + ROOM_PAGE_SIZE),
    hasMore
  )

  return (
    <section className="bg-card flex h-full min-h-0 flex-col overflow-hidden md:border-r">
      <div className="shrink-0 space-y-3 px-4 py-4 md:px-5 md:py-4">
        <div className="hidden space-y-1 md:block">
          <h1 className="text-xl font-semibold md:text-lg">채팅</h1>
        </div>
        <div className="relative">
          <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={searchValue}
            className="bg-muted h-10 rounded-full border-0 pl-11 shadow-none"
            placeholder="메신저 검색"
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-[calc(0.75rem+4rem+env(safe-area-inset-bottom))] md:p-2">
        {rooms.length > 0 ? (
          <div className="flex flex-col gap-1" aria-label="Conversation list">
            {shownRooms.map((room) => {
              const isSelected = room.id === selectedRoomId

              return (
                <Link
                  key={room.id}
                  to={getRoomHref(room.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors",
                    isSelected ? "bg-muted" : "hover:bg-muted/70"
                  )}
                  onClick={() => onSelectRoom(room.id)}
                >
                  <ConversationAvatar room={room} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold">{room.name}</span>
                      {room.muted ? (
                        <Badge
                          variant="secondary"
                          className="size-5 shrink-0 rounded-full bg-transparent p-0"
                        >
                          <BellOffIcon className="size-3" aria-label="알림 꺼짐" />
                        </Badge>
                      ) : null}
                    </span>
                    <span className="text-muted-foreground mt-0.5 block truncate text-xs">
                      <Twemoji text={getMessagePreview(room.lastMessage)} />
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-2">
                    <span className="text-muted-foreground text-xs">
                      {formatRoomTime(room.lastMessageAt)}
                    </span>
                    <span className="flex h-5 items-center">
                      {room.unreadCount ? <Badge>{room.unreadCount}</Badge> : null}
                    </span>
                  </span>
                </Link>
              )
            })}
            {hasMore ? (
              <div ref={sentinelRef} className="text-muted-foreground py-3 text-center text-xs">
                불러오는 중…
              </div>
            ) : null}
          </div>
        ) : (
          <div className="text-muted-foreground flex h-full items-center justify-center rounded-2xl border border-dashed p-8 text-center text-sm">
            일치하는 방이 없습니다.
          </div>
        )}
      </div>
    </section>
  )
}
