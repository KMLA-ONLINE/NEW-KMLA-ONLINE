import { createContext, useContext } from "react"

import type { AppNotification } from "~/lib/noti/types"

export type NotiContextValue = {
  notifications: AppNotification[]
  /** 최근 24시간 안에 생성됐고 read_at이 null인 알림 수. 내비 뱃지가 이걸 쓴다. */
  unreadCount: number
  markRead: (id: number) => void
}

export const NotiContext = createContext<NotiContextValue | null>(null)

export function useNoti() {
  const value = useContext(NotiContext)
  if (value === null) throw new Error("useNoti는 NotiProvider 안에서만 쓸 수 있다")
  return value
}
