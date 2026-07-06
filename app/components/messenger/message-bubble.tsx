import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import { EllipsisIcon, ReplyIcon, SmileIcon } from "lucide-react"

import { Avatar, AvatarFallback } from "~/components/ui/avatar"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { BubbleOverflowMenu, QuickReactionList } from "~/components/messenger/message-actions"
import { MessageImage } from "~/components/messenger/message-image"
import { CURRENT_USER, DELETED_MESSAGE_LABEL, QUICK_REACTIONS } from "~/lib/messenger/constants"
import {
  formatMessageTime,
  getBubbleShapeClass,
  getMessageAuthor,
  getReplyPreviewText,
  isDeletedMessage,
} from "~/lib/messenger/utils"
import { cn } from "~/lib/utils"
import type { Message, MessageGroupPosition, Participant, Room } from "~/lib/messenger/types"

const SWIPE_REPLY_START_DISTANCE = 8
const SWIPE_REPLY_TRIGGER_DISTANCE = 48
const SWIPE_REPLY_MAX_DISTANCE = 72

export function MessageBubble({
  room,
  message,
  readReceipts,
  groupPosition,
  showAvatar,
  showName,
  showTime,
  onReply,
  onReact,
  onDelete,
  onOpenActions,
  isMobileActionActive,
  onCloseActions,
}: {
  room: Room
  message: Message
  readReceipts: Participant[]
  groupPosition: MessageGroupPosition
  showAvatar: boolean
  showName: boolean
  showTime: boolean
  onReply: (message: Message) => void
  onReact: (message: Message, reaction: string) => void
  onDelete: (message: Message) => void
  onOpenActions: (message: Message) => void
  isMobileActionActive: boolean
  onCloseActions: () => void
}) {
  const isMine = message.senderId === CURRENT_USER.id
  const author = getMessageAuthor(room, message)
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
  const [swipeOffset, setSwipeOffset] = useState(0)
  const [isSwiping, setIsSwiping] = useState(false)
  const interactionRef = useRef<HTMLDivElement>(null)
  const longPressTimerRef = useRef<number | null>(null)
  const longPressStartPointRef = useRef<{ x: number; y: number } | null>(null)
  const swipeStartPointRef = useRef<{ x: number; y: number } | null>(null)
  const swipeOffsetRef = useRef(0)
  const hasSwipeGestureRef = useRef(false)
  const isDesktopActionOpen = isReactionPickerOpen || isOverflowOpen
  const isReactionPickerVisible = !isDeleted && (isReactionPickerOpen || isMobileActionActive)
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

  const clearLongPress = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }

    longPressStartPointRef.current = null
  }

  const setSwipeDistance = (value: number) => {
    swipeOffsetRef.current = value
    setSwipeOffset(value)
  }

  const resetSwipe = () => {
    swipeStartPointRef.current = null
    swipeOffsetRef.current = 0
    hasSwipeGestureRef.current = false
    setIsSwiping(false)
    setSwipeOffset(0)
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" || isDeleted || isMobileActionActive) {
      return
    }

    clearLongPress()
    const startPoint = { x: event.clientX, y: event.clientY }
    longPressStartPointRef.current = startPoint
    swipeStartPointRef.current = startPoint
    hasSwipeGestureRef.current = false
    setSwipeDistance(0)
    setIsSwiping(false)
    longPressTimerRef.current = window.setTimeout(() => {
      onOpenActions(message)
      clearLongPress()
    }, 450)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const startPoint = swipeStartPointRef.current
    if (!startPoint) {
      return
    }

    const deltaX = event.clientX - startPoint.x
    const deltaY = event.clientY - startPoint.y
    const movedX = Math.abs(deltaX)
    const movedY = Math.abs(deltaY)

    if (movedX > 8 || movedY > 8) {
      clearLongPress()
    }

    if (movedY > movedX && movedY > SWIPE_REPLY_START_DISTANCE) {
      resetSwipe()
      return
    }

    const inwardDistance = isMine ? -deltaX : deltaX

    if (inwardDistance <= 0) {
      if (hasSwipeGestureRef.current) {
        setSwipeDistance(0)
      }
      return
    }

    if (inwardDistance < SWIPE_REPLY_START_DISTANCE || movedX <= movedY) {
      return
    }

    hasSwipeGestureRef.current = true
    setIsSwiping(true)
    setSwipeDistance(Math.min(inwardDistance, SWIPE_REPLY_MAX_DISTANCE))
  }

  const finishPointerInteraction = () => {
    const shouldReply =
      hasSwipeGestureRef.current && swipeOffsetRef.current >= SWIPE_REPLY_TRIGGER_DISTANCE

    clearLongPress()
    resetSwipe()

    if (shouldReply) {
      onReply(message)
    }
  }

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

  useEffect(() => clearLongPress, [])

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
          "text-foreground dark:text-foreground absolute right-1 -bottom-2 z-10 h-5 rounded-full border-0 bg-white px-1.5 py-0 shadow-md dark:bg-white",
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
        {swipeOffset > 0 ? (
          <div
            className={cn(
              "bg-primary text-primary-foreground pointer-events-none absolute top-1/2 z-10 flex size-9 -translate-y-1/2 items-center justify-center rounded-full shadow-sm",
              isMine ? "right-0" : "left-0"
            )}
            style={{ opacity: Math.min(1, swipeOffset / SWIPE_REPLY_TRIGGER_DISTANCE) }}
            aria-hidden="true"
          >
            <ReplyIcon className="size-4" />
          </div>
        ) : null}
        <div
          ref={interactionRef}
          className={cn("group/message flex items-end gap-2", isMine && "justify-end")}
          style={{
            transform: swipeOffset
              ? `translateX(${isMine ? -swipeOffset : swipeOffset}px)`
              : undefined,
            transition: isSwiping ? "none" : "transform 160ms ease-out",
          }}
        >
          {isMine ? messageActionSlot : null}
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
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finishPointerInteraction}
            onPointerCancel={finishPointerInteraction}
            onPointerLeave={finishPointerInteraction}
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
              <div
                className={cn(
                  "flex max-w-full flex-col gap-1",
                  isMine ? "mr-2 items-end" : "ml-2 items-start"
                )}
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
                  <div className="line-clamp-2 whitespace-pre-wrap">
                    {getReplyPreviewText(room, message.replyTo)}
                  </div>
                </div>
              </div>
            ) : null}
            {message.content || message.image || isDeleted ? (
              <div
                className={cn(
                  "flex flex-col gap-1",
                  message.replyTo ? "-mt-4" : "",
                  reactionBadge && "mb-2"
                )}
              >
                <div className={cn("relative px-3 py-2", bubbleShapeClass, bubbleToneClass)}>
                  {isDeleted ? (
                    <p className="text-sm leading-5 whitespace-pre-wrap">{DELETED_MESSAGE_LABEL}</p>
                  ) : message.content ? (
                    <p className="text-sm leading-5 whitespace-pre-wrap">{message.content}</p>
                  ) : null}
                  {!isDeleted && message.image ? (
                    <MessageImage
                      image={message.image}
                      className={cn(
                        message.content ? "mt-2" : "",
                        "max-w-[14rem] sm:max-w-[16rem]"
                      )}
                    />
                  ) : null}
                  {reactionBadge}
                </div>
              </div>
            ) : null}
          </div>
          {!isMine ? messageActionSlot : null}
        </div>
      </div>
      <div className={cn("flex", isMine ? "justify-end" : "pl-10")}>
        <div
          className={cn(
            "-mt-0.5 flex max-w-[min(20rem,70%)] items-center gap-1.5 px-1 sm:max-w-[70%]",
            isMine ? "justify-end" : "justify-start"
          )}
        >
          {!isDeleted && readReceipts.length > 0 ? (
            <div className="flex -space-x-1" aria-label="Read by">
              {readReceipts.map((participant) => (
                <Avatar key={participant.id} size="sm" className="ring-background size-4 ring-1">
                  <AvatarFallback className="text-[8px]">{participant.initials}</AvatarFallback>
                </Avatar>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
