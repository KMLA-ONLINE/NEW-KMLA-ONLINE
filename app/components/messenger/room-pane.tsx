import { useEffect, useRef, useState } from "react"
import { ArrowDownIcon, ArrowLeftIcon, InfoIcon, PhoneIcon, PinIcon } from "lucide-react"

import { EmptyRoomState } from "~/components/messenger/empty-room-state"
import { ConversationAvatar } from "~/components/messenger/conversation-avatar"
import { MessageActionPanel } from "~/components/messenger/message-actions"
import { MessageComposer } from "~/components/messenger/message-composer"
import { MessageList } from "~/components/messenger/message-list"
import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import {
  getMessageAuthor,
  getPinnedMessages,
  getReplyText,
  getRoomSubtitle,
  isDeletedMessage,
} from "~/lib/messenger/utils"
import { useIsomorphicLayoutEffect } from "~/lib/use-isomorphic-layout-effect"
import type { ReactionType } from "~/lib/reactions"
import type { ConversationId, Message, MessageId, ReplyPreview, Room } from "~/lib/messenger/types"

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
  onDeleteMany,
  onTogglePin,
  onRetry,
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
  /** 모바일/태블릿 다중 선택 삭제 확정 시 호출(선택된 id 목록). */
  onDeleteMany: (messageIds: MessageId[]) => void
  onTogglePin: (message: Message) => void
  onRetry: (message: Message) => void
  onSend: (draft: string) => boolean
  focusedMessageId?: MessageId | null
  onFocusedMessageHandled?: () => void
}) {
  const subtitle = getRoomSubtitle(room)
  const latestPinnedMessage = getPinnedMessages(room)[0]
  const messagesViewportRef = useRef<HTMLDivElement>(null)
  const previousRoomIdRef = useRef<ConversationId | null>(null)
  const lastMessageId = room.messages[room.messages.length - 1]?.id
  const [isMessageListReady, setIsMessageListReady] = useState(!showBackButton)
  const [isActionPanelOpen, setIsActionPanelOpen] = useState(false)
  const [activeActionMessage, setActiveActionMessage] = useState<Message | null>(null)
  const [showScrollToBottom, setShowScrollToBottom] = useState(false)
  // 모바일/태블릿 다중 삭제 선택 모드. room.id가 바뀌면 RoomPane 자체가 key로 리마운트되므로
  // (messenger.tsx의 <RoomPane key={selectedRoom.id}>) 방을 옮기면 이 상태는 자동으로 초기화된다.
  const [isSelectingMessages, setIsSelectingMessages] = useState(false)
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<MessageId>>(new Set())
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)

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

  // 액션패널의 "삭제"는 이제 바로 지우지 않고, 누른 메시지를 미리 선택해 둔 채로 선택 모드에
  // 들어간다. 실제 삭제는 하단 고정 버튼 -> 확인 모달을 거쳐야 실행된다.
  const startMessageSelection = (message: Message) => {
    handleActionPanelChange(false)
    setIsSelectingMessages(true)
    setSelectedMessageIds(new Set([message.id]))
  }

  const toggleMessageSelection = (messageId: MessageId) => {
    setSelectedMessageIds((previous) => {
      const next = new Set(previous)
      if (next.has(messageId)) {
        next.delete(messageId)
      } else {
        next.add(messageId)
      }
      return next
    })
  }

  // 뒤로가기·취소·모달 닫기 모두 여기로 모인다 -- 부분 상태(선택은 남고 모달만 닫힘) 없이
  // 항상 일반 채팅 화면으로 완전히 돌아간다.
  const exitMessageSelection = () => {
    setIsSelectingMessages(false)
    setSelectedMessageIds(new Set())
    setIsConfirmingDelete(false)
  }

  const confirmSelectedDeletion = () => {
    onDeleteMany([...selectedMessageIds])
    exitMessageSelection()
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

    // 이 창이 숨겨져 있으면(상세/미디어/멤버 패널이 열려 RoomPane이 display:none인 동안) 위
    // scrollTo는 그냥 무시된다 -- 숨은 요소의 scrollHeight는 0이다. 그리고 패널을 닫아 다시
    // 보일 때는 room.id도 lastMessageId도 그대로라 이 effect가 재실행되지 않으므로, 그 사이
    // 늘어난 메시지만큼 바닥에서 벗어난 채로 남는다(드래그&드롭 전송은 패널이 열려 있어도
    // 동작한다). 다시 보이는 순간을 관측해 그때 바닥을 맞춘다.
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(() => {
      // 0 -> 실제 높이로 살아난 순간에만 손댄다. 사용자가 스스로 위로 올려 읽는 중에
      // 창 크기가 바뀌었다고 바닥으로 끌어내리면 안 된다.
      if (viewport.scrollHeight > 0 && viewport.scrollTop === 0) {
        viewport.scrollTo({ top: viewport.scrollHeight, behavior: "auto" })
      }
    })
    observer.observe(viewport)
    return () => observer.disconnect()
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
        {isSelectingMessages ? (
          <header className="relative flex shrink-0 items-center justify-center border-b px-3 py-2.5 sm:px-4 sm:py-3">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="선택 모드 종료"
              className="absolute left-3"
              onClick={exitMessageSelection}
            >
              <ArrowLeftIcon />
            </Button>
            <h2 className="text-sm font-semibold sm:text-base">메시지 삭제</h2>
          </header>
        ) : (
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
              <ConversationAvatar room={room} linkProfile />
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
        )}

        {!isSelectingMessages && latestPinnedMessage ? (
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
              room.messages.length === 0 ? (
                <EmptyRoomState room={room} />
              ) : (
                <MessageList
                  room={room}
                  reactionTypes={reactionTypes}
                  onReply={onReply}
                  onReact={onReact}
                  onDelete={onDelete}
                  onTogglePin={onTogglePin}
                  onRetry={onRetry}
                  onOpenActions={openActionPanel}
                  activeMobileActionMessageId={
                    isActionPanelOpen ? (activeActionMessage?.id ?? null) : null
                  }
                  onCloseActions={() => handleActionPanelChange(false)}
                  focusedMessageId={focusedMessageId}
                  onFocusedMessageHandled={onFocusedMessageHandled}
                  isSelectionMode={isSelectingMessages}
                  selectedMessageIds={selectedMessageIds}
                  onToggleMessageSelection={toggleMessageSelection}
                />
              )
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
          onStartSelection={startMessageSelection}
          onTogglePin={onTogglePin}
        />

        {isSelectingMessages ? (
          <footer className="bg-card/95 shrink-0 border-t px-3 py-3 [padding-bottom:calc(0.75rem+env(safe-area-inset-bottom))]">
            <Button
              type="button"
              variant="destructive"
              className="w-full"
              disabled={selectedMessageIds.size === 0}
              onClick={() => setIsConfirmingDelete(true)}
            >
              삭제 ({selectedMessageIds.size}개)
            </Button>
          </footer>
        ) : (
          <MessageComposer
            replyTo={replyTo}
            onAttachImage={onAttachImage}
            onAttachFile={onAttachFile}
            onClearReply={onClearReply}
            onSend={onSend}
          />
        )}
      </div>

      {/* 뒤로가기·취소·바깥 클릭으로 모달을 닫는 것 모두 exitMessageSelection으로 모아, 선택만
        남고 모달만 닫히는 중간 상태 없이 항상 일반 채팅 화면으로 돌아가게 한다. */}
      <Dialog open={isConfirmingDelete} onOpenChange={(open) => !open && exitMessageSelection()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedMessageIds.size}개의 메시지를 삭제할까요?</DialogTitle>
            <DialogDescription>모두에게서 삭제되며 복구할 수 없습니다.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={exitMessageSelection}>
              취소
            </Button>
            <Button type="button" variant="destructive" onClick={confirmSelectedDeletion}>
              삭제
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
