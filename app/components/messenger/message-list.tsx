import { useEffect, useMemo, useRef, useState } from "react"

import { Badge } from "~/components/ui/badge"
import { MessageBubble } from "~/components/messenger/message-bubble"
import { CURRENT_USER } from "~/lib/messenger/constants"
import {
  formatMessageDateLabel,
  getMessageGroupPosition,
  getReplyText,
  isDeletedMessage,
  shouldSeparateMessages,
  shouldShowDateSeparator,
  shouldShowMessageTime,
} from "~/lib/messenger/utils"
import { cn } from "~/lib/utils"
import type { ReactionType } from "~/lib/reactions"
import type { Message, MessageId, Participant, ProfileId, Room } from "~/lib/messenger/types"

export function MessageList({
  room,
  reactionTypes,
  onReply,
  onReact,
  onDelete,
  onTogglePin,
  onRetry,
  onOpenActions,
  activeMobileActionMessageId,
  onCloseActions,
  focusedMessageId,
  onFocusedMessageHandled,
  isSelectionMode,
  selectedMessageIds,
  onToggleMessageSelection,
}: {
  room: Room
  reactionTypes: ReactionType[]
  onReply: (message: Message) => void
  onReact: (message: Message, reaction: string) => void
  onDelete: (message: Message) => void
  onTogglePin: (message: Message) => void
  onRetry: (message: Message) => void
  onOpenActions: (message: Message) => void
  activeMobileActionMessageId: MessageId | null
  onCloseActions: () => void
  focusedMessageId?: MessageId | null
  onFocusedMessageHandled?: () => void
  /** 모바일/태블릿 다중 삭제 선택 모드. room-pane.tsx가 롱프레스 액션패널의 "삭제"로 진입시킨다. */
  isSelectionMode: boolean
  selectedMessageIds: Set<MessageId>
  onToggleMessageSelection: (messageId: MessageId) => void
}) {
  const messages = room.messages
  const participants = room.participants
  const roomType = room.type
  const messageElementsRef = useRef(new Map<MessageId, HTMLDivElement>())
  const highlightTimerRef = useRef<number | null>(null)
  const [highlightedMessageId, setHighlightedMessageId] = useState<MessageId | null>(null)

  const setMessageElement = (messageId: MessageId, element: HTMLDivElement | null) => {
    if (element) {
      messageElementsRef.current.set(messageId, element)
      return
    }

    messageElementsRef.current.delete(messageId)
  }

  const openReplyTarget = (messageId: MessageId) => {
    const target = messageElementsRef.current.get(messageId)
    if (!target) {
      return
    }

    target.scrollIntoView({ behavior: "smooth", block: "center" })
    setHighlightedMessageId(messageId)

    if (highlightTimerRef.current !== null) {
      window.clearTimeout(highlightTimerRef.current)
    }

    highlightTimerRef.current = window.setTimeout(() => {
      setHighlightedMessageId(null)
      highlightTimerRef.current = null
    }, 1200)
  }

  useEffect(() => {
    if (focusedMessageId === null || focusedMessageId === undefined) {
      return
    }

    const frameId = window.requestAnimationFrame(() => {
      openReplyTarget(focusedMessageId)
      onFocusedMessageHandled?.()
    })

    return () => window.cancelAnimationFrame(frameId)
  }, [focusedMessageId, onFocusedMessageHandled])

  useEffect(
    () => () => {
      if (highlightTimerRef.current !== null) {
        window.clearTimeout(highlightTimerRef.current)
      }
    },
    []
  )

  const messageViewModels = useMemo(() => {
    const messagesById = new Map(messages.map((message) => [message.id, message]))
    const authorById = new Map(participants.map((participant) => [participant.id, participant]))
    const participantById = new Map(
      participants
        .filter((participant) => participant.id !== CURRENT_USER.id)
        .map((participant) => [participant.id, participant])
    )
    const latestReadMessageIdByParticipantId = new Map<ProfileId, MessageId>()

    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index]

      for (const participantId of message?.readBy ?? []) {
        if (
          participantById.has(participantId) &&
          !latestReadMessageIdByParticipantId.has(participantId)
        ) {
          latestReadMessageIdByParticipantId.set(participantId, message.id)
        }
      }
    }

    const readReceiptParticipantsByMessageId = new Map<MessageId, Participant[]>()
    for (const [participantId, messageId] of latestReadMessageIdByParticipantId) {
      const participant = participantById.get(participantId)
      if (!participant) {
        continue
      }

      const readReceiptParticipants = readReceiptParticipantsByMessageId.get(messageId) ?? []
      readReceiptParticipants.push(participant)
      readReceiptParticipantsByMessageId.set(messageId, readReceiptParticipants)
    }

    return messages.map((message, index) => {
      const previousMessage = messages[index - 1]
      const groupPosition = getMessageGroupPosition(messages, index)
      const isMine = message.senderId === CURRENT_USER.id
      const replyTarget = message.replyTo ? messagesById.get(message.replyTo.messageId) : undefined

      return {
        message,
        author: isMine
          ? CURRENT_USER
          : (authorById.get(message.senderId) ?? {
              id: message.senderId,
              name: "알 수 없음",
              avatarUrl: null,
            }),
        replyPreviewText: message.replyTo
          ? replyTarget
            ? getReplyText(replyTarget)
            : message.replyTo.text
          : undefined,
        readReceipts: readReceiptParticipantsByMessageId.get(message.id) ?? [],
        groupPosition,
        showAvatar: !isMine && (groupPosition === "single" || groupPosition === "end"),
        showName:
          roomType === "group" &&
          !isMine &&
          (groupPosition === "single" || groupPosition === "start"),
        showTime: shouldShowMessageTime(messages, index),
        shouldSeparate: shouldSeparateMessages(previousMessage, message),
        showDateSeparator: shouldShowDateSeparator(previousMessage, message),
        isSelectable: isMine && !isDeletedMessage(message),
      }
    })
  }, [messages, participants, roomType])

  return (
    <div className="mx-auto flex w-full flex-col">
      {messageViewModels.map((viewModel) => {
        return (
          <div
            key={viewModel.message.id}
            ref={(element) => setMessageElement(viewModel.message.id, element)}
            className={cn(viewModel.shouldSeparate && "mt-4")}
          >
            {viewModel.showDateSeparator ? (
              <div className="mb-4 flex justify-center">
                <Badge variant="secondary">
                  {formatMessageDateLabel(viewModel.message.createdAt)}
                </Badge>
              </div>
            ) : null}
            <MessageBubble
              message={viewModel.message}
              author={viewModel.author}
              reactionTypes={reactionTypes}
              replyPreviewText={viewModel.replyPreviewText}
              readReceipts={viewModel.readReceipts}
              groupPosition={viewModel.groupPosition}
              showAvatar={viewModel.showAvatar}
              showName={viewModel.showName}
              showTime={viewModel.showTime}
              isHighlighted={highlightedMessageId === viewModel.message.id}
              onOpenReplyTarget={openReplyTarget}
              onReply={onReply}
              onReact={onReact}
              onDelete={onDelete}
              onTogglePin={onTogglePin}
              onRetry={onRetry}
              onOpenActions={onOpenActions}
              isMobileActionActive={activeMobileActionMessageId === viewModel.message.id}
              onCloseActions={onCloseActions}
              isSelectionMode={isSelectionMode}
              isSelected={selectedMessageIds.has(viewModel.message.id)}
              isSelectable={viewModel.isSelectable}
              onToggleSelect={onToggleMessageSelection}
            />
          </div>
        )
      })}
    </div>
  )
}
