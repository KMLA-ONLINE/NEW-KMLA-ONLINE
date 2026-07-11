import { useSyncExternalStore } from "react"

import { formatAbsoluteTime, formatRelativeTime } from "~/lib/time"

const REFRESH_INTERVAL_MS = 60_000

/**
 * The wall clock, as an external store: one timer for the whole page no matter
 * how many timestamps are on it, and `null` until the browser takes over.
 */
const listeners = new Set<() => void>()
let clientNow: number | null = null
let intervalId: ReturnType<typeof setInterval> | null = null

function subscribeToClock(listener: () => void) {
  listeners.add(listener)

  if (intervalId === null) {
    clientNow = Date.now()
    intervalId = setInterval(() => {
      clientNow = Date.now()
      for (const subscriber of listeners) {
        subscriber()
      }
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

const getClientNow = () => clientNow
const getServerNow = () => null

/**
 * Renders an ISO timestamp as "3분전", and keeps it honest as the minute rolls
 * over.
 *
 * "How long ago" is unanswerable on the server: it renders against its own
 * clock, minutes before a browser with its own clock hydrates it, and a
 * timestamp that straddles a bucket boundary would hydrate into a mismatch. So
 * the server renders the absolute date instead -- which is also what a reader
 * without JavaScript gets -- and useSyncExternalStore swaps in the relative form
 * once there is a browser clock to trust.
 */
export function RelativeTime({ value, className }: { value: string; className?: string }) {
  const now = useSyncExternalStore(subscribeToClock, getClientNow, getServerNow)
  const absoluteTime = formatAbsoluteTime(value)

  return (
    <time dateTime={value} title={absoluteTime} className={className}>
      {now === null ? absoluteTime : formatRelativeTime(value, now)}
    </time>
  )
}
