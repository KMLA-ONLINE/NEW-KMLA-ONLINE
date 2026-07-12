import { useEffect, useRef, useState } from "react"
import { ArrowDownIcon, ArrowLeftIcon, InfoIcon, PhoneIcon, PinIcon } from "lucide-react"

import { MessageActionPanel } from "~/components/messenger/message-actions"
import { MessageComposer } from "~/components/messenger/message-composer"
import { MessageList } from "~/components/messenger/message-list"
import { Avatar, AvatarFallback } from "~/components/ui/avatar"
import { Button } from "~/components/ui/button"
import {
  getMessageAuthor,
  getPinnedMessages,
  getReplyText,
  getRoomSubtitle,
  isDeletedMessage,
} from "~/lib/messenger/utils"
import { useIsomorphicLayoutEffect } from "~/lib/use-isomorphic-layout-effect"
import type { ReactionType } from "~/lib/reactions"
import type { Message, ReplyPreview, Room } from "~/lib/messenger/types"

export function RoomPane({
  room,
  reactionTypes,
  replyTo,
  showBackButton = false,
  onBack,
  onOpenDetail,
  onOpenPinnedMessages,
  onAttachImage,
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
  reactionTypes: ReactionType[]
  replyTo: ReplyPreview | null
  showBackButton?: boolean
  onBack?: () => void
  onOpenDetail: () => void
  onOpenPinnedMessages: () => void
  onAttachImage: () => void
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

  // 페인트 전에 내려야 한다. useEffect는 브라우저가 이미 그린 다음에 돌고, 거기서 rAF로 한
  // 프레임 더 미루면 "맨 위에 있는 대화"가 실제로 화면에 나왔다가 사라진다 -- 메시지가 많을수록
  // 그 프레임의 페인트가 길어서 눈에 띄게 깜빡인다.
  //
  // focusedMessageId is intentionally excluded from the deps: it flips back
  // to null once MessageList finishes scrolling to the focused message, and
  // reacting to that transition here would immediately re-scroll the
  // viewport to the bottom and undo it. Reading the latest value in the
  // body still skips the initial autoscroll when a room is opened via a
  // search result.
  useIsomorphicLayoutEffect(() => {
    if (!isMessageListReady || focusedMessageId) {
      return
    }

    const viewport = messagesViewportRef.current
    if (!viewport) {
      return
    }

    // 방을 처음 열 때는 즉시 바닥이고(애니메이션할 "이전 위치"가 없다), 같은 방에 메시지가
    // 하나 붙었을 때만 부드럽게 따라간다.
    const isSameRoom = previousRoomIdRef.current === room.id
    previousRoomIdRef.current = room.id
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: isSameRoom ? "smooth" : "auto" })
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
              className="flex w-full min-w-0 items-center gap-2 py-2.5 text-left"
            >
              <PinIcon className="text-muted-foreground mr-1 size-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="text-muted-foreground block text-[11px] leading-none font-medium">
                  {getMessageAuthor(room, latestPinnedMessage).name}
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
            data-scroll-container
            className="h-full overflow-x-hidden overflow-y-auto overscroll-contain px-3 py-4 sm:px-4 sm:py-5"
          >
            {isMessageListReady ? (
              <MessageList
                room={room}
                reactionTypes={reactionTypes}
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
          onTogglePin={onTogglePin}
        />

        <MessageComposer
          replyTo={replyTo}
          onAttachImage={onAttachImage}
          onAttachFile={onAttachFile}
          onClearReply={onClearReply}
          onSend={onSend}
        />
      </div>
    </section>
  )
}
