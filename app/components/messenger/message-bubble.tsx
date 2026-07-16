import { useEffect, useRef, useState } from "react"
import {
  EllipsisIcon,
  Loader2Icon,
  PinIcon,
  ReplyIcon,
  RotateCcwIcon,
  SmileIcon,
  TriangleAlertIcon,
} from "lucide-react"

import { Avatar, AvatarFallback } from "~/components/ui/avatar"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Twemoji } from "~/components/ui/twemoji"
import { MessageAttachmentGroup } from "~/components/messenger/message-attachment-preview"
import { BubbleOverflowMenu } from "~/components/messenger/message-actions"
import { QuickReactionList } from "~/components/quick-reaction-list"
import { useMessageBubbleGestures } from "~/components/messenger/use-message-bubble-gestures"
import { CURRENT_USER, DELETED_MESSAGE_LABEL } from "~/lib/messenger/constants"
import { getReactionGlyph, type ReactionType } from "~/lib/reactions"
import {
  formatMessageTime,
  getBubbleShapeClass,
  getLinkedTextSegments,
  isDeletedMessage,
  isPinnedMessage,
} from "~/lib/messenger/utils"
import { cn } from "~/lib/utils"
import type { Message, MessageGroupPosition, Participant } from "~/lib/messenger/types"

// The message viewport (RoomPane) is marked with data-scroll-container; popovers
// anchored "above" a bubble near the top of that scroll area would otherwise get
// cut off, so flip them below when there isn't enough room.
function getPopoverPlacement(anchor: HTMLElement | null, requiredSpace: number): "top" | "bottom" {
  if (!anchor) {
    return "top"
  }

  const scrollContainer = anchor.closest<HTMLElement>("[data-scroll-container]")
  const containerTop = scrollContainer?.getBoundingClientRect().top ?? 0
  const anchorTop = anchor.getBoundingClientRect().top

  return anchorTop - containerTop < requiredSpace ? "bottom" : "top"
}

function LinkedMessageText({ text }: { text: string }) {
  return (
    <>
      {getLinkedTextSegments(text).map((segment, index) => {
        if (segment.type === "text") {
          // 링크가 아닌 조각의 이모지도 Twemoji로 통일한다. 링크 조각은 URL이라 그대로 둔다.
          return <Twemoji key={index} text={segment.text} />
        }

        return (
          <a
            key={`${segment.href}-${index}`}
            href={segment.href}
            target="_blank"
            rel="noreferrer noopener"
            className="font-medium underline underline-offset-2 hover:opacity-80"
          >
            {segment.text}
          </a>
        )
      })}
    </>
  )
}

export function MessageBubble({
  message,
  author,
  reactionTypes,
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
  onTogglePin,
  onRetry,
  onOpenActions,
  isMobileActionActive,
  onCloseActions,
}: {
  message: Message
  author: Participant
  reactionTypes: ReactionType[]
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
  onTogglePin: (message: Message) => void
  onRetry: (message: Message) => void
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
    ? "bg-muted/15 text-muted-foreground border border-border/40 italic"
    : isMine
      ? "bg-primary text-primary-foreground"
      : "bg-muted text-foreground"
  const [isReactionPickerOpen, setIsReactionPickerOpen] = useState(false)
  const [isOverflowOpen, setIsOverflowOpen] = useState(false)
  const [reactionPickerPlacement, setReactionPickerPlacement] = useState<"top" | "bottom">("top")
  const [overflowMenuPlacement, setOverflowMenuPlacement] = useState<"top" | "bottom">("top")
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
  // Chips read in the picker's order, so the same set of reactions always looks
  // the same. A reaction the picker no longer offers sinks to the end.
  const reactionOrder = new Map(
    reactionTypes.map((reactionType, index) => [getReactionGlyph(reactionType), index])
  )
  const uniqueReactionValues = [...new Set(reactionValues)].sort(
    (firstReaction, secondReaction) =>
      (reactionOrder.get(firstReaction) ?? reactionTypes.length) -
      (reactionOrder.get(secondReaction) ?? reactionTypes.length)
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

  useEffect(() => {
    if (!isReactionPickerVisible) {
      return
    }

    setReactionPickerPlacement(getPopoverPlacement(interactionRef.current, 90))
  }, [isReactionPickerVisible])

  useEffect(() => {
    if (!isOverflowOpen) {
      return
    }

    setOverflowMenuPlacement(getPopoverPlacement(interactionRef.current, 150))
  }, [isOverflowOpen])

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
          isPinned={isPinnedMessage(message)}
          align={isMine ? "left" : "right"}
          placement={overflowMenuPlacement}
          onDelete={() => {
            onDelete(message)
            setIsOverflowOpen(false)
          }}
          onTogglePin={() => {
            onTogglePin(message)
            setIsOverflowOpen(false)
          }}
          onClose={() => setIsOverflowOpen(false)}
        />
      ) : null}
    </div>
  )

  const messageSideSlot =
    showTime || !isDeleted ? (
      <div
        className={cn(
          "relative mb-1 flex shrink-0 items-center",
          !showTime && "hidden w-0 [@media(any-hover:hover)]:flex"
        )}
      >
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
          "bg-background text-foreground absolute right-1 -bottom-3.5 z-10 h-5 rounded-full border-0 px-1 py-0 shadow-sm",
          reactionCount === 1 ? "size-5 px-0" : "gap-0"
        )}
      >
        {uniqueReactionValues.map((reactionValue) => (
          <Twemoji
            key={reactionValue}
            text={reactionValue}
            aria-hidden="true"
            className="text-sm leading-none"
          />
        ))}
        {reactionCount > 1 ? (
          <span className="ml-1 text-[11px] leading-none">{reactionCount}</span>
        ) : null}
        <span className="sr-only">{reactionCount} reactions</span>
      </Badge>
    ) : null

  const pinBadge = isPinnedMessage(message) ? (
    <span
      role="img"
      aria-label="고정된 메시지"
      className="text-destructive absolute -top-1 -left-2 z-10 -rotate-45 drop-shadow-sm"
    >
      <PinIcon className="size-4 fill-current" aria-hidden="true" />
    </span>
  ) : null

  return (
    <div className={cn("flex flex-col gap-1", groupedStackOffsetClass)}>
      {showName ? (
        <div className={cn("pl-10", pinBadge && "mb-1")}>
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
          className={cn("group/message flex w-full items-end gap-2", isMine && "justify-end")}
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
              "relative flex min-w-0 flex-1 [touch-action:pan-y] flex-col gap-1",
              isMine ? "items-end" : "items-start"
            )}
            {...pointerHandlers}
          >
            {isReactionPickerVisible ? (
              <div
                className={cn(
                  "bg-popover absolute z-60 rounded-2xl border p-2 shadow-lg",
                  reactionPickerPlacement === "top"
                    ? "bottom-[calc(100%+0.5rem)]"
                    : "top-[calc(100%+0.5rem)]",
                  isMine ? "right-0" : "left-0"
                )}
              >
                <QuickReactionList
                  reactionTypes={reactionTypes}
                  onSelect={(reactionType) => {
                    onReact(message, getReactionGlyph(reactionType))
                    setIsReactionPickerOpen(false)
                    if (isMobileActionActive) {
                      onCloseActions()
                    }
                  }}
                />
              </div>
            ) : null}
            {message.replyTo ? (
              // Jumping to the original scrolls to a mounted bubble and silently
              // does nothing when there isn't one. Once messages are paginated
              // from the DB the quoted message may sit outside the loaded window,
              // so this has to fetch around it rather than no-op.
              <button
                type="button"
                aria-label="원본 메시지로 이동"
                className={cn(
                  "flex w-fit flex-col gap-1 text-left transition-opacity hover:opacity-80",
                  isMine
                    ? "mr-2 max-w-[74%] items-end sm:max-w-[70%] md:max-w-[68%]"
                    : "ml-2 max-w-[70%] items-start"
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
                    "bg-muted/30 text-muted-foreground max-w-full rounded-2xl px-2.5 pt-1.5 pb-4 text-sm",
                    isMine ? "rounded-br-md" : "rounded-bl-md"
                  )}
                >
                  <div className="line-clamp-2 wrap-break-word whitespace-normal">
                    {replyPreviewText ?? message.replyTo.text}
                  </div>
                </div>
              </button>
            ) : null}
            {message.content || hasAttachments || isDeleted ? (
              <div
                className={cn(
                  "flex w-full items-end gap-1.5",
                  isMine ? "justify-end" : "justify-start"
                )}
              >
                {isMine ? messageSideSlot : null}
                <div
                  className={cn(
                    "flex min-w-0 flex-col gap-1",
                    isMine ? "max-w-[74%] sm:max-w-[70%] md:max-w-[68%]" : "max-w-[70%]",
                    message.replyTo ? "-mt-4" : "",
                    reactionBadge && "mb-2",
                    message.status === "sending" && "opacity-70"
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
                        <p className="text-sm leading-5 wrap-break-word whitespace-pre-wrap">
                          {DELETED_MESSAGE_LABEL}
                        </p>
                      ) : message.content ? (
                        <p className="text-sm leading-5 wrap-break-word whitespace-pre-wrap">
                          <LinkedMessageText text={message.content} />
                        </p>
                      ) : null}
                      {!hasAttachments ? reactionBadge : null}
                      {!hasAttachments ? pinBadge : null}
                    </div>
                  ) : null}
                  {!isDeleted && hasAttachments ? (
                    <div
                      className={cn(
                        "relative transition-shadow duration-300",
                        isHighlighted &&
                          "ring-primary/25 ring-offset-background ring-2 ring-offset-2"
                      )}
                    >
                      <MessageAttachmentGroup attachments={attachments} />
                      {reactionBadge}
                      {pinBadge}
                    </div>
                  ) : null}
                </div>
                {!isMine ? messageSideSlot : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <div className="flex justify-end">
        <div className="flex max-w-[min(20rem,70%)] items-center justify-end gap-1.5 px-1 sm:max-w-[70%]">
          {message.status === "sending" ? (
            <span className="text-muted-foreground inline-flex items-center gap-1 text-[11px]">
              <Loader2Icon className="size-3 animate-spin" aria-hidden="true" />
              <span className="sr-only">전송 중</span>
            </span>
          ) : message.status === "failed" ? (
            <>
              <span className="text-destructive inline-flex items-center gap-1 text-[11px]">
                <TriangleAlertIcon className="size-3.5" aria-hidden="true" />
                전송 실패
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="다시 전송"
                onClick={() => onRetry(message)}
              >
                <RotateCcwIcon className="size-3.5" />
              </Button>
            </>
          ) : !isDeleted && readReceipts.length > 0 ? (
            <div className="flex -space-x-1" aria-label="Read by">
              {readReceipts.map((participant) => (
                <Avatar key={participant.id} className="ring-background mt-2 size-4! ring-1">
                  <AvatarFallback className="text-[7px]!">{participant.initials}</AvatarFallback>
                </Avatar>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
