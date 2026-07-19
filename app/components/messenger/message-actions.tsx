import type { ReactNode } from "react"
import { Dialog as DialogPrimitive } from "radix-ui"
import { CopyIcon, PinIcon, PinOffIcon, ReplyIcon, SendIcon, XIcon } from "lucide-react"

import { CURRENT_USER } from "~/lib/messenger/constants"
import { getReplyText, isDeletedMessage, isPinnedMessage } from "~/lib/messenger/utils"
import { cn } from "~/lib/utils"
import type { Message } from "~/lib/messenger/types"

export function BubbleOverflowMenu({
  isMine,
  isPinned,
  align,
  placement = "top",
  onDelete,
  onTogglePin,
  onClose,
}: {
  isMine: boolean
  isPinned: boolean
  align: "left" | "right"
  placement?: "top" | "bottom"
  onDelete: () => void
  onTogglePin: () => void
  onClose: () => void
}) {
  return (
    <div
      className={cn(
        "bg-popover absolute z-20 min-w-32 rounded-2xl border p-1 shadow-lg",
        placement === "top" ? "bottom-[calc(100%+0.5rem)]" : "top-[calc(100%+0.5rem)]",
        align === "left" ? "left-0" : "right-0"
      )}
    >
      {isMine ? (
        <button
          type="button"
          className="hover:bg-muted text-foreground flex w-full rounded-xl px-3 py-2 text-left text-sm transition-colors"
          onClick={onDelete}
        >
          삭제
        </button>
      ) : null}
      <button
        type="button"
        className="hover:bg-muted text-foreground flex w-full rounded-xl px-3 py-2 text-left text-sm transition-colors"
        onClick={onClose}
      >
        전달
      </button>
      <button
        type="button"
        className="hover:bg-muted text-foreground flex w-full rounded-xl px-3 py-2 text-left text-sm transition-colors"
        onClick={onTogglePin}
      >
        {isPinned ? "고정 해제" : "고정"}
      </button>
    </div>
  )
}

function MessageActionButton({
  icon,
  label,
  className,
  onClick,
}: {
  icon: ReactNode
  label: string
  className?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={cn(
        "hover:bg-muted flex min-w-0 flex-col items-center px-3 py-3 text-center transition-colors",
        className
      )}
      onClick={onClick}
    >
      <span className="bg-muted flex size-11 items-center justify-center rounded-full border">
        {icon}
      </span>
      <span className="text-xs font-medium">{label}</span>
    </button>
  )
}

export function MessageActionPanel({
  message,
  open,
  onOpenChange,
  onReply,
  onStartSelection,
  onTogglePin,
}: {
  message: Message | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onReply: (message: Message) => void
  /** 삭제를 바로 실행하지 않고 다중 선택 모드로 들어간다(해당 메시지가 먼저 선택된 채로). */
  onStartSelection: (message: Message) => void
  onTogglePin: (message: Message) => void
}) {
  if (!message || isDeletedMessage(message)) {
    return null
  }

  const isMine = message.senderId === CURRENT_USER.id
  const isPinned = isPinnedMessage(message)
  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen)
  }

  const handleCopy = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(getReplyText(message))
    }

    handleOpenChange(false)
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange} modal={false}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content className="bg-card data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-bottom-6 data-closed:animate-out data-closed:fade-out-0 data-closed:slide-out-to-bottom-6 fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-50 mx-auto w-auto max-w-md px-2 py-2 duration-150">
          <div className="flex justify-between">
            <MessageActionButton
              icon={<ReplyIcon className="size-5" />}
              label="답장"
              onClick={() => {
                onReply(message)
                handleOpenChange(false)
              }}
            />
            {message.content ? (
              <MessageActionButton
                icon={<CopyIcon className="size-5" />}
                label="복사"
                onClick={handleCopy}
              />
            ) : null}
            <MessageActionButton
              icon={isPinned ? <PinOffIcon className="size-5" /> : <PinIcon className="size-5" />}
              label={isPinned ? "고정 해제" : "고정"}
              onClick={() => {
                onTogglePin(message)
                handleOpenChange(false)
              }}
            />
            {isMine ? (
              <MessageActionButton
                icon={<XIcon className="size-5" />}
                label="삭제"
                className="text-destructive"
                onClick={() => {
                  onStartSelection(message)
                  handleOpenChange(false)
                }}
              />
            ) : (
              <MessageActionButton
                icon={<SendIcon className="size-5" />}
                label="전달"
                onClick={() => handleOpenChange(false)}
              />
            )}
          </div>
          <DialogPrimitive.Title className="sr-only">Message actions</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Choose a reaction or message action.
          </DialogPrimitive.Description>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
