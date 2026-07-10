const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

/**
 * A coarse "how long ago", the way a feed or a chat list wants it.
 *
 * `now` is a parameter rather than a `Date.now()` call so the caller decides
 * which clock is in play. That matters under SSR: the server and the browser
 * read different clocks moments apart, and a component that wants a stable
 * first paint has to pass the same instant to both.
 */
export function formatRelativeTime(value: string, now: number) {
  const elapsedMs = Math.max(0, now - new Date(value).getTime())

  if (elapsedMs < MINUTE_MS) {
    return "방금"
  }

  if (elapsedMs < HOUR_MS) {
    return `${Math.floor(elapsedMs / MINUTE_MS)}분전`
  }

  if (elapsedMs < DAY_MS) {
    return `${Math.floor(elapsedMs / HOUR_MS)}시간전`
  }

  return `${Math.floor(elapsedMs / DAY_MS)}일전`
}

/** The full timestamp, for a tooltip or a screen reader. */
export function formatAbsoluteTime(value: string) {
  return new Intl.DateTimeFormat("ko", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value))
}
