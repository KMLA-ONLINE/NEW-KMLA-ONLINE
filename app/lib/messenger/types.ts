export type RoomType = "direct" | "group"

export type MessageGroupPosition = "single" | "start" | "middle" | "end"

export type Participant = {
  id: string
  name: string
  initials: string
}

export type ImageAttachment = {
  src?: string
  title: string
  subtitle?: string
}

export type ReplyPreview = {
  messageId: string
  author: string
  text: string
}

export type Message = {
  id: string
  senderId: string
  content?: string
  createdAt: string
  deletedAt?: string
  deletedBy?: string
  image?: ImageAttachment
  replyTo?: ReplyPreview
  reaction?: string
  read?: boolean
}

export type Room = {
  id: string
  type: RoomType
  name: string
  initials: string
  participants: Participant[]
  messages: Message[]
  unreadCount?: number
  muted?: boolean
}

export type PersistedMessengerState = {
  rooms: Room[]
}
