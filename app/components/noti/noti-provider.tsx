import { useCallback, useMemo, useState, type ReactNode } from "react"

import { NotiContext } from "~/components/noti/noti-context"
import { useClientNow } from "~/hooks/use-client-now"
import { mockNotifications } from "~/lib/noti/mock-data"

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * 알림 상태를 앱 셸 **위**에 얹는다. 내비 뱃지(사이드바·탭바)와 /noti 페이지가 같은 상태를 봐야
 * 하기 때문이다 -- 페이지에서 "모두 읽음"을 눌렀는데 뱃지에 숫자가 그대로 남아 있으면 그냥 고장난
 * 화면이다. 그 둘은 셸 안에서 형제라 outlet context로는 닿지 않는다.
 *
 * TODO(backend): _app 로더가 list_notifications()와 get_unread_notification_count()를 내려주고,
 * 읽음 표시는 action이 `update notifications set read_at=now()`를 쏘면 된다(notifications_update
 * 정책이 행을 내 것으로 가두고 컬럼 grant가 read_at만 연다 -- RPC가 필요 없다). 그러면 리밸리데이션이
 * 뱃지까지 알아서 갱신하므로 이 provider는 사라지고, 소비자들은 useRouteLoaderData("routes/_app")
 * 한 줄이 된다.
 */
export function NotiProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState(mockNotifications)
  const now = useClientNow()

  const markRead = useCallback((id: number) => {
    setNotifications((current) =>
      current.map((item) =>
        item.id === id && item.readAt === null
          ? { ...item, readAt: new Date().toISOString() }
          : item
      )
    )
  }, [])

  const value = useMemo(
    () => ({
      notifications,
      unreadCount: notifications.filter(
        (item) =>
          item.readAt === null &&
          (now === null || new Date(item.createdAt).getTime() >= now - DAY_MS)
      ).length,
      markRead,
    }),
    [notifications, now, markRead]
  )

  return <NotiContext value={value}>{children}</NotiContext>
}
