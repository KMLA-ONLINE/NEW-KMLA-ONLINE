import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react"
import {
  ArrowLeftIcon,
  CheckCheckIcon,
  ImageIcon,
  InfoIcon,
  MicIcon,
  PanelRightCloseIcon,
  PhoneIcon,
  PlusIcon,
  SearchIcon,
  SendIcon,
  SmileIcon,
  ThumbsUpIcon,
  UsersIcon,
  VideoIcon,
  XIcon,
} from "lucide-react"

import { Avatar, AvatarBadge, AvatarFallback } from "~/components/ui/avatar"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { cn } from "~/lib/utils"

type MobileScreen = "list" | "room" | "detail"
type RoomType = "direct" | "group"
type MessageGroupPosition = "single" | "start" | "middle" | "end"

type Participant = {
  id: string
  name: string
  initials: string
  role?: string
  online?: boolean
}

type ImageAttachment = {
  src?: string
  title: string
  subtitle?: string
}

type ReplyPreview = {
  messageId: string
  author: string
  text: string
}

type Message = {
  id: string
  senderId: string
  content?: string
  createdAt: string
  image?: ImageAttachment
  replyTo?: ReplyPreview
  reaction?: string
  read?: boolean
}

type Room = {
  id: string
  type: RoomType
  name: string
  initials: string
  role: string
  participants: Participant[]
  messages: Message[]
  unreadCount?: number
  muted?: boolean
  online?: boolean
  statusNote?: string
}

type PersistedMessengerState = {
  rooms: Room[]
  selectedRoomId: string
  isDetailOpen: boolean
}

const CURRENT_USER: Participant = {
  id: "me",
  name: "You",
  initials: "ME",
  role: "KMLA Online",
  online: true,
}

const STORAGE_KEY = "kmla-online:messenger:v1"

const seedRooms: Room[] = [
  {
    id: "room-minji",
    type: "direct",
    name: "Minji Kang",
    initials: "MK",
    role: "Dorm 2-1",
    online: true,
    statusNote: "Usually replies in a few minutes",
    participants: [
      CURRENT_USER,
      { id: "minji", name: "Minji Kang", initials: "MK", role: "Dorm 2-1", online: true },
    ],
    unreadCount: 2,
    messages: [
      {
        id: "minji-system-1",
        senderId: "system",
        content: "Today, 8:41 PM",
        createdAt: "2026-07-03T20:41:00.000Z",
      },
      {
        id: "minji-1",
        senderId: "minji",
        content: "Are you still in the science building?",
        createdAt: "2026-07-03T20:41:00.000Z",
      },
      {
        id: "minji-2",
        senderId: "me",
        content: "Yes, finishing the lab notes now.",
        createdAt: "2026-07-03T20:42:00.000Z",
        read: true,
      },
      {
        id: "minji-3",
        senderId: "minji",
        replyTo: {
          messageId: "minji-2",
          author: "You",
          text: "Yes, finishing the lab notes now.",
        },
        content:
          "Perfect. Can you send the board photo again? The first image was cropped on my phone.",
        createdAt: "2026-07-03T20:43:00.000Z",
      },
      {
        id: "minji-4",
        senderId: "me",
        image: {
          title: "Whiteboard snapshot",
          subtitle: "Organic chemistry reaction map",
        },
        createdAt: "2026-07-03T20:44:00.000Z",
        read: true,
      },
      {
        id: "minji-5",
        senderId: "me",
        content:
          "This one should include the whole reaction sequence. I also marked the step where Professor Kim said most people make the sign mistake, so check that part before copying it into the shared notes.",
        createdAt: "2026-07-03T20:44:20.000Z",
        reaction: "Liked",
        read: true,
      },
      {
        id: "minji-6",
        senderId: "minji",
        content:
          "Got it. The long paragraph wraps correctly here too, which is useful for checking the message bubble width on desktop and mobile layouts.",
        createdAt: "2026-07-03T20:46:00.000Z",
      },
    ],
  },
  {
    id: "room-council",
    type: "group",
    name: "Student Council Ops",
    initials: "SC",
    role: "Group chat",
    statusNote: "4 members",
    participants: [
      CURRENT_USER,
      { id: "daniel", name: "Daniel Choi", initials: "DC", role: "Council" },
      { id: "sora", name: "Sora Han", initials: "SH", role: "Council", online: true },
      { id: "yujin", name: "Yujin Seo", initials: "YS", role: "Council" },
    ],
    messages: [
      {
        id: "council-1",
        senderId: "daniel",
        content: "I moved the checklist into the drive folder.",
        createdAt: "2026-07-03T19:11:00.000Z",
      },
      {
        id: "council-2",
        senderId: "sora",
        content: "Great. I will verify the volunteer names before dinner.",
        createdAt: "2026-07-03T19:18:00.000Z",
      },
      {
        id: "council-3",
        senderId: "me",
        content:
          "Please leave the booth layout unchanged until the advisor confirms the power outlets.",
        createdAt: "2026-07-03T19:24:00.000Z",
        read: true,
      },
    ],
  },
  {
    id: "room-junseo",
    type: "direct",
    name: "Junseo Park",
    initials: "JP",
    role: "Class 3-2",
    muted: true,
    participants: [
      CURRENT_USER,
      { id: "junseo", name: "Junseo Park", initials: "JP", role: "Class 3-2" },
    ],
    messages: [
      {
        id: "junseo-1",
        senderId: "junseo",
        content: "Long answer, but the short version is yes.",
        createdAt: "2026-07-03T18:32:00.000Z",
      },
    ],
  },
  {
    id: "room-debate",
    type: "group",
    name: "Debate Prep Room",
    initials: "DP",
    role: "Club chat",
    unreadCount: 5,
    participants: [
      CURRENT_USER,
      { id: "arin", name: "Arin Moon", initials: "AM", role: "Debate" },
      { id: "tae", name: "Tae Kim", initials: "TK", role: "Debate" },
    ],
    messages: [
      {
        id: "debate-1",
        senderId: "arin",
        image: {
          title: "Case map draft",
          subtitle: "Tournament prep board",
        },
        createdAt: "2026-07-03T17:12:00.000Z",
      },
      {
        id: "debate-2",
        senderId: "tae",
        content: "Photo attached. The second column needs the strongest evidence first.",
        createdAt: "2026-07-03T17:13:00.000Z",
      },
    ],
  },
  {
    id: "room-library",
    type: "direct",
    name: "Library Desk",
    initials: "LD",
    role: "Official",
    participants: [
      CURRENT_USER,
      { id: "library", name: "Library Desk", initials: "LD", role: "Official" },
    ],
    messages: [
      {
        id: "library-1",
        senderId: "library",
        content: "Your reservation has been extended until 9:30 PM.",
        createdAt: "2026-07-03T15:07:00.000Z",
      },
    ],
  },
  {
    id: "room-hani",
    type: "direct",
    name: "Hani Lee",
    initials: "HL",
    role: "Class 1-4",
    online: true,
    participants: [
      CURRENT_USER,
      { id: "hani", name: "Hani Lee", initials: "HL", role: "Class 1-4", online: true },
    ],
    messages: [
      {
        id: "hani-1",
        senderId: "me",
        content: "I left the notebook with the front desk.",
        createdAt: "2026-07-02T21:15:00.000Z",
        read: true,
      },
      {
        id: "hani-2",
        senderId: "hani",
        content: "Thanks! I will check after study hall.",
        createdAt: "2026-07-02T21:17:00.000Z",
      },
    ],
  },
]

function getLastMessage(room: Room) {
  return [...room.messages].reverse().find((message) => message.senderId !== "system")
}

function getMessagePreview(message: Message | undefined) {
  if (!message) {
    return "No messages yet"
  }

  if (message.content) {
    return message.content
  }

  if (message.image) {
    return "Photo attached"
  }

  return "Attachment"
}

function findParticipant(room: Room, participantId: string) {
  return room.participants.find((participant) => participant.id === participantId)
}

function getMessageAuthor(room: Room, message: Message) {
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

function formatMessageTime(value: string) {
  return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(
    new Date(value)
  )
}

function formatRoomTime(value: string | undefined) {
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

function getReplyText(message: Message) {
  if (message.content) {
    return message.content
  }

  if (message.image) {
    return message.image.title
  }

  return "Attachment"
}

function getBubbleShapeClass(isMine: boolean, groupPosition: MessageGroupPosition) {
  if (isMine) {
    switch (groupPosition) {
      case "start":
        return "rounded-[1.25rem] rounded-br-md"
      case "middle":
        return "rounded-[1.25rem] rounded-tr-md rounded-br-md"
      case "end":
        return "rounded-[1.25rem] rounded-tr-md"
      default:
        return "rounded-[1.25rem]"
    }
  }

  switch (groupPosition) {
    case "start":
      return "rounded-[1.25rem] rounded-bl-md"
    case "middle":
      return "rounded-[1.25rem] rounded-tl-md rounded-bl-md"
    case "end":
      return "rounded-[1.25rem] rounded-tl-md"
    default:
      return "rounded-[1.25rem]"
  }
}

function getMessageGroupPosition(messages: Message[], index: number): MessageGroupPosition {
  const message = messages[index]

  if (!message || message.senderId === "system") {
    return "single"
  }

  const previousMessage = messages[index - 1]
  const nextMessage = messages[index + 1]
  const hasPreviousFromSameSender =
    previousMessage?.senderId === message.senderId && previousMessage.senderId !== "system"
  const hasNextFromSameSender =
    nextMessage?.senderId === message.senderId && nextMessage.senderId !== "system"

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

function getRoomSubtitle(room: Room) {
  return (
    room.statusNote ?? (room.type === "group" ? `${room.participants.length} members` : room.role)
  )
}

function getDesktopGridClass(isDetailOpen: boolean) {
  return isDetailOpen
    ? "md:grid-cols-[19.5rem_minmax(0,1fr)] lg:grid-cols-[22.5rem_minmax(0,1fr)_19rem]"
    : "md:grid-cols-[19.5rem_minmax(0,1fr)] lg:grid-cols-[22.5rem_minmax(0,1fr)]"
}

function isPersistedState(value: unknown): value is PersistedMessengerState {
  if (!value || typeof value !== "object") {
    return false
  }

  const candidate = value as Partial<PersistedMessengerState>
  return Array.isArray(candidate.rooms) && typeof candidate.selectedRoomId === "string"
}

function ChatListPane({
  rooms,
  selectedRoomId,
  searchValue,
  onSearchChange,
  onSelectRoom,
}: {
  rooms: Room[]
  selectedRoomId: string
  searchValue: string
  onSearchChange: (value: string) => void
  onSelectRoom: (roomId: string) => void
}) {
  return (
    <section className="bg-card flex h-full min-h-0 flex-col overflow-hidden md:border-r">
      <div className="shrink-0 space-y-3 px-4 py-4 md:px-5 md:py-4">
        <div className="hidden space-y-1 md:block">
          <h1 className="text-xl font-semibold md:text-lg">Messages</h1>
          <p className="text-muted-foreground text-xs">Direct and group conversations</p>
        </div>
        <div className="relative">
          <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2" />
          <Input
            value={searchValue}
            className="bg-muted h-10 rounded-full border-0 pl-9 shadow-none"
            placeholder="Search Messenger"
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 md:p-2">
        {rooms.length > 0 ? (
          <div className="flex flex-col gap-1" aria-label="Conversation list">
            {rooms.map((room) => {
              const lastMessage = getLastMessage(room)
              const isSelected = room.id === selectedRoomId

              return (
                <button
                  key={room.id}
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors",
                    isSelected ? "bg-muted" : "hover:bg-muted/70"
                  )}
                  onClick={() => onSelectRoom(room.id)}
                >
                  <Avatar size="lg" className="relative">
                    <AvatarFallback>{room.initials}</AvatarFallback>
                    {room.online ? <AvatarBadge aria-label="Online" /> : null}
                  </Avatar>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold">{room.name}</span>
                      {room.muted ? (
                        <Badge variant="secondary" className="shrink-0">
                          Muted
                        </Badge>
                      ) : null}
                    </span>
                    <span className="text-muted-foreground mt-0.5 block truncate text-xs">
                      {getMessagePreview(lastMessage)}
                    </span>
                    <span className="text-muted-foreground mt-1 block text-xs">
                      {getRoomSubtitle(room)}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-2">
                    <span className="text-muted-foreground text-xs">
                      {formatRoomTime(lastMessage?.createdAt)}
                    </span>
                    {room.unreadCount ? <Badge>{room.unreadCount}</Badge> : null}
                  </span>
                </button>
              )
            })}
          </div>
        ) : (
          <div className="text-muted-foreground flex h-full items-center justify-center rounded-2xl border border-dashed p-8 text-center text-sm">
            No conversations match your search.
          </div>
        )}
      </div>
    </section>
  )
}

function MockImage({ title, subtitle, className }: ImageAttachment & { className?: string }) {
  return (
    <div
      role="img"
      aria-label={`${title}${subtitle ? `: ${subtitle}` : ""}`}
      className={cn("bg-muted w-72 max-w-full overflow-hidden rounded-3xl border", className)}
    >
      <div className="grid h-44 grid-cols-[1.3fr_0.7fr] gap-1 p-1">
        <div className="bg-primary/20 flex items-center justify-center rounded-2xl">
          <ImageIcon className="text-primary" />
        </div>
        <div className="grid gap-1">
          <div className="bg-background rounded-2xl" />
          <div className="bg-primary/15 rounded-2xl" />
        </div>
      </div>
      <div className="bg-background/90 border-t px-4 py-3">
        <p className="text-sm font-medium">{title}</p>
        {subtitle ? <p className="text-muted-foreground text-xs">{subtitle}</p> : null}
      </div>
    </div>
  )
}

function MessageImage({ image, className }: { image: ImageAttachment; className?: string }) {
  if (!image.src) {
    return <MockImage {...image} className={className} />
  }

  return (
    <figure
      className={cn("bg-muted w-72 max-w-full overflow-hidden rounded-3xl border", className)}
    >
      <img src={image.src} alt={image.title} className="max-h-72 w-full object-cover" />
      <figcaption className="bg-background/90 border-t px-4 py-3">
        <p className="text-sm font-medium">{image.title}</p>
        {image.subtitle ? <p className="text-muted-foreground text-xs">{image.subtitle}</p> : null}
      </figcaption>
    </figure>
  )
}

function MessageBubble({
  room,
  message,
  groupPosition,
  showAvatar,
  showName,
  showTime,
  onReply,
}: {
  room: Room
  message: Message
  groupPosition: MessageGroupPosition
  showAvatar: boolean
  showName: boolean
  showTime: boolean
  onReply: (message: Message) => void
}) {
  if (message.senderId === "system") {
    return (
      <div className="flex justify-center">
        <Badge variant="secondary">{message.content}</Badge>
      </div>
    )
  }

  const isMine = message.senderId === CURRENT_USER.id
  const author = getMessageAuthor(room, message)
  const bubbleShapeClass = getBubbleShapeClass(isMine, groupPosition)
  const groupedStackOffsetClass =
    groupPosition === "middle" || groupPosition === "end" ? "-mt-0.5" : ""

  return (
    <div className={cn("flex flex-col gap-1", groupedStackOffsetClass)}>
      {showName ? (
        <div className="pl-10">
          <span className="text-muted-foreground text-xs font-medium">{author.name}</span>
        </div>
      ) : null}
      <div className={cn("group flex items-end gap-2", isMine && "justify-end")}>
        {!isMine ? (
          <div className="flex w-8 shrink-0 items-end">
            {showAvatar ? (
              <Avatar size="sm">
                <AvatarFallback>{author.initials}</AvatarFallback>
              </Avatar>
            ) : null}
          </div>
        ) : null}
        <div
          className={cn(
            "flex max-w-[min(22rem,82vw)] flex-col gap-1 sm:max-w-[70%]",
            isMine ? "items-end" : "items-start"
          )}
        >
          {message.replyTo ? (
            <div
              className={cn(
                "max-w-full rounded-2xl px-3 py-2 text-xs",
                isMine ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
              )}
            >
              <p className="font-medium">Replying to {message.replyTo.author}</p>
              <p className="mt-0.5 line-clamp-2">{message.replyTo.text}</p>
            </div>
          ) : null}
          {message.image ? (
            <MessageImage image={message.image} className={bubbleShapeClass} />
          ) : null}
          {message.content ? (
            <p
              className={cn(
                "px-4 py-2.5 text-sm leading-6 whitespace-pre-wrap shadow-xs",
                bubbleShapeClass,
                isMine ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
              )}
            >
              {message.content}
            </p>
          ) : null}
        </div>
      </div>
      <div className={cn("flex", isMine ? "justify-end" : "pl-10")}>
        <div
          className={cn(
            "flex max-w-[min(22rem,82vw)] items-center gap-1.5 px-1 sm:max-w-[70%]",
            isMine ? "justify-end" : "justify-start"
          )}
        >
          {message.reaction ? (
            <Badge variant="secondary" className="gap-1">
              <ThumbsUpIcon className="size-3.5" />
              {message.reaction}
            </Badge>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground h-6 rounded-full px-2 text-[11px]"
            onClick={() => onReply(message)}
          >
            Reply
          </Button>
          {showTime ? (
            <span className="text-muted-foreground text-[11px]">
              {formatMessageTime(message.createdAt)}
            </span>
          ) : null}
          {isMine && showTime && message.read ? (
            <CheckCheckIcon className="text-primary size-3.5" aria-label="Read" />
          ) : null}
        </div>
      </div>
    </div>
  )
}

function TypingIndicator({ room }: { room: Room }) {
  const participant =
    room.participants.find((item) => item.id !== CURRENT_USER.id) ?? room.participants[0]

  return (
    <div className="flex items-end gap-2 pl-0">
      <Avatar size="sm">
        <AvatarFallback>{participant.initials}</AvatarFallback>
      </Avatar>
      <div className="bg-muted flex items-center gap-1 rounded-[1.25rem] rounded-bl-md px-4 py-3">
        <span className="bg-muted-foreground/60 size-1.5 rounded-full" />
        <span className="bg-muted-foreground/60 size-1.5 rounded-full" />
        <span className="bg-muted-foreground/60 size-1.5 rounded-full" />
      </div>
    </div>
  )
}

function RoomPane({
  room,
  composerValue,
  attachedImage,
  replyTo,
  showBackButton = false,
  onBack,
  onOpenDetail,
  onComposerChange,
  onAttachImage,
  onRemoveImage,
  onClearReply,
  onReply,
  onSend,
}: {
  room: Room
  composerValue: string
  attachedImage: ImageAttachment | null
  replyTo: ReplyPreview | null
  showBackButton?: boolean
  onBack?: () => void
  onOpenDetail: () => void
  onComposerChange: (value: string) => void
  onAttachImage: () => void
  onRemoveImage: () => void
  onClearReply: () => void
  onReply: (message: Message) => void
  onSend: () => void
}) {
  const canSend = composerValue.trim().length > 0 || attachedImage
  const subtitle = getRoomSubtitle(room)

  return (
    <section className="bg-muted/40 flex h-full min-h-0 flex-col p-0 md:p-3">
      <div className="bg-card flex min-h-0 flex-1 flex-col overflow-hidden rounded-none md:rounded-2xl md:border">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b px-3 py-2.5 sm:px-4 sm:py-3">
          <div className="flex min-w-0 items-center gap-2">
            {showBackButton && onBack ? (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Back to chat list"
                onClick={onBack}
              >
                <ArrowLeftIcon />
              </Button>
            ) : null}
            <Avatar size="lg" className="relative">
              <AvatarFallback>{room.initials}</AvatarFallback>
              {room.online ? <AvatarBadge aria-label="Online" /> : null}
            </Avatar>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-sm font-semibold sm:text-base">{room.name}</h2>
                {room.online ? (
                  <Badge variant="secondary" className="hidden sm:inline-flex">
                    Active now
                  </Badge>
                ) : null}
              </div>
              <p className="text-muted-foreground truncate text-xs">{subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Start voice call"
              className="hidden sm:inline-flex"
            >
              <PhoneIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Start video call"
              className="hidden sm:inline-flex"
            >
              <VideoIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Conversation info"
              onClick={onOpenDetail}
            >
              <InfoIcon />
            </Button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-4 sm:py-5">
          <div className="mx-auto flex w-full flex-col gap-4">
            {room.messages.map((message, index) => {
              const groupPosition = getMessageGroupPosition(room.messages, index)
              const isMine = message.senderId === CURRENT_USER.id
              const showAvatar = !isMine && (groupPosition === "single" || groupPosition === "end")
              const showName =
                room.type === "group" &&
                !isMine &&
                (groupPosition === "single" || groupPosition === "start")
              const showTime = groupPosition === "single" || groupPosition === "end"

              return (
                <MessageBubble
                  key={message.id}
                  room={room}
                  message={message}
                  groupPosition={groupPosition}
                  showAvatar={showAvatar}
                  showName={showName}
                  showTime={showTime}
                  onReply={onReply}
                />
              )
            })}
          </div>
          {room.online ? <TypingIndicator room={room} /> : null}
        </div>

        <footer className="bg-card/95 shrink-0 border-t px-3 py-2 [padding-bottom:calc(0.5rem+env(safe-area-inset-bottom))] sm:px-4 sm:py-3">
          {replyTo ? (
            <div className="bg-muted mb-2 flex items-start justify-between gap-3 rounded-2xl px-3 py-2">
              <div className="min-w-0 text-xs">
                <p className="font-medium">Replying to {replyTo.author}</p>
                <p className="text-muted-foreground line-clamp-1">{replyTo.text}</p>
              </div>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Cancel reply"
                onClick={onClearReply}
              >
                <XIcon />
              </Button>
            </div>
          ) : null}
          {attachedImage ? (
            <div className="bg-muted mb-2 flex items-center justify-between gap-3 rounded-2xl px-3 py-2">
              <div className="flex min-w-0 items-center gap-3">
                {attachedImage.src ? (
                  <img
                    src={attachedImage.src}
                    alt="Selected attachment"
                    className="size-10 rounded-xl object-cover"
                  />
                ) : (
                  <div className="bg-background flex size-10 items-center justify-center rounded-xl">
                    <ImageIcon className="text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0 text-xs">
                  <p className="truncate font-medium">{attachedImage.title}</p>
                  <p className="text-muted-foreground truncate">Ready to send</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Remove attachment"
                onClick={onRemoveImage}
              >
                <XIcon />
              </Button>
            </div>
          ) : null}
          <div className="bg-muted flex items-end gap-1 rounded-[1.75rem] p-1.5">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Add attachment"
              onClick={onAttachImage}
            >
              <PlusIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Attach image"
              onClick={onAttachImage}
            >
              <ImageIcon />
            </Button>
            <textarea
              value={composerValue}
              rows={1}
              aria-label="Message input"
              placeholder={`Message ${room.name}`}
              className="bg-background placeholder:text-muted-foreground focus-visible:ring-ring/50 min-h-10 min-w-0 flex-1 resize-none rounded-[1.5rem] border-0 px-4 py-2.5 text-sm leading-5 shadow-none outline-none focus-visible:ring-2"
              onChange={(event) => onComposerChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault()
                  onSend()
                }
              }}
            />
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Choose emoji"
              className="hidden sm:inline-flex"
            >
              <SmileIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Record voice message"
              className="hidden sm:inline-flex"
            >
              <MicIcon />
            </Button>
            <Button size="icon-sm" aria-label="Send message" disabled={!canSend} onClick={onSend}>
              <SendIcon />
            </Button>
          </div>
        </footer>
      </div>
    </section>
  )
}

function DetailPane({
  room,
  compact = false,
  onBack,
  onClose,
}: {
  room: Room
  compact?: boolean
  onBack?: () => void
  onClose?: () => void
}) {
  const media = room.messages
    .filter((message) => message.image)
    .map((message) => message.image as ImageAttachment)

  return (
    <aside
      className={cn("bg-card flex h-full min-h-0 flex-col overflow-hidden", !compact && "border-l")}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          {compact && onBack ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Back to conversation"
              onClick={onBack}
            >
              <ArrowLeftIcon />
            </Button>
          ) : null}
          <p className="text-sm font-semibold">
            {room.type === "group" ? "Group info" : "Conversation info"}
          </p>
        </div>
        {!compact && onClose ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close conversation info"
            onClick={onClose}
          >
            <PanelRightCloseIcon />
          </Button>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
        <section className="bg-muted/50 rounded-[1.5rem] p-5 text-center">
          <Avatar size="lg" className="relative mx-auto">
            <AvatarFallback>{room.initials}</AvatarFallback>
            {room.online ? <AvatarBadge aria-label="Online" /> : null}
          </Avatar>
          <h2 className="mt-3 text-lg font-semibold">{room.name}</h2>
          <p className="text-muted-foreground mt-1 text-sm">{getRoomSubtitle(room)}</p>
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <UsersIcon className="text-muted-foreground size-4" aria-hidden="true" />
            <span>Members</span>
          </div>
          <div className="flex flex-col gap-2">
            {room.participants.map((participant) => (
              <div
                key={participant.id}
                className="hover:bg-muted/60 flex items-center gap-3 rounded-2xl p-2"
              >
                <Avatar size="sm" className="relative">
                  <AvatarFallback>{participant.initials}</AvatarFallback>
                  {participant.online ? <AvatarBadge aria-label="Online" /> : null}
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{participant.name}</p>
                  {participant.role ? (
                    <p className="text-muted-foreground truncate text-xs">{participant.role}</p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">Shared media</h3>
            <span className="text-muted-foreground text-xs">{media.length} items</span>
          </div>
          {media.length > 0 ? (
            <div className="grid grid-cols-3 gap-2">
              {media.map((image, index) =>
                image.src ? (
                  <img
                    key={`${image.title}-${index}`}
                    src={image.src}
                    alt={image.title}
                    className="aspect-square rounded-2xl object-cover"
                  />
                ) : (
                  <div
                    key={`${image.title}-${index}`}
                    className="bg-muted flex aspect-square items-center justify-center rounded-2xl border"
                    aria-label={image.title}
                    role="img"
                  >
                    <ImageIcon className="text-primary" />
                  </div>
                )
              )}
            </div>
          ) : (
            <div className="text-muted-foreground rounded-3xl border border-dashed p-6 text-center text-sm">
              No shared media yet.
            </div>
          )}
        </section>
      </div>
    </aside>
  )
}

export default function MessengerPage() {
  const [rooms, setRooms] = useState(seedRooms)
  const [selectedRoomId, setSelectedRoomId] = useState(seedRooms[0]?.id ?? "")
  const [searchValue, setSearchValue] = useState("")
  const [composerValue, setComposerValue] = useState("")
  const [attachedImage, setAttachedImage] = useState<ImageAttachment | null>(null)
  const [replyTo, setReplyTo] = useState<ReplyPreview | null>(null)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [mobileScreen, setMobileScreen] = useState<MobileScreen>("list")
  const [hasLoadedStorage, setHasLoadedStorage] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try {
      const storedValue = window.localStorage.getItem(STORAGE_KEY)
      if (!storedValue) {
        setHasLoadedStorage(true)
        return
      }

      const parsedValue: unknown = JSON.parse(storedValue)
      if (isPersistedState(parsedValue)) {
        setRooms(parsedValue.rooms)
        setSelectedRoomId(parsedValue.selectedRoomId)
        setIsDetailOpen(Boolean(parsedValue.isDetailOpen))
      }
    } finally {
      setHasLoadedStorage(true)
    }
  }, [])

  useEffect(() => {
    if (!hasLoadedStorage) {
      return
    }

    const payload: PersistedMessengerState = {
      rooms,
      selectedRoomId,
      isDetailOpen,
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  }, [hasLoadedStorage, isDetailOpen, rooms, selectedRoomId])

  const filteredRooms = useMemo(() => {
    const normalizedSearchValue = searchValue.trim().toLowerCase()
    if (!normalizedSearchValue) {
      return rooms
    }

    return rooms.filter((room) => {
      const preview = getMessagePreview(getLastMessage(room)).toLowerCase()
      return (
        room.name.toLowerCase().includes(normalizedSearchValue) ||
        room.role.toLowerCase().includes(normalizedSearchValue) ||
        preview.includes(normalizedSearchValue)
      )
    })
  }, [rooms, searchValue])

  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) ?? rooms[0]

  const selectRoom = (roomId: string) => {
    setSelectedRoomId(roomId)
    setReplyTo(null)
    setAttachedImage(null)
    setComposerValue("")
    setRooms((previousRooms) =>
      previousRooms.map((room) => (room.id === roomId ? { ...room, unreadCount: 0 } : room))
    )
  }

  const selectMobileRoom = (roomId: string) => {
    selectRoom(roomId)
    setMobileScreen("room")
  }

  const openReply = (message: Message) => {
    const room = rooms.find((item) => item.id === selectedRoomId)
    if (!room) {
      return
    }

    const author = getMessageAuthor(room, message)
    setReplyTo({
      messageId: message.id,
      author: author.name,
      text: getReplyText(message),
    })
  }

  const sendMessage = () => {
    if (!selectedRoom || (!composerValue.trim() && !attachedImage)) {
      return
    }

    const nextMessage: Message = {
      id: `local-${Date.now()}`,
      senderId: CURRENT_USER.id,
      content: composerValue.trim() || undefined,
      image: attachedImage ?? undefined,
      replyTo: replyTo ?? undefined,
      createdAt: new Date().toISOString(),
      read: true,
    }

    setRooms((previousRooms) =>
      previousRooms.map((room) =>
        room.id === selectedRoom.id
          ? { ...room, messages: [...room.messages, nextMessage], unreadCount: 0 }
          : room
      )
    )
    setComposerValue("")
    setAttachedImage(null)
    setReplyTo(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    const reader = new FileReader()
    reader.addEventListener("load", () => {
      if (typeof reader.result !== "string") {
        return
      }

      setAttachedImage({
        src: reader.result,
        title: file.name,
        subtitle: `${Math.max(1, Math.round(file.size / 1024))} KB`,
      })
    })
    reader.readAsDataURL(file)
  }

  if (!selectedRoom) {
    return (
      <div className="flex h-[calc(100svh-10.5rem)] items-center justify-center border border-dashed md:h-[calc(100svh-6.5rem)] md:rounded-[1.75rem]">
        <p className="text-muted-foreground text-sm">No conversations available.</p>
      </div>
    )
  }

  return (
    <div className="h-[calc(100svh-10.5rem)] min-h-[32rem] w-full overflow-hidden md:h-[calc(100svh-6.5rem)] md:rounded-[1.75rem] md:border">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={handleFileChange}
      />

      <main className="h-full min-h-0 md:hidden">
        {mobileScreen === "list" ? (
          <ChatListPane
            rooms={filteredRooms}
            selectedRoomId={selectedRoomId}
            searchValue={searchValue}
            onSearchChange={setSearchValue}
            onSelectRoom={selectMobileRoom}
          />
        ) : null}

        {mobileScreen === "room" ? (
          <RoomPane
            room={selectedRoom}
            composerValue={composerValue}
            attachedImage={attachedImage}
            replyTo={replyTo}
            showBackButton={true}
            onBack={() => setMobileScreen("list")}
            onOpenDetail={() => setMobileScreen("detail")}
            onComposerChange={setComposerValue}
            onAttachImage={() => fileInputRef.current?.click()}
            onRemoveImage={() => setAttachedImage(null)}
            onClearReply={() => setReplyTo(null)}
            onReply={openReply}
            onSend={sendMessage}
          />
        ) : null}

        {mobileScreen === "detail" ? (
          <DetailPane room={selectedRoom} compact={true} onBack={() => setMobileScreen("room")} />
        ) : null}
      </main>

      <main
        className={cn(
          "hidden h-full min-h-0 overflow-hidden transition-[grid-template-columns] duration-300 ease-out md:grid",
          getDesktopGridClass(isDetailOpen)
        )}
      >
        <ChatListPane
          rooms={filteredRooms}
          selectedRoomId={selectedRoomId}
          searchValue={searchValue}
          onSearchChange={setSearchValue}
          onSelectRoom={selectRoom}
        />

        <div className={cn("h-full min-h-0", isDetailOpen && "hidden lg:block")}>
          <RoomPane
            room={selectedRoom}
            composerValue={composerValue}
            attachedImage={attachedImage}
            replyTo={replyTo}
            onOpenDetail={() => setIsDetailOpen((value) => !value)}
            onComposerChange={setComposerValue}
            onAttachImage={() => fileInputRef.current?.click()}
            onRemoveImage={() => setAttachedImage(null)}
            onClearReply={() => setReplyTo(null)}
            onReply={openReply}
            onSend={sendMessage}
          />
        </div>

        {isDetailOpen ? (
          <DetailPane room={selectedRoom} onClose={() => setIsDetailOpen(false)} />
        ) : null}
      </main>
    </div>
  )
}
