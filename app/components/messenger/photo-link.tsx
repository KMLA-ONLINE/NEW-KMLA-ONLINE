import { Link, useSearchParams } from "react-router"

import { PHOTO_SEARCH_PARAM, PHOTO_VIEWER_LOCATION_STATE } from "~/lib/messenger/constants"
import type { AttachmentId } from "~/lib/messenger/types"

/**
 * Opens the fullscreen image viewer by putting the attachment id in the URL, so
 * the mobile back gesture closes it. Pushes a history entry on purpose, and
 * marks it, because only an entry we pushed is safe to close with a back step.
 */
export function PhotoLink({
  attachmentId,
  className,
  children,
}: {
  attachmentId: AttachmentId
  className?: string
  children: React.ReactNode
}) {
  const [searchParams] = useSearchParams()
  const nextSearchParams = new URLSearchParams(searchParams)
  nextSearchParams.set(PHOTO_SEARCH_PARAM, String(attachmentId))

  return (
    <Link
      to={{ search: `?${nextSearchParams}` }}
      state={PHOTO_VIEWER_LOCATION_STATE}
      preventScrollReset
      className={className}
    >
      {children}
    </Link>
  )
}
