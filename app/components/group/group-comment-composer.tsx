import { SendIcon } from "lucide-react"
import { useRef, useState } from "react"

import { Avatar, AvatarFallback } from "~/components/ui/avatar"
import { Button } from "~/components/ui/button"
import { cn } from "~/lib/utils"

const MAX_HEIGHT = 120

// 내용에 맞춰 높이를 조절하되 상한을 두고 넘치면 스크롤. shadcn Textarea의
// field-sizing-content는 입력마다 레이아웃을 재계산해 렉이 걸려서, 메신저 컴포저처럼
// 수동으로 높이를 잡는다.
function resize(element: HTMLTextAreaElement) {
  element.style.height = "0px"
  const next = Math.min(element.scrollHeight, MAX_HEIGHT)
  element.style.height = `${next}px`
  element.style.overflowY = element.scrollHeight > MAX_HEIGHT ? "auto" : "hidden"
}

// 로컬 상태라 타이핑이 상세 페이지 전체를 리렌더하지 않는다. 하단 댓글 입력에도, 각
// 댓글의 인라인 답글에도 쓴다(className으로 프레임만 바꿈). 저장은 백엔드 붙일 때 --
// 지금은 Enter로 전송하면 비우기만 한다(Shift+Enter는 줄바꿈).
export function GroupCommentComposer({
  placeholder = "댓글을 입력하세요…",
  autoFocus = false,
  onSubmit,
  className = "border-t p-3",
}: {
  placeholder?: string
  autoFocus?: boolean
  onSubmit?: (text: string) => void
  className?: string
}) {
  const [draft, setDraft] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const canSend = draft.trim().length > 0

  const send = () => {
    if (!canSend) return
    onSubmit?.(draft)
    setDraft("")
    if (textareaRef.current) resize(textareaRef.current)
  }

  return (
    <div className={cn("flex items-end gap-2", className)}>
      <Avatar>
        <AvatarFallback>나</AvatarFallback>
      </Avatar>
      <textarea
        ref={textareaRef}
        value={draft}
        rows={1}
        autoFocus={autoFocus}
        placeholder={placeholder}
        className="bg-muted placeholder:text-muted-foreground min-h-9 min-w-0 flex-1 resize-none overflow-y-hidden rounded-3xl px-4 py-2 text-sm leading-5 outline-none"
        onChange={(event) => {
          setDraft(event.target.value)
          resize(event.currentTarget)
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault()
            send()
          }
        }}
      />
      <Button
        variant="ghost"
        size="icon-sm"
        className="text-primary"
        aria-label="댓글 게시"
        disabled={!canSend}
        onClick={send}
      >
        <SendIcon />
      </Button>
    </div>
  )
}
