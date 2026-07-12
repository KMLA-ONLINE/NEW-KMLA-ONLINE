import { BellIcon, CheckCheckIcon } from "lucide-react"
import { useState, type ReactNode } from "react"

import { NotificationItem } from "~/components/noti/notification-item"
import { useNoti } from "~/components/noti/noti-context"
import { Button } from "~/components/ui/button"
import { useInfiniteScroll } from "~/hooks/use-infinite-scroll"
import { cn } from "~/lib/utils"

// list_notifications()의 기본 limit과 같다. 바닥에 닿으면 다음 커서(before_id = 마지막 id)로
// 이어 받는다 -- 알림은 고정이 없어서 커서가 id 하나로 끝난다.
const PAGE_SIZE = 20

type Filter = "all" | "unread"

export default function NotiPage() {
  const { notifications, unreadCount, markRead, markAllRead } = useNoti()
  const [filter, setFilter] = useState<Filter>("all")
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const filtered =
    filter === "unread" ? notifications.filter((item) => item.readAt === null) : notifications
  const shown = filtered.slice(0, visibleCount)
  const hasMore = visibleCount < filtered.length
  const sentinelRef = useInfiniteScroll(
    () => setVisibleCount((count) => count + PAGE_SIZE),
    hasMore
  )

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">알림</h1>
          <p className="text-muted-foreground text-sm">
            {unreadCount > 0 ? `읽지 않은 알림 ${unreadCount}건` : "모두 확인했습니다"}
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={markAllRead}
          disabled={unreadCount === 0}
          className="gap-1.5"
        >
          <CheckCheckIcon className="size-4" />
          모두 읽음
        </Button>
      </section>

      <div className="flex w-fit rounded-xl border bg-white p-1">
        <FilterTab active={filter === "all"} onClick={() => setFilter("all")}>
          전체
        </FilterTab>
        <FilterTab active={filter === "unread"} onClick={() => setFilter("unread")}>
          안 읽음
          {unreadCount > 0 ? (
            <span className="ml-1 tabular-nums">{unreadCount > 99 ? "99+" : unreadCount}</span>
          ) : null}
        </FilterTab>
      </div>

      {shown.length > 0 ? (
        <ul className="bg-card flex flex-col gap-1 rounded-2xl border p-2">
          {shown.map((notification) => (
            <NotificationItem key={notification.id} notification={notification} onRead={markRead} />
          ))}
        </ul>
      ) : (
        <section className="text-muted-foreground bg-card flex flex-col items-center gap-3 rounded-2xl border px-6 py-16 text-center">
          <BellIcon className="size-8" strokeWidth={1.5} />
          <p className="text-sm">
            {filter === "unread" ? "읽지 않은 알림이 없습니다." : "아직 알림이 없습니다."}
          </p>
        </section>
      )}

      {hasMore ? <div ref={sentinelRef} className="h-px" aria-hidden="true" /> : null}
    </div>
  )
}

function FilterTab({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-lg px-4 py-2 text-sm font-medium",
        active ? "bg-blue-50 text-blue-600" : "text-muted-foreground"
      )}
    >
      {children}
    </button>
  )
}
