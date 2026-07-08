import { useState, type ReactNode } from "react"
import { Dialog as DialogPrimitive } from "radix-ui"
import { CopyIcon, EllipsisIcon, ReplyIcon, SendIcon, XIcon } from "lucide-react"

import { getReplyText, isDeletedMessage } from "~/lib/messenger/utils"
import { cn } from "~/lib/utils"
import type { Message } from "~/lib/messenger/types"

export function BubbleOverflowMenu({
  isMine,
  align,
  onDelete,
  onClose,
}: {
  isMine: boolean
  align: "left" | "right"
  onDelete: () => void
  onClose: () => void
}) {
  return (
    <div
      className={cn(
        "bg-popover absolute bottom-[calc(100%+0.5rem)] z-20 min-w-32 rounded-2xl border p-1 shadow-lg",
        align === "left" ? "left-0" : "right-0"
      )}
    >
      {isMine ? (
        <button
          type="button"
          className="hover:bg-muted text-foreground flex w-full rounded-xl px-3 py-2 text-left text-sm transition-colors"
          onClick={onDelete}
        >
          Delete
        </button>
      ) : null}
      <button
        type="button"
        className="hover:bg-muted text-foreground flex w-full rounded-xl px-3 py-2 text-left text-sm transition-colors"
        onClick={onClose}
      >
        Forward
      </button>
      <button
        type="button"
        className="hover:bg-muted text-foreground flex w-full rounded-xl px-3 py-2 text-left text-sm transition-colors"
        onClick={onClose}
      >
        Pin
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
  onDelete,
}: {
  message: Message | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onReply: (message: Message) => void
  onDelete: (message: Message) => void
}) {
  const [isMoreOpen, setIsMoreOpen] = useState(false)

  if (!message || isDeletedMessage(message)) {
    return null
  }

  const isMine = message.senderId === "me"
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setIsMoreOpen(false)
    }

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
          <div className="space-y-3">
            <div className="flex justify-between">
              <MessageActionButton
                icon={<ReplyIcon className="size-5" />}
                label="답장"
                onClick={() => {
                  onReply(message)
                  handleOpenChange(false)
                }}
              />
              <MessageActionButton
                icon={<CopyIcon className="size-5" />}
                label="복사"
                onClick={handleCopy}
              />
              {isMine ? (
                <MessageActionButton
                  icon={<XIcon className="size-5" />}
                  label="삭제"
                  className="text-destructive"
                  onClick={() => {
                    onDelete(message)
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
              <MessageActionButton
                icon={<EllipsisIcon className="size-5" />}
                label="더보기"
                onClick={() => setIsMoreOpen((previous) => !previous)}
              />
            </div>

            {isMoreOpen ? <div className="h-12" /> : null}
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
