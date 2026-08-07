import { useSyncExternalStore } from "react"

const REFRESH_INTERVAL_MS = 60_000

// 상대 시각과 24시간 알림 경계가 공유하는 브라우저 시계. 구독자가 몇 개든 타이머는 하나다.
const listeners = new Set<() => void>()
let clientNow: number | null = null
let intervalId: ReturnType<typeof setInterval> | null = null

function subscribe(listener: () => void) {
  listeners.add(listener)

  if (intervalId === null) {
    clientNow = Date.now()
    intervalId = setInterval(() => {
      clientNow = Date.now()
      for (const subscriber of listeners) subscriber()
    }, REFRESH_INTERVAL_MS)
  }

  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && intervalId !== null) {
      clearInterval(intervalId)
      intervalId = null
    }
  }
}

const getClientSnapshot = () => clientNow
const getServerSnapshot = () => null

export function useClientNow() {
  return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot)
}
