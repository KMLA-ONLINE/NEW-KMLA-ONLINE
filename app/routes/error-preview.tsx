import { Navigate } from "react-router"

import type { Route } from "./+types/error-preview"
import { ErrorPage } from "~/components/error/error-page"

const PREVIEW_STATUSES = [403, 404, 500] as const

export default function ErrorPreview({ params }: Route.ComponentProps) {
  if (!import.meta.env.DEV) {
    return <Navigate to="/" replace />
  }

  const status = Number(params.status)

  if (!PREVIEW_STATUSES.includes(status as (typeof PREVIEW_STATUSES)[number])) {
    return <Navigate to="/__error-preview/404" replace />
  }

  return <ErrorPage status={status} onRetry={() => window.location.reload()} />
}
