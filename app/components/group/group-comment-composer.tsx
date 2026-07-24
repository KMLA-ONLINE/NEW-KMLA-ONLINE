import { SendIcon } from "lucide-react"
import { useRef, useState, type RefObject } from "react"

import { GroupAnonymousToggle } from "~/components/group/group-anonymous-toggle"
import { GroupStaffAvatar } from "~/components/group/group-staff-avatar"
import { AnonymousAvatar, ProfileAvatar } from "~/components/profile/profile-avatar"
import { Button } from "~/components/ui/button"
import type { GroupAnonymityPolicy } from "~/lib/group/types"
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
  inputRef,
  anonymityPolicy = "optional",
  canPostAnonymously = true,
  authorAttribution,
}: {
  placeholder?: string
  autoFocus?: boolean
  /** 익명 여부까지 넘긴다 -- comments.is_anonymous는 insert에만 있고 나중에 못 바꾼다. */
  onSubmit?: (text: string, anonymous: boolean, authorAttribution?: "staff") => void
  className?: string
  /** 바깥에서 포커스를 주려면 넘긴다(상세의 댓글 아이콘). 안 넘기면 내부 ref를 쓴다. */
  inputRef?: RefObject<HTMLTextAreaElement | null>
  anonymityPolicy?: GroupAnonymityPolicy
  canPostAnonymously?: boolean
  /**
   * Mock 표시용. TODO(backend): 클라이언트 값을 신뢰하지 않고 공간 정책과 현재 역할에서 `staff`를
   * 파생해 comments.author_attribution에 게시 당시 스냅샷으로 저장한다.
   */
  authorAttribution?: "staff"
}) {
  const [draft, setDraft] = useState("")
  // comments.is_anonymous. 글과 마찬가지로 작성 시점에만 정해진다(update grant는 content 하나뿐).
  const [anonymous, setAnonymous] = useState(anonymityPolicy === "required")
  const fallbackRef = useRef<HTMLTextAreaElement>(null)
  const textareaRef = inputRef ?? fallbackRef
  const canChooseAnonymity = anonymityPolicy === "optional" && canPostAnonymously
  const isRequiredAndSuspended = anonymityPolicy === "required" && !canPostAnonymously
  const effectiveAnonymous = anonymityPolicy === "required" || anonymous
  const canSend = draft.trim().length > 0 && !isRequiredAndSuspended

  const send = () => {
    if (!canSend) return
    onSubmit?.(draft, effectiveAnonymous, authorAttribution)
    setDraft("")
    setAnonymous(anonymityPolicy === "required")
    if (textareaRef.current) resize(textareaRef.current)
  }

  return (
    <div className={cn("flex items-end gap-2", className)}>
      {authorAttribution === "staff" ? (
        <GroupStaffAvatar className="mb-0.5" />
      ) : canChooseAnonymity ? (
        <GroupAnonymousToggle
          anonymous={anonymous}
          onToggle={() => setAnonymous((value) => !value)}
          className="mb-0.5"
        />
      ) : anonymityPolicy === "required" ? (
        <AnonymousAvatar className="mb-0.5" />
      ) : (
        <ProfileAvatar profile={{ name: "나", avatarUrl: null }} className="mb-0.5" />
      )}
      <textarea
        ref={textareaRef}
        value={draft}
        rows={1}
        autoFocus={autoFocus}
        placeholder={isRequiredAndSuspended ? "익명 작성이 제한되어 있습니다" : placeholder}
        disabled={isRequiredAndSuspended}
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
        size="icon"
        className="text-primary"
        aria-label="댓글 게시"
        disabled={!canSend}
        onClick={send}
      >
        <SendIcon className="size-5" />
      </Button>
    </div>
  )
}
