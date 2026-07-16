import { CURRENT_USER, DELETED_MESSAGE_LABEL } from "~/lib/messenger/constants"
import { formatRelativeTime } from "~/lib/time"
import type { Message, MessageAttachment, MessageGroupPosition, Room } from "~/lib/messenger/types"

export type LinkedTextSegment =
  | {
      type: "text"
      text: string
    }
  | {
      type: "link"
      text: string
      href: string
    }

const MESSAGE_LINK_PATTERN = /(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi
const TRAILING_LINK_PUNCTUATION_PATTERN = /[.,!?;:]+$/

export function getLinkedTextSegments(text: string): LinkedTextSegment[] {
  const segments: LinkedTextSegment[] = []
  let lastIndex = 0

  for (const match of text.matchAll(MESSAGE_LINK_PATTERN)) {
    const matchedText = match[0]
    const matchIndex = match.index ?? 0

    if (matchIndex > lastIndex) {
      segments.push({ type: "text", text: text.slice(lastIndex, matchIndex) })
    }

    const linkText = matchedText.replace(TRAILING_LINK_PUNCTUATION_PATTERN, "")
    const trailingText = matchedText.slice(linkText.length)
    const href = linkText.startsWith("http") ? linkText : `https://${linkText}`

    segments.push({ type: "link", text: linkText, href })

    if (trailingText) {
      segments.push({ type: "text", text: trailingText })
    }

    lastIndex = matchIndex + matchedText.length
  }

  if (lastIndex < text.length) {
    segments.push({ type: "text", text: text.slice(lastIndex) })
  }

  return segments.length > 0 ? segments : [{ type: "text", text }]
}

export function isDeletedMessage(message: Message) {
  return Boolean(message.deletedAt)
}

export function isPinnedMessage(message: Message) {
  return Boolean(message.pinnedAt) && !isDeletedMessage(message)
}

// ISO timestamps sort correctly as plain strings, so no Date parsing needed.
export function getPinnedMessages(room: Room): Message[] {
  return room.messages
    .filter(isPinnedMessage)
    .sort((first, second) => (second.pinnedAt ?? "").localeCompare(first.pinnedAt ?? ""))
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

// Shared by getMessagePreview and getReplyText: both render "what does this
// message say" and differ only in how they handle a missing message.
function getMessageBodyPreview(message: Message) {
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

  return "첨부 파일"
}

export function getMessagePreview(message: Message | undefined) {
  if (!message) {
    return "아직 메시지가 없습니다."
  }

  return getMessageBodyPreview(message)
}

export type AttachmentKind = "image" | "audio" | "video" | "file"

// Mirrors public.message_attachment_mime_types. Deliberately no "svg": the
// server rejects image/svg+xml, since an SVG can carry script and the download
// link opens it directly.
const EXTENSIONS_BY_KIND: Record<Exclude<AttachmentKind, "file">, Set<string>> = {
  image: new Set(["jpeg", "jpg", "png", "webp"]),
  audio: new Set(["aac", "m4a", "mp3", "oga", "ogg", "wav"]),
  video: new Set(["mov", "mp4", "webm"]),
}

function getFileExtension(name: string) {
  const extension = name.split(".").pop()?.toLowerCase()
  return extension && extension !== name.toLowerCase() ? extension : null
}

// contentType is the source of truth (message_attachments.content_type is NOT
// NULL), but a locally attached File can report an empty type, so fall back to
// the extension rather than silently rendering a photo as a grey file chip.
export function getAttachmentKind(
  attachment: Pick<MessageAttachment, "contentType" | "name">
): AttachmentKind {
  const mediaKinds = ["image", "audio", "video"] as const

  for (const kind of mediaKinds) {
    if (attachment.contentType?.startsWith(`${kind}/`)) {
      return kind
    }
  }

  const extension = getFileExtension(attachment.name)

  for (const kind of mediaKinds) {
    if (extension && EXTENSIONS_BY_KIND[kind].has(extension)) {
      return kind
    }
  }

  return "file"
}

export function isImageAttachment(attachment: MessageAttachment) {
  return getAttachmentKind(attachment) === "image"
}

/**
 * The viewable images sent alongside `attachmentId`, in attachment order. The
 * viewer steps within one message rather than the whole room: that is the set
 * the sender chose, and it keeps a lone photo from opening a gallery strip.
 */
export function getMessageImages(room: Room, attachmentId: string) {
  const message = room.messages.find((candidate) =>
    candidate.attachments?.some((attachment) => attachment.id === attachmentId)
  )

  return (message?.attachments ?? []).filter(
    (attachment): attachment is MessageAttachment & { src: string } =>
      isImageAttachment(attachment) && Boolean(attachment.src)
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

// Preferred box for a single image inside a chat bubble. maxWidth is a target,
// not a hard render width: the figure uses aspect-ratio + max-w-full, so on a
// narrow screen it shrinks to the bubble column (~70% of the chat) without
// distortion, and on desktop/tablet it grows up to ~half the chat width.
// maxHeight keeps tall/portrait images from ballooning vertically (their width
// stays narrow as a result), which is what we want.
export const MESSAGE_IMAGE_BOUNDS: ImageSizeBounds = {
  maxWidth: 360,
  maxHeight: 420,
  minWidth: 140,
  minHeight: 110,
}

/**
 * Video gets its own box, and shapes it differently.
 *
 * A photo is cropped into a fixed pixel box by object-cover, so the bubble
 * clamping that box on a narrow screen costs nothing. Cropping a video is not on
 * the table, so a fixed height would just grow letterbox bars once the bubble's
 * max-width bites. A width plus an aspect ratio keeps the height tracking
 * whatever width the bubble actually grants.
 *
 * Wider than a photo, because the native controls have to fit along the bottom.
 */
export const MESSAGE_VIDEO_BOUNDS = {
  maxWidth: 260,
  maxHeight: 340,
  // Taller than this and a phone screen scrolls; wider and the controls outgrow
  // the picture. Past either, we do letterbox rather than distort.
  minAspectRatio: 0.5,
  maxAspectRatio: 2.5,
  // Reserved before the clip reports its real dimensions, so nothing reflows.
  defaultAspectRatio: 16 / 9,
}

/**
 * A tall clip keeps its shape and gives up width, rather than sitting in a
 * fixed-width box behind two black pillars.
 */
export function getBoundedVideoBox(
  width: number | undefined,
  height: number | undefined,
  bounds = MESSAGE_VIDEO_BOUNDS
) {
  const sourceRatio = width && height ? width / height : bounds.defaultAspectRatio
  const aspectRatio = Math.min(bounds.maxAspectRatio, Math.max(bounds.minAspectRatio, sourceRatio))

  return {
    width: Math.min(bounds.maxWidth, Math.round(bounds.maxHeight * aspectRatio)),
    aspectRatio,
  }
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
    return attachment.contentType.split("/").pop()?.toUpperCase() ?? "파일"
  }

  const extension = attachment.name.split(".").pop()
  return extension && extension !== attachment.name ? extension.toUpperCase() : "파일"
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
    (isImageAttachment(firstAttachment) ? "이미지가 첨부되었습니다." : "파일이 첨부되었습니다.")
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
      name: "알 수 없음",
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
  return value ? formatRelativeTime(value, Date.now()) : ""
}

export function getReplyText(message: Message) {
  return getMessageBodyPreview(message)
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
  return room.type === "group" ? `${room.participants.length}명` : ""
}
