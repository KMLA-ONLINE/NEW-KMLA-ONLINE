import { createClient } from "~/lib/supabase/client"
import type { Database } from "~/lib/supabase/database.types"

type ClubAccessRow = Database["public"]["Functions"]["get_my_club_access"]["Returns"][number]

export type ClubAccess = {
  profileId: number | null
  isAppAdmin: boolean
  managedClubIds: number[]
}

const NO_CLUB_ACCESS: ClubAccess = {
  profileId: null,
  isAppAdmin: false,
  managedClubIds: [],
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
    // 로컬 DB reset 뒤 브라우저에 예전 세션이 남은 경우처럼, Auth가 더 이상 인정하지
    // 않는 토큰은 일반 사용자 권한으로 낮춘다. 관리자 UI를 여는 방향으로 실패하면 안 된다.
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
