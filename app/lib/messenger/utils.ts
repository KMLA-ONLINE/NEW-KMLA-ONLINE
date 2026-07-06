import {
  CURRENT_USER,
  DELETED_MESSAGE_LABEL,
  MESSAGE_CLUSTER_WINDOW_MINUTES,
  QUICK_REACTIONS,
} from "~/lib/messenger/constants"
import type {
  Message,
  MessageGroupPosition,
  PersistedMessengerState,
  ReplyPreview,
  Room,
} from "~/lib/messenger/types"

export function isQuickReaction(reaction: string) {
  return QUICK_REACTIONS.includes(reaction as (typeof QUICK_REACTIONS)[number])
}

export function isDeletedMessage(message: Message) {
  return Boolean(message.deletedAt)
}

export function getLastMessage(room: Room) {
  return [...room.messages].reverse().find((message) => message.senderId !== "system")
}

export function getMessagePreview(message: Message | undefined) {
  if (!message) {
    return "No messages yet"
  }

  if (isDeletedMessage(message)) {
    return DELETED_MESSAGE_LABEL
  }

  if (message.content) {
    return message.content
  }

  if (message.image) {
    return "Photo attached"
  }

  return "Attachment"
}

export function findParticipant(room: Room, participantId: string) {
  return room.participants.find((participant) => participant.id === participantId)
}

export function getMessageAuthor(room: Room, message: Message) {
  if (message.senderId === CURRENT_USER.id) {
    return CURRENT_USER
  }

  return (
    findParticipant(room, message.senderId) ?? {
      id: message.senderId,
      name: "Unknown",
      initials: "UN",
    }
  )
}

export function formatMessageTime(value: string) {
  return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(
    new Date(value)
  )
}

export function isSameMessageDate(firstMessage: Message, secondMessage: Message) {
  const firstDate = new Date(firstMessage.createdAt)
  const secondDate = new Date(secondMessage.createdAt)

  return (
    firstDate.getFullYear() === secondDate.getFullYear() &&
    firstDate.getMonth() === secondDate.getMonth() &&
    firstDate.getDate() === secondDate.getDate()
  )
}

export function formatMessageDateLabel(value: string) {
  return new Intl.DateTimeFormat("ko", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(value))
}

export function formatRoomTime(value: string | undefined) {
  if (!value) {
    return ""
  }

  const date = new Date(value)
  const now = new Date()
  const today = now.toDateString() === date.toDateString()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)

  if (today) {
    return formatMessageTime(value)
  }

  if (yesterday.toDateString() === date.toDateString()) {
    return "Yesterday"
  }

  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date)
}

export function getReplyText(message: Message) {
  if (isDeletedMessage(message)) {
    return DELETED_MESSAGE_LABEL
  }

  if (message.content) {
    return message.content
  }

  if (message.image) {
    return message.image.title
  }

  return "Attachment"
}

export function getReplyPreviewText(room: Room, replyPreview: ReplyPreview) {
  const referencedMessage = room.messages.find((message) => message.id === replyPreview.messageId)

  if (!referencedMessage) {
    return replyPreview.text
  }

  return getReplyText(referencedMessage)
}

export function getBubbleShapeClass(isMine: boolean, groupPosition: MessageGroupPosition) {
  if (isMine) {
    switch (groupPosition) {
      case "start":
        return "rounded-[1.25rem] rounded-br-sm"
      case "middle":
        return "rounded-[1.25rem] rounded-tr-sm rounded-br-sm"
      case "end":
        return "rounded-[1.25rem] rounded-tr-sm"
      default:
        return "rounded-[1.25rem]"
    }
  }

  switch (groupPosition) {
    case "start":
      return "rounded-[1.25rem] rounded-bl-sm"
    case "middle":
      return "rounded-[1.25rem] rounded-tl-sm rounded-bl-sm"
    case "end":
      return "rounded-[1.25rem] rounded-tl-sm"
    default:
      return "rounded-[1.25rem]"
  }
}

export function isSameMessageCluster(firstMessage: Message, secondMessage: Message) {
  const firstDate = new Date(firstMessage.createdAt)
  const secondDate = new Date(secondMessage.createdAt)

  return (
    firstDate.getFullYear() === secondDate.getFullYear() &&
    firstDate.getMonth() === secondDate.getMonth() &&
    firstDate.getDate() === secondDate.getDate() &&
    firstDate.getHours() === secondDate.getHours() &&
    Math.floor(firstDate.getMinutes() / MESSAGE_CLUSTER_WINDOW_MINUTES) ===
      Math.floor(secondDate.getMinutes() / MESSAGE_CLUSTER_WINDOW_MINUTES)
  )
}

export function getMessageGroupPosition(messages: Message[], index: number): MessageGroupPosition {
  const message = messages[index]

  if (!message || message.senderId === "system") {
    return "single"
  }

  const previousMessage = messages[index - 1]
  const nextMessage = messages[index + 1]
  const hasPreviousFromSameSender =
    previousMessage?.senderId === message.senderId &&
    !message.replyTo &&
    previousMessage.senderId !== "system" &&
    isSameMessageCluster(previousMessage, message)
  const hasNextFromSameSender =
    nextMessage?.senderId === message.senderId &&
    !nextMessage.replyTo &&
    nextMessage.senderId !== "system" &&
    isSameMessageCluster(message, nextMessage)

  if (hasPreviousFromSameSender && hasNextFromSameSender) {
    return "middle"
  }

  if (hasPreviousFromSameSender) {
    return "end"
  }

  if (hasNextFromSameSender) {
    return "start"
  }

  return "single"
}

export function shouldSeparateMessages(
  previousMessage: Message | undefined,
  currentMessage: Message
) {
  if (!previousMessage) {
    return false
  }

  if (currentMessage.replyTo) {
    return true
  }

  if (previousMessage.senderId === "system" || currentMessage.senderId === "system") {
    return true
  }

  if (previousMessage.senderId !== currentMessage.senderId) {
    return true
  }

  return !isSameMessageCluster(previousMessage, currentMessage)
}

export function shouldShowDateSeparator(
  previousMessage: Message | undefined,
  currentMessage: Message
) {
  if (!previousMessage) {
    return true
  }

  return !isSameMessageDate(previousMessage, currentMessage)
}

export function getRoomSubtitle(room: Room) {
  return room.type === "group" ? `${room.participants.length} members` : ""
}

export function getDesktopGridClass(isDetailOpen: boolean) {
  return isDetailOpen
    ? "md:grid-cols-[19.5rem_minmax(0,1fr)] lg:grid-cols-[22.5rem_minmax(0,1fr)_19rem]"
    : "md:grid-cols-[19.5rem_minmax(0,1fr)] lg:grid-cols-[22.5rem_minmax(0,1fr)]"
}

export function isPersistedState(value: unknown): value is PersistedMessengerState {
  if (!value || typeof value !== "object") {
    return false
  }

  const candidate = value as Partial<PersistedMessengerState>
  return Array.isArray(candidate.rooms)
}
