import { useEffect, useRef, useState } from "react"
import { ArrowDownIcon, ArrowLeftIcon, InfoIcon, PhoneIcon, PinIcon } from "lucide-react"

import { MessageActionPanel } from "~/components/messenger/message-actions"
import { MessageComposer } from "~/components/messenger/message-composer"
import { MessageList } from "~/components/messenger/message-list"
import { Avatar, AvatarFallback } from "~/components/ui/avatar"
import { Button } from "~/components/ui/button"
import {
  getPinnedMessages,
  getReplyText,
  getRoomSubtitle,
  isDeletedMessage,
} from "~/lib/messenger/utils"
import type { Message, ReplyPreview, Room } from "~/lib/messenger/types"

export function RoomPane({
  room,
  replyTo,
  showBackButton = false,
  onBack,
  onOpenDetail,
  onOpenPinnedMessages,
  onAttachFile,
  onClearReply,
  onReply,
  onReact,
  onDelete,
  onTogglePin,
  onSend,
  focusedMessageId,
  onFocusedMessageHandled,
}: {
  room: Room
  replyTo: ReplyPreview | null
  showBackButton?: boolean
  onBack?: () => void
  onOpenDetail: () => void
  onOpenPinnedMessages: () => void
  onAttachFile: () => void
  onClearReply: () => void
  onReply: (message: Message) => void
  onReact: (message: Message, reaction: string) => void
  onDelete: (message: Message) => void
  onTogglePin: (message: Message) => void
  onSend: (draft: string) => boolean
  focusedMessageId?: string | null
  onFocusedMessageHandled?: () => void
}) {
  const subtitle = getRoomSubtitle(room)
  const latestPinnedMessage = getPinnedMessages(room)[0]
  const messagesViewportRef = useRef<HTMLDivElement>(null)
  const previousRoomIdRef = useRef<string | null>(null)
  const lastMessageId = room.messages[room.messages.length - 1]?.id
  const [isMessageListReady, setIsMessageListReady] = useState(!showBackButton)
  const [isActionPanelOpen, setIsActionPanelOpen] = useState(false)
  const [activeActionMessage, setActiveActionMessage] = useState<Message | null>(null)
  const [showScrollToBottom, setShowScrollToBottom] = useState(false)

  const openActionPanel = (message: Message) => {
    if (isDeletedMessage(message)) {
      return
    }

    setActiveActionMessage(message)
    setIsActionPanelOpen(true)
  }

  const handleActionPanelChange = (nextOpen: boolean) => {
    setIsActionPanelOpen(nextOpen)

    if (!nextOpen) {
      setActiveActionMessage(null)
    }
  }

  useEffect(() => {
    if (!showBackButton) {
      return
    }

    const frameId = window.requestAnimationFrame(() => {
      setIsMessageListReady(true)
    })

    return () => window.cancelAnimationFrame(frameId)
  }, [showBackButton])

  useEffect(() => {
    // focusedMessageId is intentionally excluded from the deps: it flips back
    // to null once MessageList finishes scrolling to the focused message, and
    // reacting to that transition here would immediately re-scroll the
    // viewport to the bottom and undo it. Reading the latest value in the
    // body still skips the initial autoscroll when a room is opened via a
    // search result.
    if (!isMessageListReady || focusedMessageId) {
      return
    }

    const viewport = messagesViewportRef.current
    if (!viewport) {
      return
    }

    const isSameRoom = previousRoomIdRef.current === room.id
    const frameId = window.requestAnimationFrame(() => {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: isSameRoom ? "smooth" : "auto" })
      previousRoomIdRef.current = room.id
    })

    return () => window.cancelAnimationFrame(frameId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMessageListReady, room.id, lastMessageId])

  useEffect(() => {
    const viewport = messagesViewportRef.current
    if (!isMessageListReady || !viewport) {
      return
    }

    const SCROLL_TO_BOTTOM_THRESHOLD = 240
    const handleScroll = () => {
      const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
      setShowScrollToBottom(distanceFromBottom > SCROLL_TO_BOTTOM_THRESHOLD)
    }

    handleScroll()
    viewport.addEventListener("scroll", handleScroll, { passive: true })
    return () => viewport.removeEventListener("scroll", handleScroll)
  }, [isMessageListReady, room.id, lastMessageId])

  const scrollToBottom = () => {
    messagesViewportRef.current?.scrollTo({
      top: messagesViewportRef.current.scrollHeight,
      behavior: "smooth",
    })
  }

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
            {room.type === "direct" ? (
              <Button variant="ghost" size="icon-sm" aria-label="Start voice call">
                <PhoneIcon />
              </Button>
            ) : null}
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

        {latestPinnedMessage ? (
          <div className="border-b px-3 py-2 sm:px-4">
            <button
              type="button"
              onClick={onOpenPinnedMessages}
              className="bg-muted/60 hover:bg-muted flex w-full min-w-0 items-center gap-2 rounded-xl px-3 py-2.5 text-left transition-colors"
            >
              <PinIcon className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="text-muted-foreground block text-[11px] leading-none font-medium">
                  고정된 메시지
                </span>
                <span className="mt-0.5 block truncate text-sm">
                  {getReplyText(latestPinnedMessage)}
                </span>
              </span>
            </button>
          </div>
        ) : null}

        <div className="relative min-h-0 flex-1">
          <div
            ref={messagesViewportRef}
            className="messenger-scrollbar h-full overflow-x-hidden overflow-y-auto overscroll-contain px-3 py-4 sm:px-4 sm:py-5"
          >
            {isMessageListReady ? (
              <MessageList
                room={room}
                onReply={onReply}
                onReact={onReact}
                onDelete={onDelete}
                onTogglePin={onTogglePin}
                onOpenActions={openActionPanel}
                activeMobileActionMessageId={
                  isActionPanelOpen ? (activeActionMessage?.id ?? null) : null
                }
                onCloseActions={() => handleActionPanelChange(false)}
                focusedMessageId={focusedMessageId}
                onFocusedMessageHandled={onFocusedMessageHandled}
              />
            ) : null}
          </div>

          {showScrollToBottom ? (
            <button
              type="button"
              aria-label="맨 아래로 이동"
              onClick={scrollToBottom}
              className="bg-background text-foreground hover:bg-muted absolute bottom-4 left-1/2 z-10 flex size-10 -translate-x-1/2 items-center justify-center rounded-full border shadow-md transition-colors"
            >
              <ArrowDownIcon className="size-5" />
            </button>
          ) : null}
        </div>

        <MessageActionPanel
          key={activeActionMessage?.id ?? "message-actions"}
          message={activeActionMessage}
          open={isActionPanelOpen}
          onOpenChange={handleActionPanelChange}
          onReply={onReply}
          onDelete={onDelete}
          onPin={onTogglePin}
        />

        <MessageComposer
          replyTo={replyTo}
          onAttachFile={onAttachFile}
          onClearReply={onClearReply}
          onSend={onSend}
        />
      </div>
    </section>
  )
}
