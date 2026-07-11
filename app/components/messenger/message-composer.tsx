import { useRef, useState } from "react"
import { ImageIcon, PaperclipIcon, SendIcon, SmileIcon, XIcon } from "lucide-react"

import { Button } from "~/components/ui/button"
import { cn } from "~/lib/utils"
import type { ReplyPreview } from "~/lib/messenger/types"

const MESSAGE_TEXTAREA_MAX_HEIGHT = 96

function resizeTextarea(element: HTMLTextAreaElement) {
  element.style.height = "0px"

  const nextHeight = Math.min(element.scrollHeight, MESSAGE_TEXTAREA_MAX_HEIGHT)
  element.style.height = `${nextHeight}px`
  element.style.overflowY = element.scrollHeight > MESSAGE_TEXTAREA_MAX_HEIGHT ? "auto" : "hidden"
}

export function MessageComposer({
  replyTo,
  onAttachImage,
  onAttachFile,
  onClearReply,
  onSend,
}: {
  replyTo: ReplyPreview | null
  onAttachImage: () => void
  onAttachFile: () => void
  onClearReply: () => void
  onSend: (draft: string) => boolean
}) {
  const [draft, setDraft] = useState("")
  const [isComposerFocused, setIsComposerFocused] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const canSend = draft.trim().length > 0
  const canAttach = !replyTo

  const sendDraft = () => {
    if (onSend(draft)) {
      setDraft("")
      if (textareaRef.current) {
        resizeTextarea(textareaRef.current)
      }
    }
  }

  return (
    <footer className="bg-card/95 shrink-0 [padding-bottom:calc(0.5rem+env(safe-area-inset-bottom))]">
      {replyTo ? (
        <div className="mb-2 flex items-start justify-between gap-3 border-t px-3 py-2">
          <div className="min-w-0 text-xs">
            <p className="font-medium">{replyTo.author}에게 답장</p>
            <p className="text-muted-foreground line-clamp-1">{replyTo.text}</p>
          </div>
          <Button variant="ghost" size="icon-xs" aria-label="Cancel reply" onClick={onClearReply}>
            <XIcon />
          </Button>
        </div>
      ) : null}
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-end gap-x-1 p-1.5 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto]">
        <div
          className={cn(
            "col-start-1 flex origin-left items-center gap-1 overflow-hidden transition-[max-width,opacity,transform,margin] duration-200 ease-out motion-reduce:transition-none",
            isComposerFocused
              ? "max-sm:-mr-1 max-sm:max-w-0 max-sm:scale-95 max-sm:opacity-0"
              : "max-sm:max-w-32 max-sm:opacity-100"
          )}
        >
          {/* 사진(갤러리)과 파일(브라우저)을 분리 -- 모바일에서 각자 맞는 피커가 열린다. */}

          <Button
            variant="ghost"
            size="icon"
            aria-label="파일 첨부"
            disabled={!canAttach}
            onClick={onAttachFile}
          >
            <PaperclipIcon className="size-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="사진 첨부"
            disabled={!canAttach}
            onClick={onAttachImage}
          >
            <ImageIcon className="size-5" />
          </Button>
        </div>

        <div className="bg-muted col-start-2 flex min-w-0 rounded-[1.5rem] px-1.5 py-1">
          <textarea
            ref={textareaRef}
            value={draft}
            rows={1}
            aria-label="Message input"
            placeholder="Aa"
            className="placeholder:text-muted-foreground min-h-7 min-w-0 flex-1 resize-none overflow-y-hidden border-0 bg-transparent px-2.5 py-1 text-sm leading-5 shadow-none outline-none"
            onChange={(event) => {
              setDraft(event.target.value)
              resizeTextarea(event.currentTarget)
            }}
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
          size="icon"
          aria-label={isComposerFocused ? "Send message" : "Choose emoji"}
          disabled={isComposerFocused ? !canSend : false}
          className="text-primary relative col-start-3 shrink-0 overflow-hidden transition-[background-color,color,border-color] duration-200 ease-out motion-reduce:transition-none sm:hidden"
          onMouseDown={(event) => event.preventDefault()}
          onClick={isComposerFocused ? sendDraft : undefined}
        >
          <span className="relative block size-5">
            <SmileIcon
              className={cn(
                "absolute inset-0 size-5 transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none",
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
          size="icon"
          aria-label="Choose emoji"
          className="col-start-3 hidden sm:inline-flex"
          onMouseDown={(event) => event.preventDefault()}
        >
          <SmileIcon className="size-5" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          aria-label="Send message"
          disabled={!canSend}
          className="text-primary col-start-4 hidden sm:inline-flex"
          onMouseDown={(event) => event.preventDefault()}
          onClick={sendDraft}
        >
          <SendIcon className="size-5" />
        </Button>
      </div>
    </footer>
  )
}
