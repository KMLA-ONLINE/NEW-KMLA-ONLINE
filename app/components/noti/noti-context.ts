import { createContext, useContext } from "react"

import type { AppNotification } from "~/lib/noti/types"

export type NotiContextValue = {
  notifications: AppNotification[]
  /** read_at is null인 알림 수. 내비 뱃지가 이걸 쓴다(= get_unread_notification_count()). */
  unreadCount: number
  markRead: (id: number) => void
  markAllRead: () => void
}

export const NotiContext = createContext<NotiContextValue | null>(null)

export function useNoti() {
  const value = useContext(NotiContext)
  if (value === null) throw new Error("useNoti는 NotiProvider 안에서만 쓸 수 있다")
  return value
}
