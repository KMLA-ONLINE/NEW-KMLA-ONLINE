import type { Database, Tables } from "~/lib/supabase/database.types"

export type ProfileId = Tables<"profiles">["id"]
export type ConversationId = Tables<"conversations">["id"]
export type PersistedMessageId = Tables<"messages">["id"]
export type PersistedAttachmentId = Tables<"message_attachments">["id"]
export type LocalMessageId = `local-${string}`
export type LocalAttachmentId = `local-file-${string}`
export type MessageId = PersistedMessageId | LocalMessageId
export type AttachmentId = PersistedAttachmentId | LocalAttachmentId
export type RoomType = Database["public"]["Enums"]["conversation_type"]

export type MessageGroupPosition = "single" | "start" | "middle" | "end"

export type Participant = {
  id: ProfileId
  name: string
  avatarUrl: Tables<"profiles">["avatar_url"]
}

export type MessageAttachment = {
  id: AttachmentId
  src?: string
  name: string
  contentType?: string
  sizeBytes?: number
  width?: number
  height?: number
  /** Audio and video. Persisted as message_attachments.duration_ms. */
  durationSeconds?: number
}

export type ReplyPreview = {
  messageId: MessageId
  author: string
  text: string
}

export type MessageReaction = {
  userId: ProfileId
  value: string
}

// 전송 상태. 서버에서 불러온(전달 완료된) 메시지는 이 필드가 없다 -- 없음 = 전달됨. 내가 보낸
// 낙관적 메시지만 "sending"으로 뜨고, 성공하면 지워지고 실패하면 "failed"가 된다.
export type MessageStatus = "sending" | "failed"

export type Message = {
  id: MessageId
  senderId: ProfileId
  content?: string
  status?: MessageStatus
  createdAt: string
  deletedAt?: string
  deletedBy?: ProfileId
  attachments?: MessageAttachment[]
  replyTo?: ReplyPreview
  reactions?: MessageReaction[]
  read?: boolean
  readBy?: ProfileId[]
  pinnedAt?: string
  pinnedBy?: ProfileId
}

export type LocalMessage = Omit<Message, "id" | "status"> & {
  id: LocalMessageId
  status: MessageStatus
}

export type Room = {
  id: ConversationId
  type: RoomType
  name: string
  avatarUrl: string | null
  participants: Participant[]
  messages: Message[]
  unreadCount?: number
  /**
   * Derived, not stored: chat_notification_settings holds `muted_until`, which
   * carries both "for 8 hours" and "until I say otherwise". Recompute it as the
   * deadline passes rather than caching a boolean.
   */
  muted?: boolean
}

export type RoomSummary = Omit<Room, "messages"> & {
  lastMessage?: Message
  lastMessageAt?: string
}
