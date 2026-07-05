import { useState } from "react"
import { CameraIcon, ImageIcon, PlusIcon, SendIcon, SmileIcon, XIcon } from "lucide-react"

import { Button } from "~/components/ui/button"
import { cn } from "~/lib/utils"
import type { ImageAttachment, ReplyPreview } from "~/lib/messenger/types"

export function MessageComposer({
  attachedImage,
  replyTo,
  onAttachImage,
  onRemoveImage,
  onClearReply,
  onSend,
}: {
  attachedImage: ImageAttachment | null
  replyTo: ReplyPreview | null
  onAttachImage: () => void
  onRemoveImage: () => void
  onClearReply: () => void
  onSend: (draft: string) => boolean
}) {
  const [draft, setDraft] = useState("")
  const [isComposerFocused, setIsComposerFocused] = useState(false)
  const canSend = draft.trim().length > 0 || attachedImage

  const sendDraft = () => {
    if (onSend(draft)) {
      setDraft("")
    }
  }

  return (
    <footer className="bg-card/95 shrink-0 [padding-bottom:calc(0.5rem+env(safe-area-inset-bottom))] md:px-3 md:py-2">
      {replyTo ? (
        <div className="mb-2 flex items-start justify-between gap-3 border-t-1 px-3 py-2">
          <div className="min-w-0 text-xs">
            <p className="font-medium">{replyTo.author}에게 답장</p>
            <p className="text-muted-foreground line-clamp-1">{replyTo.text}</p>
          </div>
          <Button variant="ghost" size="icon-xs" aria-label="Cancel reply" onClick={onClearReply}>
            <XIcon />
          </Button>
        </div>
      ) : null}
      {attachedImage ? (
        <div className="bg-muted mb-2 flex items-center justify-between gap-3 rounded-2xl px-3 py-2">
          <div className="flex min-w-0 items-center gap-3">
            {attachedImage.src ? (
              <img
                src={attachedImage.src}
                alt="Selected attachment"
                className="size-10 rounded-xl object-cover"
              />
            ) : (
              <div className="bg-background flex size-10 items-center justify-center rounded-xl">
                <ImageIcon className="text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0 text-xs">
              <p className="truncate font-medium">{attachedImage.title}</p>
              <p className="text-muted-foreground truncate">Ready to send</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Remove attachment"
            onClick={onRemoveImage}
          >
            <XIcon />
          </Button>
        </div>
      ) : null}
      <div className="flex items-center gap-1 p-1.5">
        <div
          className={cn(
            "flex origin-left items-center gap-1 overflow-hidden transition-[max-width,opacity,transform,margin] duration-200 ease-out motion-reduce:transition-none",
            isComposerFocused
              ? "max-sm:-mr-1 max-sm:max-w-0 max-sm:scale-95 max-sm:opacity-0"
              : "max-sm:max-w-32 max-sm:opacity-100"
          )}
        >
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Add attachment"
            onClick={onAttachImage}
          >
            <PlusIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Open camera"
            className="sm:hidden"
            onClick={onAttachImage}
          >
            <CameraIcon />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Attach image" onClick={onAttachImage}>
            <ImageIcon />
          </Button>
        </div>

        <div className="flex min-w-0 flex-1 items-center self-stretch transition-[flex-basis] duration-200 ease-out motion-reduce:transition-none">
          <textarea
            value={draft}
            rows={1}
            aria-label="Message input"
            placeholder="Aa"
            className="bg-muted placeholder:text-muted-foreground min-h-9 min-w-0 flex-1 resize-none rounded-[1.5rem] border-0 px-4 py-2 text-sm leading-5 shadow-none outline-none"
            onChange={(event) => setDraft(event.target.value)}
            onFocus={() => setIsComposerFocused(true)}
            onBlur={() => setIsComposerFocused(false)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                sendDraft()
              }
            }}
          />
        </div>

        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={isComposerFocused ? "Send message" : "Choose emoji"}
          disabled={isComposerFocused ? !canSend : false}
          className="text-primary relative shrink-0 overflow-hidden transition-[background-color,color,border-color] duration-200 ease-out motion-reduce:transition-none sm:hidden"
          onMouseDown={(event) => event.preventDefault()}
          onClick={isComposerFocused ? sendDraft : undefined}
        >
          <span className="relative block size-5">
            <SmileIcon
              className={cn(
                "absolute inset-0 transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none",
                isComposerFocused ? "scale-90 opacity-0" : "scale-100 opacity-100"
              )}
            />
            <SendIcon
              className={cn(
                "absolute inset-0 size-5 transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none",
                isComposerFocused ? "scale-100 opacity-100" : "scale-90 opacity-0"
              )}
            />
          </span>
        </Button>

        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Choose emoji"
          className="hidden sm:inline-flex"
          onMouseDown={(event) => event.preventDefault()}
        >
          <SmileIcon />
        </Button>

        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Send message"
          disabled={!canSend}
          className="text-primary hidden sm:inline-flex [&_svg]:size-5"
          onMouseDown={(event) => event.preventDefault()}
          onClick={sendDraft}
        >
          <SendIcon className="size-5" />
        </Button>
      </div>
    </footer>
  )
}
