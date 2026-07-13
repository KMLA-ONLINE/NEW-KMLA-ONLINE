import { ThumbsUpIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { QuickReactionList } from "~/components/quick-reaction-list"
import { Twemoji } from "~/components/ui/twemoji"
import { getReactionGlyph, type ReactionType } from "~/lib/reactions"
import { cn } from "~/lib/utils"

const LONG_PRESS_MS = 350

// 페북식 좋아요 버튼. 짧게 누르면 기본 반응(좋아요) 토글, 꾹 누르면(롱프레스) quick
// reaction 피커가 위로 뜬다. 반응 저장은 백엔드 붙일 때 -- 지금은 화면 상태만.
export function GroupReactionButton({
  count,
  reactionTypes,
}: {
  count: number
  reactionTypes: ReactionType[]
}) {
  const [selected, setSelected] = useState<ReactionType | null>(null)
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressed = useRef(false)

  const clearTimer = () => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }

  // 롱프레스 대기 중 언마운트되면(예: 보기 모드 전환으로 카드 제거) 남은 타이머를 정리한다.
  useEffect(() => () => clearTimer(), [])

  const handlePointerDown = () => {
    longPressed.current = false
    clearTimer()
    timer.current = setTimeout(() => {
      longPressed.current = true
      setOpen(true)
    }, LONG_PRESS_MS)
  }

  const handleClick = () => {
    // 롱프레스로 피커를 연 클릭은 무시(토글 안 함).
    if (longPressed.current) return
    setSelected((prev) => (prev ? null : (reactionTypes[0] ?? null)))
  }

  const pick = (reaction: ReactionType) => {
    setSelected(reaction)
    setOpen(false)
  }

  const displayCount = count + (selected ? 1 : 0)

  return (
    <div className="relative">
      {open ? (
        // TODO(a11y): 지금은 fixed 백드롭 바깥클릭으로만 닫힌다. Radix Popover로 바꿔 Escape·
        // 포커스 트랩·바깥클릭·stacking을 일괄 처리하는 게 좋다(댓글 반응 피커도 동일 패턴).
        <>
          <button
            type="button"
            aria-label="반응 선택 닫기"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="bg-popover absolute bottom-full left-0 z-50 mb-2 rounded-full border p-1 shadow-md">
            <QuickReactionList reactionTypes={reactionTypes} onSelect={pick} />
          </div>
        </>
      ) : null}

      <button
        type="button"
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerUp={clearTimer}
        onPointerLeave={clearTimer}
        onContextMenu={(event) => event.preventDefault()}
        className={cn(
          "hover:bg-muted flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors select-none",
          selected ? "text-primary font-medium" : "text-muted-foreground hover:text-foreground"
        )}
      >
        {selected ? (
          <Twemoji text={getReactionGlyph(selected)} className="text-base leading-none" />
        ) : (
          <ThumbsUpIcon className="size-4.5" aria-hidden="true" />
        )}
        {displayCount > 0 ? displayCount : null}
      </button>
    </div>
  )
}
