import { memo } from "react"

import { MessageBubble } from "~/components/messenger/message-bubble"
import { CURRENT_USER } from "~/lib/messenger/constants"
import { getMessageGroupPosition, shouldSeparateMessages } from "~/lib/messenger/utils"
import { cn } from "~/lib/utils"
import type { Message, Room } from "~/lib/messenger/types"

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

        return (
          <div key={message.id} className={cn(shouldSeparate && "mt-4")}>
            <MessageBubble
              room={room}
              message={message}
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
