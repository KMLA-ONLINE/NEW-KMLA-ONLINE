import type { Participant } from "~/lib/messenger/types"

export const CURRENT_USER: Participant = {
  id: "me",
  name: "You",
  initials: "ME",
}

export const DELETED_MESSAGE_LABEL = "삭제된 메시지입니다."
export const MESSAGE_CLUSTER_WINDOW_MINUTES = 2
export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const
