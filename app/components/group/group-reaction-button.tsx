import { ThumbsUpIcon } from "lucide-react"
import type { PointerEvent } from "react"
import { useEffect, useRef, useState } from "react"

import { QuickReactionList } from "~/components/quick-reaction-list"
import { Popover, PopoverAnchor, PopoverContent } from "~/components/ui/popover"
import { Twemoji } from "~/components/ui/twemoji"
import { getReactionGlyph, type ReactionType } from "~/lib/reactions"
import { cn } from "~/lib/utils"

const LONG_PRESS_MS = 350
const HOVER_OPEN_MS = 500
const HOVER_CLOSE_MS = 100

// 페북식 좋아요 버튼. 짧게 누르면 기본 반응(좋아요) 토글, 꾹 누르면(롱프레스) quick
// reaction 피커가 위로 뜬다. 데스크톱에서는 일정 시간 hover해도 피커가 뜬다.
// 반응 저장은 백엔드 붙일 때 -- 지금은 화면 상태만.
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
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimer = () => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }

  const clearHoverTimer = () => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current)
      hoverTimer.current = null
    }
  }

  const clearCloseTimer = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }

  // 버튼 -> 포털에 뜬 content로 마우스를 옮기는 동안 바로 닫히지 않도록 약간의 유예를 둔다.
  const scheduleClose = () => {
    clearCloseTimer()
    closeTimer.current = setTimeout(() => setOpen(false), HOVER_CLOSE_MS)
  }

  // 롱프레스/hover 대기 중 언마운트되면(예: 보기 모드 전환으로 카드 제거) 남은 타이머를 정리한다.
  useEffect(
    () => () => {
      clearTimer()
      clearHoverTimer()
      clearCloseTimer()
    },
    []
  )

  // 터치 기기(핸드폰·패드)에서 피커가 열려 있는 동안 배경 스크롤을 막는다. 롱프레스로
  // 피커를 연 채 손가락을 떼지 않고 반응을 고르려 할 때 페이지가 같이 스크롤되는 걸 방지.
  useEffect(() => {
    if (!open) return
    if (!window.matchMedia("(pointer: coarse)").matches) return

    const preventScroll = (event: TouchEvent) => event.preventDefault()
    document.addEventListener("touchmove", preventScroll, { passive: false })
    return () => document.removeEventListener("touchmove", preventScroll)
  }, [open])

  // 마우스로만 hover-open을 트리거(터치는 pointerType이 "touch"라 무시됨).
  const handleButtonPointerEnter = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return
    clearCloseTimer()
    clearHoverTimer()
    hoverTimer.current = setTimeout(() => setOpen(true), HOVER_OPEN_MS)
  }

  const handleButtonPointerLeave = (event: PointerEvent) => {
    clearTimer()
    if (event.pointerType !== "mouse") return
    clearHoverTimer()
    scheduleClose()
  }

  const handleContentPointerEnter = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return
    clearCloseTimer()
  }

  const handleContentPointerLeave = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return
    scheduleClose()
  }

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
    clearHoverTimer()
    clearCloseTimer()
    setSelected(reaction)
    setOpen(false)
  }

  const displayCount = count + (selected ? 1 : 0)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={handleClick}
          onPointerDown={handlePointerDown}
          onPointerUp={clearTimer}
          onPointerEnter={handleButtonPointerEnter}
          onPointerLeave={handleButtonPointerLeave}
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
      </PopoverAnchor>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-auto rounded-full p-1"
        onPointerEnter={handleContentPointerEnter}
        onPointerLeave={handleContentPointerLeave}
      >
        <QuickReactionList reactionTypes={reactionTypes} onSelect={pick} />
      </PopoverContent>
    </Popover>
  )
}
