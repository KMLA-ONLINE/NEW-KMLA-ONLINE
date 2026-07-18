import { useEffect, useRef, useState } from "react"
import {
  ChevronRightIcon,
  ImageIcon,
  PaperclipIcon,
  SendIcon,
  SmileIcon,
  ThumbsUpIcon,
  XIcon,
} from "lucide-react"

import { Button } from "~/components/ui/button"
import { cn } from "~/lib/utils"
import type { ReplyPreview } from "~/lib/messenger/types"

const MESSAGE_TEXTAREA_MAX_HEIGHT = 96
// 따봉(👍 원탭 전송)은 연타로 도배되기 쉬워 최소 간격을 둔다. 이 사이엔 버튼이 흐려지고 안 눌린다.
// 서버 rate limit이 아니라 실수·장난 연타를 막는 클라이언트 가드다.
const LIKE_COOLDOWN_MS = 1000

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
  // 모바일에서 왼쪽 첨부 버튼을 접을지. 포커스/타이핑하면 접혀 자리를 비우고(FB식), 그 자리에
  // 뜨는 > 셰브런을 누르면 다시 펼친다. 데스크톱은 접기 클래스가 max-sm이라 이 값과 무관하게 늘 보인다.
  const [attachCollapsed, setAttachCollapsed] = useState(false)
  // 따봉 쿨다운 중이면 true -- 그동안 따봉이 흐려지고 안 눌린다.
  const [likeCoolingDown, setLikeCoolingDown] = useState(false)
  const likeCooldownTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const canSend = draft.trim().length > 0
  const canAttach = !replyTo

  // 쿨다운 타이머가 도는 중 언마운트되면(방 전환 등) 정리한다.
  useEffect(
    () => () => {
      if (likeCooldownTimer.current) clearTimeout(likeCooldownTimer.current)
    },
    []
  )

  const sendDraft = () => {
    if (onSend(draft)) {
      setDraft("")
      if (textareaRef.current) {
        resizeTextarea(textareaRef.current)
      }
    }
  }

  // 입력이 비었을 때 오른쪽 버튼은 따봉이고, 누르면 👍 한 방을 보낸다(FB식 "좋아요"). 글이 있으면
  // 같은 자리가 전송 버튼으로 바뀐다. draft는 건드리지 않는다 -- 따봉은 지금 쓰던 초안과 무관하다.
  // 보낸 뒤 LIKE_COOLDOWN_MS 동안 잠가 연타 도배를 막는다.
  const sendLike = () => {
    if (likeCoolingDown) return
    onSend("👍")
    setLikeCoolingDown(true)
    likeCooldownTimer.current = setTimeout(() => setLikeCoolingDown(false), LIKE_COOLDOWN_MS)
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
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-end gap-x-1 p-1.5">
        <div className="col-start-1 flex items-center">
          {/* 접혔을 때만 모바일에 뜨는 > 셰브런. 누르면 첨부 버튼을 다시 펼친다. 펼쳐진 동안엔
              max-w-0으로 접혀 자리를 안 먹고, 데스크톱은 sm:hidden이라 아예 안 뜬다(첨부가 늘 보이므로). */}
          <Button
            variant="ghost"
            size="icon"
            aria-label="첨부 옵션 열기"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setAttachCollapsed(false)}
            className={cn(
              "shrink-0 overflow-hidden transition-[max-width,opacity] duration-200 ease-out motion-reduce:transition-none sm:hidden",
              attachCollapsed ? "max-w-9 opacity-100" : "pointer-events-none max-w-0 opacity-0"
            )}
          >
            <ChevronRightIcon className="size-5" />
          </Button>

          <div
            className={cn(
              "flex origin-left items-center gap-1 overflow-hidden transition-[max-width,opacity,transform,margin] duration-200 ease-out motion-reduce:transition-none",
              attachCollapsed
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
        </div>

        {/* 이모지 버튼은 버블 안 오른쪽 끝에 둔다(FB식). 여러 줄로 늘어나면 items-end로 마지막 줄에
            맞춰 바닥에 붙는다. */}
        <div className="bg-muted col-start-2 flex min-w-0 items-end rounded-[1.5rem] px-1.5 py-1">
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
              // 타이핑하면 다시 접는다 -- 셰브런으로 펼친 뒤 계속 쓰면 자리를 도로 비워준다(FB식).
              setAttachCollapsed(true)
            }}
            onFocus={() => setAttachCollapsed(true)}
            onBlur={() => setAttachCollapsed(false)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                sendDraft()
              }
            }}
          />
          {/* 높이를 textarea 단일 줄(min-h-7 = 28px)에 맞춘다 -- items-end에서 바닥이 같고 높이도
              같아야 이모지와 글자의 중앙이 어긋나지 않는다(28 ≠ 32면 4px 떠 보인다). */}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Choose emoji"
            className="text-primary size-7 shrink-0 rounded-full"
            onMouseDown={(event) => event.preventDefault()}
          >
            <SmileIcon className="size-5" />
          </Button>
        </div>

        {/* 버블 바깥 오른쪽: 이모지가 있던 자리. 초안이 비면 따봉(누르면 👍 전송), 글이 있으면 전송으로
            모핑한다 -- 두 아이콘을 겹쳐 크로스페이드. 모바일·데스크톱 공통이라 이 버튼 하나로 끝난다. */}
        <Button
          variant="ghost"
          size="icon"
          aria-label={canSend ? "Send message" : "Send a like"}
          // 쿨다운은 따봉(초안 없음)일 때만 잠근다 -- 글이 있으면 전송이라 막을 이유가 없다.
          disabled={!canSend && likeCoolingDown}
          className="text-primary relative col-start-3 shrink-0 overflow-hidden"
          onMouseDown={(event) => event.preventDefault()}
          onClick={canSend ? sendDraft : sendLike}
        >
          <span className="relative block size-5">
            <ThumbsUpIcon
              className={cn(
                "absolute inset-0 size-5 transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none",
                canSend ? "scale-90 opacity-0" : "scale-100 opacity-100"
              )}
            />
            <SendIcon
              className={cn(
                "absolute inset-0 size-5 transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none",
                canSend ? "scale-100 opacity-100" : "scale-90 opacity-0"
              )}
            />
          </span>
        </Button>
      </div>
    </footer>
  )
}
