import { memo } from "react"

import { Badge } from "~/components/ui/badge"
import { MessageBubble } from "~/components/messenger/message-bubble"
import { CURRENT_USER } from "~/lib/messenger/constants"
import {
  formatMessageDateLabel,
  getMessageGroupPosition,
  shouldSeparateMessages,
  shouldShowDateSeparator,
} from "~/lib/messenger/utils"
import { cn } from "~/lib/utils"
import type { Message, Participant, Room } from "~/lib/messenger/types"

export const MessageList = memo(function MessageList({
  room,
  onReply,
  onReact,
  onDelete,
  onOpenActions,
  activeMobileActionMessageId,
  onCloseActions,
}: {
  room: Room
  onReply: (message: Message) => void
  onReact: (message: Message, reaction: string) => void
  onDelete: (message: Message) => void
  onOpenActions: (message: Message) => void
  activeMobileActionMessageId: string | null
  onCloseActions: () => void
}) {
  const readReceiptParticipantsByMessageId = new Map<string, Participant[]>()

  for (const participant of room.participants) {
    if (participant.id === CURRENT_USER.id) {
      continue
    }

    for (let index = room.messages.length - 1; index >= 0; index -= 1) {
      const message = room.messages[index]

      if (message?.readBy?.includes(participant.id)) {
        const readReceiptParticipants = readReceiptParticipantsByMessageId.get(message.id) ?? []
        readReceiptParticipants.push(participant)
        readReceiptParticipantsByMessageId.set(message.id, readReceiptParticipants)
        break
      }
    }
  }

  return (
    <div className="mx-auto flex w-full flex-col">
      {room.messages.map((message, index) => {
        const previousMessage = room.messages[index - 1]
        const groupPosition = getMessageGroupPosition(room.messages, index)
        const isMine = message.senderId === CURRENT_USER.id
        const showAvatar = !isMine && (groupPosition === "single" || groupPosition === "end")
        const showName =
          room.type === "group" &&
          !isMine &&
          (groupPosition === "single" || groupPosition === "start")
        const showTime = groupPosition === "single" || groupPosition === "end"
        const shouldSeparate = shouldSeparateMessages(previousMessage, message)
        const showDateSeparator = shouldShowDateSeparator(previousMessage, message)

        return (
          <div key={message.id} className={cn(shouldSeparate && "mt-4")}>
            {showDateSeparator ? (
              <div className="mb-4 flex justify-center">
                <Badge variant="secondary">{formatMessageDateLabel(message.createdAt)}</Badge>
              </div>
            ) : null}
            <MessageBubble
              room={room}
              message={message}
              readReceipts={readReceiptParticipantsByMessageId.get(message.id) ?? []}
              groupPosition={groupPosition}
              showAvatar={showAvatar}
              showName={showName}
              showTime={showTime}
              onReply={onReply}
              onReact={onReact}
              onDelete={onDelete}
              onOpenActions={onOpenActions}
              isMobileActionActive={activeMobileActionMessageId === message.id}
              onCloseActions={onCloseActions}
            />
          </div>
        )
      })}
    </div>
  )
})
