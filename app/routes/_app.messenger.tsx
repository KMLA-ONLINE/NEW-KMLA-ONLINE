import { memo, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react"
import { useLocation, useNavigate, useParams } from "react-router"
import {
  ArrowLeftIcon,
  CameraIcon,
  CheckCheckIcon,
  ImageIcon,
  InfoIcon,
  PanelRightCloseIcon,
  PhoneIcon,
  PlusIcon,
  ReplyIcon,
  SearchIcon,
  SendIcon,
  SmileIcon,
  ThumbsUpIcon,
  UsersIcon,
  VideoIcon,
  XIcon,
} from "lucide-react"

import { Avatar, AvatarFallback } from "~/components/ui/avatar"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { cn } from "~/lib/utils"

type RoomType = "direct" | "group"
type MessageGroupPosition = "single" | "start" | "middle" | "end"

type Participant = {
  id: string
  name: string
  initials: string
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
  participants: Participant[]
  messages: Message[]
  unreadCount?: number
  muted?: boolean
}

type PersistedMessengerState = {
  rooms: Room[]
}

export const handle = {
  mobileContentPadding: "none",
}

const CURRENT_USER: Participant = {
  id: "me",
  name: "You",
  initials: "ME",
}

const STORAGE_KEY = "kmla-online:messenger:v1"

const seedRooms: Room[] = [
  {
    id: "room-minji",
    type: "direct",
    name: "Minji Kang",
    initials: "MK",
    participants: [CURRENT_USER, { id: "minji", name: "Minji Kang", initials: "MK" }],
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
    participants: [
      CURRENT_USER,
      { id: "daniel", name: "Daniel Choi", initials: "DC" },
      { id: "sora", name: "Sora Han", initials: "SH" },
      { id: "yujin", name: "Yujin Seo", initials: "YS" },
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
    muted: true,
    participants: [CURRENT_USER, { id: "junseo", name: "Junseo Park", initials: "JP" }],
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
    unreadCount: 5,
    participants: [
      CURRENT_USER,
      { id: "arin", name: "Arin Moon", initials: "AM" },
      { id: "tae", name: "Tae Kim", initials: "TK" },
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
    participants: [CURRENT_USER, { id: "library", name: "Library Desk", initials: "LD" }],
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
    participants: [CURRENT_USER, { id: "hani", name: "Hani Lee", initials: "HL" }],
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
        return "rounded-[1.25rem] rounded-br-none"
      case "middle":
        return "rounded-[1.25rem] rounded-tr-none rounded-br-none"
      case "end":
        return "rounded-[1.25rem] rounded-tr-none"
      default:
        return "rounded-[1.25rem]"
    }
  }

  switch (groupPosition) {
    case "start":
      return "rounded-[1.25rem] rounded-bl-none"
    case "middle":
      return "rounded-[1.25rem] rounded-tl-none rounded-bl-none"
    case "end":
      return "rounded-[1.25rem] rounded-tl-none"
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
  return room.type === "group" ? `${room.participants.length} members` : ""
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
  return Array.isArray(candidate.rooms)
}

function ChatListPane({
  rooms,
  selectedRoomId,
  searchValue,
  onSearchChange,
  onSelectRoom,
}: {
  rooms: Room[]
  selectedRoomId: string | null
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

      <div className="messenger-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-[calc(0.75rem+4rem+env(safe-area-inset-bottom))] md:p-2">
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
                  <Avatar size="lg">
                    <AvatarFallback>{room.initials}</AvatarFallback>
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
      className={cn(
        "bg-muted w-72 max-w-[14rem] overflow-hidden rounded-3xl border sm:max-w-[16rem]",
        className
      )}
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
  const bubbleToneClass = isMine ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"

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
            "flex max-w-[min(20rem,70%)] flex-col gap-1 sm:max-w-[70%]",
            isMine ? "items-end" : "items-start"
          )}
        >
          {message.replyTo ? (
            <div
              className={cn("flex max-w-full flex-col gap-1", isMine ? "items-end" : "items-start")}
            >
              <div className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                <ReplyIcon className="size-3.5" />
                <span>{message.replyTo.author}</span>
              </div>
              <div
                className={cn(
                  "bg-muted text-muted-foreground max-w-[calc(100%-1.25rem)] rounded-2xl px-2.5 pt-1.5 pb-4 text-sm",
                  isMine ? "rounded-br-md" : "rounded-bl-md"
                )}
              >
                <div className="line-clamp-3 whitespace-pre-wrap">{message.replyTo.text}</div>
              </div>
            </div>
          ) : null}
          {message.content || message.image ? (
            <div className={cn("flex flex-col gap-1", message.replyTo ? "-mt-4" : "")}>
              <div className={cn("px-3 py-2", bubbleShapeClass, bubbleToneClass)}>
                {message.content ? (
                  <p className="text-sm leading-5 whitespace-pre-wrap">{message.content}</p>
                ) : null}
                {message.image ? (
                  <MessageImage
                    image={message.image}
                    className={cn(message.content ? "mt-2" : "", "max-w-[14rem] sm:max-w-[16rem]")}
                  />
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <div className={cn("flex", isMine ? "justify-end" : "pl-10")}>
        <div
          className={cn(
            "-mt-0.5 flex max-w-[min(20rem,70%)] items-center gap-1.5 px-1 sm:max-w-[70%]",
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

const MessageList = memo(function MessageList({
  room,
  onReply,
}: {
  room: Room
  onReply: (message: Message) => void
}) {
  return (
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
  )
})

function RoomPane({
  room,
  attachedImage,
  replyTo,
  showBackButton = false,
  onBack,
  onOpenDetail,
  onAttachImage,
  onRemoveImage,
  onClearReply,
  onReply,
  onSend,
}: {
  room: Room
  attachedImage: ImageAttachment | null
  replyTo: ReplyPreview | null
  showBackButton?: boolean
  onBack?: () => void
  onOpenDetail: () => void
  onAttachImage: () => void
  onRemoveImage: () => void
  onClearReply: () => void
  onReply: (message: Message) => void
  onSend: (draft: string) => boolean
}) {
  const [draft, setDraft] = useState("")
  const canSend = draft.trim().length > 0 || attachedImage
  const subtitle = getRoomSubtitle(room)
  const messagesViewportRef = useRef<HTMLDivElement>(null)
  const lastMessageId = room.messages[room.messages.length - 1]?.id
  const [isComposerFocused, setIsComposerFocused] = useState(false)

  useEffect(() => {
    const viewport = messagesViewportRef.current
    if (!viewport) {
      return
    }

    const frameId = window.requestAnimationFrame(() => {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" })
    })

    return () => window.cancelAnimationFrame(frameId)
  }, [room.id, lastMessageId])

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
            <Avatar size="lg">
              <AvatarFallback>{room.initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-sm font-semibold sm:text-base">{room.name}</h2>
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

        <div
          ref={messagesViewportRef}
          className="messenger-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-4 sm:py-5"
        >
          <MessageList room={room} onReply={onReply} />
        </div>

        <footer className="bg-card/95 shrink-0 [padding-bottom:calc(0.5rem+env(safe-area-inset-bottom))] md:px-3 md:py-2">
          {replyTo ? (
            <div className="bg-muted mb-2 flex items-start justify-between gap-3 rounded-2xl px-3 py-2">
              <div className="min-w-0 text-xs">
                <p className="font-medium">{replyTo.author}에게 답장</p>
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
          <div className="flex items-center gap-1 p-1.5">
            <div
              className={cn(
                "flex origin-left items-center gap-1 overflow-hidden transition-[max-width,opacity,transform,margin] duration-200 ease-out motion-reduce:transition-none",
                isComposerFocused
                  ? "max-sm:-mr-1 max-sm:max-w-0 max-sm:scale-95 max-sm:opacity-0"
                  : "max-sm:max-w-32 max-sm:opacity-100"
              )}
            >
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
                aria-label="Open camera"
                className="sm:hidden"
                onClick={onAttachImage}
              >
                <CameraIcon />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Attach image"
                onClick={onAttachImage}
              >
                <ImageIcon />
              </Button>
            </div>

            <div className="flex min-w-0 flex-1 items-center self-stretch transition-[flex-basis] duration-200 ease-out motion-reduce:transition-none">
              <textarea
                value={draft}
                rows={1}
                aria-label="Message input"
                placeholder={`Aa`}
                className="bg-muted placeholder:text-muted-foreground min-h-10 min-w-0 flex-1 resize-none rounded-[1.5rem] border-0 px-4 py-2 text-sm leading-5 shadow-none outline-none"
                onChange={(event) => setDraft(event.target.value)}
                onFocus={() => setIsComposerFocused(true)}
                onBlur={() => setIsComposerFocused(false)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault()
                    if (onSend(draft)) {
                      setDraft("")
                    }
                  }
                }}
              />
            </div>

            <Button
              variant={isComposerFocused ? "default" : "ghost"}
              size="icon-sm"
              aria-label={isComposerFocused ? "Send message" : "Choose emoji"}
              disabled={isComposerFocused ? !canSend : false}
              className="relative shrink-0 overflow-hidden transition-[background-color,color,border-color] duration-200 ease-out motion-reduce:transition-none sm:hidden"
              onMouseDown={(event) => event.preventDefault()}
              onClick={
                isComposerFocused
                  ? () => {
                      if (onSend(draft)) {
                        setDraft("")
                      }
                    }
                  : undefined
              }
            >
              <span className="relative block size-4">
                <SmileIcon
                  className={cn(
                    "absolute inset-0 transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none",
                    isComposerFocused ? "scale-90 opacity-0" : "scale-100 opacity-100"
                  )}
                />
                <SendIcon
                  className={cn(
                    "absolute inset-0 transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none",
                    isComposerFocused ? "scale-100 opacity-100" : "scale-90 opacity-0"
                  )}
                />
              </span>
            </Button>

            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Choose emoji"
              className="hidden sm:inline-flex"
              onMouseDown={(event) => event.preventDefault()}
            >
              <SmileIcon />
            </Button>

            <Button
              size="icon-sm"
              aria-label="Send message"
              disabled={!canSend}
              className="hidden sm:inline-flex"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                if (onSend(draft)) {
                  setDraft("")
                }
              }}
            >
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

      <div className="messenger-scrollbar min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
        <section className="bg-muted/50 rounded-[1.5rem] p-5 text-center">
          <Avatar size="lg" className="mx-auto">
            <AvatarFallback>{room.initials}</AvatarFallback>
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
                <Avatar size="sm">
                  <AvatarFallback>{participant.initials}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{participant.name}</p>
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
  const [searchValue, setSearchValue] = useState("")
  const [attachedImage, setAttachedImage] = useState<ImageAttachment | null>(null)
  const [replyTo, setReplyTo] = useState<ReplyPreview | null>(null)
  const [hasLoadedStorage, setHasLoadedStorage] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const location = useLocation()
  const { roomId } = useParams()
  const isDetailOpen = location.pathname.endsWith("/details")
  const selectedRoomId = roomId ?? null

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
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  }, [hasLoadedStorage, rooms])

  const filteredRooms = useMemo(() => {
    const normalizedSearchValue = searchValue.trim().toLowerCase()
    if (!normalizedSearchValue) {
      return rooms
    }

    return rooms.filter((room) => {
      const preview = getMessagePreview(getLastMessage(room)).toLowerCase()
      return (
        room.name.toLowerCase().includes(normalizedSearchValue) ||
        getRoomSubtitle(room).toLowerCase().includes(normalizedSearchValue) ||
        preview.includes(normalizedSearchValue)
      )
    })
  }, [rooms, searchValue])

  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) ?? null

  const selectRoom = (roomId: string) => {
    setReplyTo(null)
    setAttachedImage(null)
    setRooms((previousRooms) =>
      previousRooms.map((room) => (room.id === roomId ? { ...room, unreadCount: 0 } : room))
    )
    navigate(isDetailOpen ? `/messenger/${roomId}/details` : `/messenger/${roomId}`)
  }

  const openReply = (message: Message) => {
    if (!selectedRoom) {
      return
    }

    const author = getMessageAuthor(selectedRoom, message)
    setReplyTo({
      messageId: message.id,
      author: author.name,
      text: getReplyText(message),
    })
  }

  const sendMessage = (draft: string) => {
    const nextContent = draft.trim()

    if (!selectedRoom || (!nextContent && !attachedImage)) {
      return false
    }

    const nextMessage: Message = {
      id: `local-${Date.now()}`,
      senderId: CURRENT_USER.id,
      content: nextContent || undefined,
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
    setAttachedImage(null)
    setReplyTo(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }

    return true
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

  if (rooms.length === 0) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center border border-dashed md:rounded-[1.75rem]">
        <p className="text-muted-foreground text-sm">No conversations available.</p>
      </div>
    )
  }

  return (
    <div className="h-full min-h-0 overflow-hidden md:min-h-[32rem] md:rounded-[1.75rem] md:border">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={handleFileChange}
      />

      <main className="h-full min-h-0 md:hidden">
        {!selectedRoom ? (
          <ChatListPane
            rooms={filteredRooms}
            selectedRoomId={selectedRoomId}
            searchValue={searchValue}
            onSearchChange={setSearchValue}
            onSelectRoom={selectRoom}
          />
        ) : null}

        {selectedRoom && !isDetailOpen ? (
          <RoomPane
            key={selectedRoom.id}
            room={selectedRoom}
            attachedImage={attachedImage}
            replyTo={replyTo}
            showBackButton={true}
            onBack={() => navigate("/messenger")}
            onOpenDetail={() => navigate(`/messenger/${selectedRoom.id}/details`)}
            onAttachImage={() => fileInputRef.current?.click()}
            onRemoveImage={() => setAttachedImage(null)}
            onClearReply={() => setReplyTo(null)}
            onReply={openReply}
            onSend={sendMessage}
          />
        ) : null}

        {selectedRoom && isDetailOpen ? (
          <DetailPane
            room={selectedRoom}
            compact={true}
            onBack={() => navigate(`/messenger/${selectedRoom.id}`)}
          />
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

        {selectedRoom ? (
          <>
            <div className={cn("h-full min-h-0", isDetailOpen && "hidden lg:block")}>
              <RoomPane
                key={selectedRoom.id}
                room={selectedRoom}
                attachedImage={attachedImage}
                replyTo={replyTo}
                onOpenDetail={() =>
                  navigate(
                    isDetailOpen
                      ? `/messenger/${selectedRoom.id}`
                      : `/messenger/${selectedRoom.id}/details`
                  )
                }
                onAttachImage={() => fileInputRef.current?.click()}
                onRemoveImage={() => setAttachedImage(null)}
                onClearReply={() => setReplyTo(null)}
                onReply={openReply}
                onSend={sendMessage}
              />
            </div>

            {isDetailOpen ? (
              <DetailPane
                room={selectedRoom}
                onClose={() => navigate(`/messenger/${selectedRoom.id}`)}
              />
            ) : null}
          </>
        ) : (
          <div className="flex min-h-[24rem] items-center justify-center">
            <div className="text-muted-foreground rounded-3xl border border-dashed p-8 text-center text-sm">
              Select a conversation to start chatting.
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
