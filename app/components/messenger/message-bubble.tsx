import { useEffect, useRef, useState } from "react"
import { EllipsisIcon, ReplyIcon, SmileIcon } from "lucide-react"

import { Avatar, AvatarFallback } from "~/components/ui/avatar"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { MessageAttachmentPreview } from "~/components/messenger/message-attachment-preview"
import { BubbleOverflowMenu, QuickReactionList } from "~/components/messenger/message-actions"
import { useMessageBubbleGestures } from "~/components/messenger/use-message-bubble-gestures"
import { CURRENT_USER, DELETED_MESSAGE_LABEL, QUICK_REACTIONS } from "~/lib/messenger/constants"
import { formatMessageTime, getBubbleShapeClass, isDeletedMessage } from "~/lib/messenger/utils"
import { cn } from "~/lib/utils"
import type { Message, MessageGroupPosition, Participant } from "~/lib/messenger/types"

export function MessageBubble({
  message,
  author,
  replyPreviewText,
  readReceipts,
  groupPosition,
  showAvatar,
  showName,
  showTime,
  isHighlighted,
  onOpenReplyTarget,
  onReply,
  onReact,
  onDelete,
  onOpenActions,
  isMobileActionActive,
  onCloseActions,
}: {
  message: Message
  author: Participant
  replyPreviewText?: string
  readReceipts: Participant[]
  groupPosition: MessageGroupPosition
  showAvatar: boolean
  showName: boolean
  showTime: boolean
  isHighlighted: boolean
  onOpenReplyTarget: (messageId: string) => void
  onReply: (message: Message) => void
  onReact: (message: Message, reaction: string) => void
  onDelete: (message: Message) => void
  onOpenActions: (message: Message) => void
  isMobileActionActive: boolean
  onCloseActions: () => void
}) {
  const isMine = message.senderId === CURRENT_USER.id
  const isDeleted = isDeletedMessage(message)
  const bubbleShapeClass = getBubbleShapeClass(isMine, groupPosition)
  const groupedStackOffsetClass =
    groupPosition === "middle" || groupPosition === "end" ? "-mt-0.5" : ""
  const bubbleToneClass = isDeleted
    ? "bg-muted/80 text-muted-foreground border border-border/60 italic"
    : isMine
      ? "bg-primary text-primary-foreground"
      : "bg-muted text-foreground"
  const [isReactionPickerOpen, setIsReactionPickerOpen] = useState(false)
  const [isOverflowOpen, setIsOverflowOpen] = useState(false)
  const interactionRef = useRef<HTMLDivElement>(null)
  const isDesktopActionOpen = isReactionPickerOpen || isOverflowOpen
  const isReactionPickerVisible = !isDeleted && (isReactionPickerOpen || isMobileActionActive)
  const attachments = message.attachments ?? []
  const hasAttachments = attachments.length > 0
  const { isSwipeActive, swipeElementRef, replyIconRef, pointerHandlers } =
    useMessageBubbleGestures({
      isMine,
      disabled: isDeleted || isMobileActionActive,
      message,
      onOpenActions,
      onReply,
    })
  const reactionValues = message.reactions?.map((reaction) => reaction.value) ?? []
  const uniqueReactionValues = [...new Set(reactionValues)].sort(
    (firstReaction, secondReaction) => {
      const firstIndex = QUICK_REACTIONS.indexOf(firstReaction as (typeof QUICK_REACTIONS)[number])
      const secondIndex = QUICK_REACTIONS.indexOf(
        secondReaction as (typeof QUICK_REACTIONS)[number]
      )

      return (
        (firstIndex === -1 ? QUICK_REACTIONS.length : firstIndex) -
        (secondIndex === -1 ? QUICK_REACTIONS.length : secondIndex)
      )
    }
  )
  const reactionCount = reactionValues.length

  useEffect(() => {
    if (!isDesktopActionOpen) {
      return
    }

    const handlePointerDownOutside = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) {
        return
      }

      if (!interactionRef.current?.contains(target)) {
        setIsReactionPickerOpen(false)
        setIsOverflowOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsReactionPickerOpen(false)
        setIsOverflowOpen(false)
      }
    }

    document.addEventListener("pointerdown", handlePointerDownOutside)
    document.addEventListener("keydown", handleEscape)

    return () => {
      document.removeEventListener("pointerdown", handlePointerDownOutside)
      document.removeEventListener("keydown", handleEscape)
    }
  }, [isDesktopActionOpen])

  if (message.senderId === "system") {
    return (
      <div className="flex justify-center">
        <Badge variant="secondary">{message.content}</Badge>
      </div>
    )
  }

  const actionRail = (
    <div className="relative">
      <div
        className={cn(
          "hidden items-center gap-1 p-1 transition-[opacity,transform] duration-150 [@media(any-hover:hover)]:flex",
          isDesktopActionOpen
            ? "opacity-100"
            : "pointer-events-none scale-95 opacity-0 group-hover/message:pointer-events-auto group-hover/message:scale-100 group-hover/message:opacity-100"
        )}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Add reaction"
          onClick={() => {
            setIsReactionPickerOpen((previous) => !previous)
            setIsOverflowOpen(false)
          }}
        >
          <SmileIcon className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Reply to message"
          onClick={() => onReply(message)}
        >
          <ReplyIcon className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="More message actions"
          onClick={() => {
            setIsOverflowOpen((previous) => !previous)
            setIsReactionPickerOpen(false)
          }}
        >
          <EllipsisIcon className="size-3.5" />
        </Button>
      </div>

      {isOverflowOpen ? (
        <BubbleOverflowMenu
          isMine={isMine}
          align={isMine ? "left" : "right"}
          onDelete={() => {
            onDelete(message)
            setIsOverflowOpen(false)
          }}
          onClose={() => setIsOverflowOpen(false)}
        />
      ) : null}
    </div>
  )

  const messageActionSlot =
    showTime || !isDeleted ? (
      <div className="relative mb-1 flex shrink-0 items-center">
        {showTime ? (
          <span
            className={cn(
              "text-muted-foreground shrink-0 text-[11px] leading-none transition-opacity duration-150",
              !isDeleted && "[@media(any-hover:hover)]:group-hover/message:opacity-0",
              isDesktopActionOpen && "opacity-0"
            )}
          >
            {formatMessageTime(message.createdAt)}
          </span>
        ) : null}
        {!isDeleted ? (
          <div className={cn("absolute bottom-0", isMine ? "right-0" : "left-0")}>{actionRail}</div>
        ) : null}
      </div>
    ) : null

  const reactionBadge =
    !isDeleted && reactionCount > 0 ? (
      <Badge
        variant="secondary"
        className={cn(
          "bg-background text-foreground absolute right-1 -bottom-2 z-10 h-5 rounded-full border-0 px-1.5 py-0 shadow-md",
          reactionCount === 1 ? "size-5 px-0" : "gap-0.5"
        )}
      >
        {uniqueReactionValues.map((reactionValue) => (
          <span key={reactionValue} aria-hidden="true" className="text-sm leading-none">
            {reactionValue}
          </span>
        ))}
        {reactionCount > 1 ? (
          <span className="text-[11px] leading-none">{reactionCount}</span>
        ) : null}
        <span className="sr-only">{reactionCount} reactions</span>
      </Badge>
    ) : null

  return (
    <div className={cn("flex flex-col gap-1", groupedStackOffsetClass)}>
      {showName ? (
        <div className="pl-10">
          <span className="text-muted-foreground text-xs font-medium">{author.name}</span>
        </div>
      ) : null}
      <div className="relative">
        {isSwipeActive ? (
          <div
            ref={replyIconRef}
            className={cn(
              "bg-primary text-primary-foreground pointer-events-none absolute top-1/2 z-10 flex size-9 -translate-y-1/2 items-center justify-center rounded-full shadow-sm",
              isMine ? "right-0" : "left-0"
            )}
            style={{ opacity: 0 }}
            aria-hidden="true"
          >
            <ReplyIcon className="size-4" />
          </div>
        ) : null}
        <div
          ref={(element) => {
            interactionRef.current = element
            swipeElementRef.current = element
          }}
          className={cn("group/message flex items-end gap-2", isMine && "justify-end")}
        >
          {!isMine ? (
            <div className="flex w-8 shrink-0 items-end">
              {showAvatar ? (
                <Avatar>
                  <AvatarFallback>{author.initials}</AvatarFallback>
                </Avatar>
              ) : null}
            </div>
          ) : null}
          <div
            className={cn(
              "relative flex max-w-[min(20rem,70%)] [touch-action:pan-y] flex-col gap-1 sm:max-w-[70%]",
              isMine ? "items-end" : "items-start"
            )}
            {...pointerHandlers}
          >
            {isReactionPickerVisible ? (
              <div
                className={cn(
                  "bg-popover absolute bottom-[calc(100%+0.5rem)] z-[60] rounded-2xl border p-2 shadow-lg",
                  isMine ? "right-0" : "left-0"
                )}
              >
                <QuickReactionList
                  onSelect={(reaction) => {
                    onReact(message, reaction)
                    setIsReactionPickerOpen(false)
                    if (isMobileActionActive) {
                      onCloseActions()
                    }
                  }}
                />
              </div>
            ) : null}
            {message.replyTo ? (
              <button
                type="button"
                aria-label="원본 메시지로 이동" //db 연동 후에는 원본 메시지가 현재 리스트에 없을 수 있어서 주변 fetch 필요.
                className={cn(
                  "flex max-w-full flex-col gap-1 text-left transition-opacity hover:opacity-80",
                  isMine ? "mr-2 items-end" : "ml-2 items-start"
                )}
                onPointerDown={(event) => event.stopPropagation()}
                onPointerMove={(event) => event.stopPropagation()}
                onPointerUp={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation()
                  const targetMessageId = message.replyTo?.messageId
                  if (targetMessageId) {
                    onOpenReplyTarget(targetMessageId)
                  }
                }}
              >
                <div className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                  <ReplyIcon className="size-3.5" />
                  <span>{message.replyTo.author}</span>
                </div>
                <div
                  className={cn(
                    "bg-muted/30 text-muted-foreground max-w-[calc(100%-1.25rem)] rounded-2xl px-2.5 pt-1.5 pb-4 text-sm",
                    isMine ? "rounded-br-md" : "rounded-bl-md"
                  )}
                >
                  <div className="line-clamp-2 whitespace-pre-wrap">
                    {replyPreviewText ?? message.replyTo.text}
                  </div>
                </div>
              </button>
            ) : null}
            {message.content || hasAttachments || isDeleted ? (
              <div className={cn("flex max-w-full items-end gap-2", isMine && "justify-end")}>
                {isMine ? messageActionSlot : null}
                <div
                  className={cn(
                    "flex min-w-0 flex-col gap-1",
                    message.replyTo ? "-mt-4" : "",
                    reactionBadge && "mb-2"
                  )}
                >
                  {message.content || isDeleted ? (
                    <div
                      className={cn(
                        "relative px-3 py-2 transition-shadow duration-300",
                        bubbleShapeClass,
                        bubbleToneClass,
                        isHighlighted &&
                          "ring-primary/25 ring-offset-background ring-2 ring-offset-2"
                      )}
                    >
                      {isDeleted ? (
                        <p className="text-sm leading-5 whitespace-pre-wrap">
                          {DELETED_MESSAGE_LABEL}
                        </p>
                      ) : message.content ? (
                        <p className="text-sm leading-5 whitespace-pre-wrap">{message.content}</p>
                      ) : null}
                      {!hasAttachments ? reactionBadge : null}
                    </div>
                  ) : null}
                  {!isDeleted && hasAttachments ? (
                    <div
                      className={cn(
                        "relative flex max-w-full flex-col gap-1 transition-shadow duration-300",
                        isHighlighted &&
                          "ring-primary/25 ring-offset-background ring-2 ring-offset-2"
                      )}
                    >
                      {attachments.map((attachment, index) => (
                        <MessageAttachmentPreview
                          key={attachment.id ?? `${attachment.name}-${index}`}
                          attachment={attachment}
                          className="max-w-[14rem] sm:max-w-[12rem]"
                        />
                      ))}
                      {reactionBadge}
                    </div>
                  ) : null}
                </div>
                {!isMine ? messageActionSlot : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <div className="flex justify-end">
        <div className="-mt-0.5 flex max-w-[min(20rem,70%)] items-center justify-end px-1 sm:max-w-[70%]">
          {!isDeleted && readReceipts.length > 0 ? (
            <div className="flex -space-x-1" aria-label="Read by">
              {readReceipts.map((participant) => (
                <Avatar key={participant.id} className="ring-background !size-3.5 ring-1">
                  <AvatarFallback className="!text-[7px]">{participant.initials}</AvatarFallback>
                </Avatar>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
