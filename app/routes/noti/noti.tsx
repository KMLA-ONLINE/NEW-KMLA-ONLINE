import { BellIcon } from "lucide-react"
import { useState } from "react"

import { NotificationItem } from "~/components/noti/notification-item"
import { useNoti } from "~/components/noti/noti-context"
import { Button } from "~/components/ui/button"
import { Separator } from "~/components/ui/separator"
import { useClientNow } from "~/hooks/use-client-now"

const INITIAL_OLDER_COUNT = 3
const OLDER_PAGE_SIZE = 15
const DAY_MS = 24 * 60 * 60 * 1000

export const handle = { mobileContentEdge: "bleed" as const }

export default function NotiPage() {
  const { notifications, unreadCount, markRead } = useNoti()
  const [visibleOlderCount, setVisibleOlderCount] = useState(INITIAL_OLDER_COUNT)
  const now = useClientNow()

  const cutoff = now === null ? Number.NEGATIVE_INFINITY : now - DAY_MS
  const recent = notifications.filter((item) => new Date(item.createdAt).getTime() >= cutoff)
  const older = notifications.filter((item) => new Date(item.createdAt).getTime() < cutoff)
  const visibleOlder = older.slice(0, visibleOlderCount)
  const hasMoreOlder = visibleOlderCount < older.length

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <section className="flex flex-col gap-1 px-4 pt-4 sm:px-0 sm:pt-0">
        <h1 className="text-2xl font-semibold">알림</h1>
        <p className="text-muted-foreground text-sm">
          {unreadCount > 0
            ? `최근 24시간 안 읽은 알림 ${unreadCount}건`
            : "최근 24시간 알림을 모두 확인했습니다"}
        </p>
      </section>

      {notifications.length > 0 ? (
        <div className="bg-card border-t p-2 sm:rounded-2xl sm:border">
          {recent.length > 0 ? (
            <section aria-labelledby="recent-notifications-heading">
              <h2
                id="recent-notifications-heading"
                className="text-muted-foreground px-3 py-2 text-xs font-semibold"
              >
                최근 24시간
              </h2>
              <ul className="flex flex-col gap-1">
                {recent.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onRead={markRead}
                  />
                ))}
              </ul>
            </section>
          ) : null}

          {recent.length > 0 && visibleOlder.length > 0 ? <Separator className="my-2" /> : null}

          {visibleOlder.length > 0 ? (
            <section aria-labelledby="older-notifications-heading">
              <h2
                id="older-notifications-heading"
                className="text-muted-foreground px-3 py-2 text-xs font-semibold"
              >
                이전 알림
              </h2>
              <ul className="flex flex-col gap-1">
                {visibleOlder.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onRead={markRead}
                  />
                ))}
              </ul>
              {hasMoreOlder ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="mx-auto mt-2 flex rounded-lg"
                  onClick={() => setVisibleOlderCount((count) => count + OLDER_PAGE_SIZE)}
                >
                  이전 알림 더 보기
                </Button>
              ) : null}
            </section>
          ) : null}
        </div>
      ) : (
        <section className="text-muted-foreground bg-card flex flex-col items-center gap-3 border-y px-6 py-16 text-center sm:rounded-2xl sm:border">
          <BellIcon className="size-8" strokeWidth={1.5} />
          <p className="text-sm">아직 알림이 없습니다.</p>
        </section>
      )}
    </div>
  )
}
