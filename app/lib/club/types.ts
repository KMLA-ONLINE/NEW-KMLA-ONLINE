export type ClubDivision = "sudo" | "mokdong"

export type ClubManager = {
  userId: string
  name: string
  cohort: number | null
}

export type ClubRecruitment = {
  id: string
  title: string
  isOpen: boolean
  startsAt: string
  endsAt: string
  announcementMarkdown: string
}

export type ClubApplication = {
  submittedAt: string
  conversationId: string
}

export type Club = {
  id: string
  name: string
  emoji: string
  imageUrl: string | null
  division: ClubDivision
  cardDescription: string
  descriptionMarkdown: string
  meeting: string
  location: string
  managers: ClubManager[]
  recruitment: ClubRecruitment | null
  myApplication: ClubApplication | null
}

export type ClubApplicant = {
  id: string
  name: string
  cohort: number
  submittedAt: string
  conversationId: string
}
