export type ClubDivision = "sudo" | "mokdong"

export type ClubRecruitmentKind = "early" | "regular"

export type ClubRecruitmentStatus = "upcoming" | "open" | "reviewing" | "announced" | "closed"

export type ClubApplicationStatus =
  | "submitted"
  | "reviewing"
  | "accepted"
  | "rejected"
  | "withdrawn"

export type ClubManagerRole = "owner" | "admin" | "editor"

export type ClubManager = {
  userId: string
  name: string
  role: ClubManagerRole
  cohort: number | null
}

export type ClubRecruitment = {
  id: string
  title: string
  kind: ClubRecruitmentKind
  status: ClubRecruitmentStatus
  startsAt: string
  endsAt: string
  resultAt: string | null
  capacity: number | null
  announcementMarkdown: string
}

export type ClubApplicationSummary = {
  status: ClubApplicationStatus
  updatedAt: string
  note?: string
}

export type Club = {
  id: string
  name: string
  emoji: string
  division: ClubDivision
  summary: string
  descriptionMarkdown: string
  meeting: string
  location: string
  memberCount: number
  managers: ClubManager[]
  recruitment: ClubRecruitment | null
  myApplication: ClubApplicationSummary | null
}

export type ClubApplicantStatus = "submitted" | "reviewing" | "accepted" | "rejected"

export type ClubApplicant = {
  id: string
  userId: string
  name: string
  cohort: number
  status: ClubApplicantStatus
  submittedAt: string
  conversationId: string
}
