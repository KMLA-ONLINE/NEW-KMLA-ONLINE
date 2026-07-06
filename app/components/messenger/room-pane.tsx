import { useEffect, useRef, useState } from "react"
import { ArrowLeftIcon, InfoIcon, PhoneIcon } from "lucide-react"

import { MessageActionPanel } from "~/components/messenger/message-actions"
import { MessageComposer } from "~/components/messenger/message-composer"
import { MessageList } from "~/components/messenger/message-list"
import { Avatar, AvatarFallback } from "~/components/ui/avatar"
import { Button } from "~/components/ui/button"
import { getRoomSubtitle, isDeletedMessage } from "~/lib/messenger/utils"
import type { Message, ReplyPreview, Room } from "~/lib/messenger/types"

export function RoomPane({
  room,
  replyTo,
  showBackButton = false,
  onBack,
  onOpenDetail,
  onAttachFile,
  onClearReply,
  onReply,
  onReact,
  onDelete,
  onSend,
}: {
  room: Room
  replyTo: ReplyPreview | null
  showBackButton?: boolean
  onBack?: () => void
  onOpenDetail: () => void
  onAttachFile: () => void
  onClearReply: () => void
  onReply: (message: Message) => void
  onReact: (message: Message, reaction: string) => void
  onDelete: (message: Message) => void
  onSend: (draft: string) => boolean
}) {
  const subtitle = getRoomSubtitle(room)
  const messagesViewportRef = useRef<HTMLDivElement>(null)
  const previousRoomIdRef = useRef<string | null>(null)
  const lastMessageId = room.messages[room.messages.length - 1]?.id
  const [isMessageListReady, setIsMessageListReady] = useState(!showBackButton)
  const [isActionPanelOpen, setIsActionPanelOpen] = useState(false)
  const [activeActionMessage, setActiveActionMessage] = useState<Message | null>(null)

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
    if (!isMessageListReady) {
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
  }, [isMessageListReady, room.id, lastMessageId])

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

        <div
          ref={messagesViewportRef}
          className="messenger-scrollbar min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-3 py-4 sm:px-4 sm:py-5"
        >
          {isMessageListReady ? (
            <MessageList
              room={room}
              onReply={onReply}
              onReact={onReact}
              onDelete={onDelete}
              onOpenActions={openActionPanel}
              activeMobileActionMessageId={
                isActionPanelOpen ? (activeActionMessage?.id ?? null) : null
              }
              onCloseActions={() => handleActionPanelChange(false)}
            />
          ) : null}
        </div>

        <MessageActionPanel
          key={activeActionMessage?.id ?? "message-actions"}
          message={activeActionMessage}
          open={isActionPanelOpen}
          onOpenChange={handleActionPanelChange}
          onReply={onReply}
          onDelete={onDelete}
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
