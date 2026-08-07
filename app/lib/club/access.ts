import { createClient } from "~/lib/supabase/client"
import type { Database } from "~/lib/supabase/database.types"

type ClubAccessRow = Database["public"]["Functions"]["get_my_club_access"]["Returns"][number]

export type ClubAccess = {
  profileId: number | null
  isAppAdmin: boolean
  managedClubIds: number[]
}

export type ClubPreviewRole = "app-admin" | "club-admin" | null

const NO_CLUB_ACCESS: ClubAccess = {
  profileId: null,
  isAppAdmin: false,
  managedClubIds: [],
}

export function getClubPreviewRole(request: Request): ClubPreviewRole {
  const url = new URL(request.url)
  const isVercelPreview =
    url.hostname.startsWith("new-kmla-online-") && url.hostname.endsWith(".vercel.app")

  if (!import.meta.env.DEV && !isVercelPreview) {
    return null
  }

  const role = url.searchParams.get("as")
  return role === "app-admin" || role === "club-admin" ? role : null
}

export function withClubPreview(path: string, previewRole: ClubPreviewRole) {
  return previewRole === null ? path : `${path}?as=${previewRole}`
}

export async function getMyClubAccess(): Promise<ClubAccess> {
  const supabase = createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return NO_CLUB_ACCESS
  }

  const { data, error } = await supabase.rpc("get_my_club_access").single()

  if (error) {
    if (error.code === "42501") {
      return NO_CLUB_ACCESS
    }

    throw new Error(`동아리 관리자 권한을 확인하지 못했습니다. (${error.code})`, {
      cause: error,
    })
  }

  const access = data as ClubAccessRow

  return {
    profileId: access.profile_id,
    isAppAdmin: access.is_app_admin,
    managedClubIds: access.managed_club_ids,
  }
}
