import type { Participant } from "~/lib/messenger/types"

export const CURRENT_USER: Participant = {
  id: "me",
  name: "You",
  initials: "ME",
}

export const DELETED_MESSAGE_LABEL = "삭제된 메시지입니다."
