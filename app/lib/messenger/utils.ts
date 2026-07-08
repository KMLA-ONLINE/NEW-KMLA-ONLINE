import { CURRENT_USER, DELETED_MESSAGE_LABEL } from "~/lib/messenger/constants"
import type {
  Message,
  MessageAttachment,
  MessageGroupPosition,
  ReplyPreview,
  Room,
} from "~/lib/messenger/types"

export function isDeletedMessage(message: Message) {
  return Boolean(message.deletedAt)
}

export function getLastMessage(room: Room) {
  for (let index = room.messages.length - 1; index >= 0; index -= 1) {
    const message = room.messages[index]

    if (message?.senderId !== "system") {
      return message
    }
  }

  return undefined
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

  const attachmentPreview = getAttachmentPreview(message.attachments)
  if (attachmentPreview) {
    return attachmentPreview
  }

  return "Attachment"
}

export function isImageAttachment(attachment: MessageAttachment) {
  return (
    attachment.contentType?.startsWith("image/") ||
    attachment.src?.startsWith("data:image/") ||
    false
  )
}

export function formatFileSize(sizeBytes: number | undefined) {
  if (sizeBytes === undefined) {
    return null
  }

  if (sizeBytes < 1024) {
    return `${sizeBytes} B`
  }

  if (sizeBytes < 1024 * 1024) {
    return `${Math.round(sizeBytes / 1024)} KB`
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`
}

export type ImageSizeBounds = {
  maxWidth: number
  maxHeight: number
  minWidth: number
  minHeight: number
}

// Mobile-safe box for a single image inside a chat bubble: wide enough to
// read, capped so it never forces the bubble past its max-width on a narrow
// screen.
export const MESSAGE_IMAGE_BOUNDS: ImageSizeBounds = {
  maxWidth: 224, // 14rem
  maxHeight: 288, // 18rem
  minWidth: 140,
  minHeight: 110,
}

export function getBoundedImageSize(
  width: number,
  height: number,
  bounds: ImageSizeBounds = MESSAGE_IMAGE_BOUNDS
) {
  const ratio = width / height
  let boundedWidth = bounds.maxWidth
  let boundedHeight = boundedWidth / ratio

  if (boundedHeight > bounds.maxHeight) {
    boundedHeight = bounds.maxHeight
    boundedWidth = boundedHeight * ratio
  }

  // Extreme aspect ratios (panoramas, tall screenshots) get clamped to a
  // minimum side; object-cover crops the rest, same as most chat apps.
  boundedWidth = Math.min(bounds.maxWidth, Math.max(bounds.minWidth, boundedWidth))
  boundedHeight = Math.min(bounds.maxHeight, Math.max(bounds.minHeight, boundedHeight))

  return { width: Math.round(boundedWidth), height: Math.round(boundedHeight) }
}

export function getFileTypeLabel(attachment: MessageAttachment) {
  if (attachment.contentType) {
    return attachment.contentType.split("/").pop()?.toUpperCase() ?? "FILE"
  }

  const extension = attachment.name.split(".").pop()
  return extension && extension !== attachment.name ? extension.toUpperCase() : "FILE"
}

export function getAttachmentPreview(attachments: MessageAttachment[] | undefined) {
  const firstAttachment = attachments?.[0]
  if (!firstAttachment) {
    return null
  }

  if (attachments.length > 1) {
    return `${firstAttachment.name} 외 ${attachments.length - 1}개`
  }

  return (
    firstAttachment.name ||
    (isImageAttachment(firstAttachment) ? "Image attached" : "File attached")
  )
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

export function isSameMessageMinute(firstMessage: Message, secondMessage: Message) {
  const firstDate = new Date(firstMessage.createdAt)
  const secondDate = new Date(secondMessage.createdAt)

  return (
    firstDate.getFullYear() === secondDate.getFullYear() &&
    firstDate.getMonth() === secondDate.getMonth() &&
    firstDate.getDate() === secondDate.getDate() &&
    firstDate.getHours() === secondDate.getHours() &&
    firstDate.getMinutes() === secondDate.getMinutes()
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
  const diffMs = Math.max(0, now.getTime() - date.getTime())

  if (diffMs < 60_000) {
    return "방금"
  }

  if (diffMs < 60 * 60_000) {
    return `${Math.floor(diffMs / 60_000)}분전`
  }

  if (diffMs < 24 * 60 * 60_000) {
    return `${Math.floor(diffMs / (60 * 60_000))}시간전`
  }

  return `${Math.floor(diffMs / (24 * 60 * 60_000))}일전`
}

export function getReplyText(message: Message) {
  if (isDeletedMessage(message)) {
    return DELETED_MESSAGE_LABEL
  }

  if (message.content) {
    return message.content
  }

  const attachmentPreview = getAttachmentPreview(message.attachments)
  if (attachmentPreview) {
    return attachmentPreview
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
    isSameMessageDate(previousMessage, message)
  const hasNextFromSameSender =
    nextMessage?.senderId === message.senderId &&
    !nextMessage.replyTo &&
    nextMessage.senderId !== "system" &&
    isSameMessageDate(message, nextMessage)

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

  return !isSameMessageDate(previousMessage, currentMessage)
}

export function shouldShowMessageTime(messages: Message[], index: number) {
  const message = messages[index]

  if (!message || message.senderId === "system") {
    return false
  }

  const nextMessage = messages[index + 1]

  if (!nextMessage || nextMessage.senderId === "system") {
    return true
  }

  if (nextMessage.senderId !== message.senderId) {
    return true
  }

  if (nextMessage.replyTo) {
    return true
  }

  return !isSameMessageMinute(message, nextMessage)
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
