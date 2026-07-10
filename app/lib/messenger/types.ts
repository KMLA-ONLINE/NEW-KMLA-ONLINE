export type RoomType = "direct" | "group"

export type MessageGroupPosition = "single" | "start" | "middle" | "end"

export type Participant = {
  id: string
  name: string
  initials: string
}

export type MessageAttachment = {
  id: string
  src?: string
  name: string
  contentType?: string
  sizeBytes?: number
  /** Images and video. */
  width?: number
  height?: number
  /** Audio and video. Persisted as message_attachments.duration_ms. */
  durationSeconds?: number
}

export type ReplyPreview = {
  messageId: string
  author: string
  text: string
}

export type MessageReaction = {
  userId: string
  value: string
}

export type Message = {
  id: string
  senderId: string
  content?: string
  createdAt: string
  deletedAt?: string
  deletedBy?: string
  attachments?: MessageAttachment[]
  replyTo?: ReplyPreview
  reactions?: MessageReaction[]
  read?: boolean
  readBy?: string[]
  pinnedAt?: string
  pinnedBy?: string
}

export type Room = {
  id: string
  type: RoomType
  name: string
  initials: string
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
