import { useClientNow } from "~/hooks/use-client-now"
import { formatAbsoluteTime, formatRelativeTime } from "~/lib/time"

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
  const now = useClientNow()
  const absoluteTime = formatAbsoluteTime(value)

  return (
    <time dateTime={value} title={absoluteTime} className={className}>
      {now === null ? absoluteTime : formatRelativeTime(value, now)}
    </time>
  )
}
