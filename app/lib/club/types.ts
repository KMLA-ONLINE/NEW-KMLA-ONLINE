import type { Database } from "~/lib/supabase/database.types"

export type ClubRow = Database["public"]["Tables"]["clubs"]["Row"]
export type ClubApplyRoundRow = Database["public"]["Tables"]["club_apply_rounds"]["Row"]
export type ClubApplyRow = Database["public"]["Tables"]["clubs_apply"]["Row"]
export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"]
export type ClubType = Database["public"]["Enums"]["club_type"]

export type ClubManager = Pick<ProfileRow, "id" | "name" | "cohort">

export type ClubRecruitment = ClubApplyRoundRow & {
  announcementMarkdown: string
  isOpen: boolean
}

export type ClubApplication = ClubApplyRow & {
  conversationId: string
}

/**
 * Supabase의 clubs row에 화면에서만 필요한 mock 필드를 붙인 형태.
 */
export type Club = ClubRow & {
  slug: string
  emoji: string
  imageUrl: string | null
  cardDescription: string
  meeting: string
  location: string
  managers: ClubManager[]
  recruitment: ClubRecruitment | null
  myApplication: ClubApplication | null
}

export type ClubApplicant = ClubApplyRow & {
  profile: Pick<ProfileRow, "id" | "name" | "cohort">
  conversationId: string
}
