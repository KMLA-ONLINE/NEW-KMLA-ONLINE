import { XIcon } from "lucide-react"
import { useMemo, useState } from "react"

import { ProfileAvatarLink } from "~/components/profile/profile-avatar"
import { Button } from "~/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "~/components/ui/dialog"
import { Twemoji } from "~/components/ui/twemoji"
import type { GroupPostReactor } from "~/lib/group/types"
import { getReactionGlyph, type ReactionType } from "~/lib/reactions"
import { cn } from "~/lib/utils"

// 상단 필터 탭 한 칸. -mb-px로 버튼 아래 테두리를 헤더의 border-b 위에 겹쳐, 활성 밑줄이 구분선에
// 딱 붙게 한다(페북과 같은 밑줄 탭). Radix Tabs의 line 변형은 밑줄을 5px 띄워 이 배치와 안 맞는다.
function ReactionTab({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "-mb-px flex flex-none items-center gap-1.5 border-b-2 px-3 py-3 text-sm font-medium whitespace-nowrap transition-colors",
        active
          ? "border-primary text-foreground"
          : "text-muted-foreground hover:text-foreground border-transparent"
      )}
    >
      {children}
    </button>
  )
}

// 요약 이모지를 눌렀을 때 뜨는 "누가 어떤 이모지로 반응했나" 목록. 데스크톱은 가운데 모달,
// 모바일은 풀스크린(상세/작성 모달과 같은 패턴). 페북 참고 UI에서 "함께 아는 친구 n명"과
// 메시지 버튼은 뺐다 -- 여기 필요한 건 "누가 어떤 반응을 눌렀나"뿐이다.
export function GroupReactionListDialog({
  open,
  onOpenChange,
  reactors,
  reactionTypes,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  reactors: GroupPostReactor[]
  reactionTypes: ReactionType[]
}) {
  const typeById = useMemo(
    () => new Map(reactionTypes.map((type) => [type.id, type])),
    [reactionTypes]
  )

  // 탭: "전체" + 실제로 눌린 반응 타입만, 많은 순으로. 아무도 안 누른 타입은 탭을 만들지 않는다.
  const tabs = useMemo(() => {
    const counts = new Map<number, number>()
    for (const reactor of reactors) {
      counts.set(reactor.reactionTypeId, (counts.get(reactor.reactionTypeId) ?? 0) + 1)
    }
    return [...counts.entries()]
      .map(([id, count]) => ({ type: typeById.get(id), count }))
      .filter((tab): tab is { type: ReactionType; count: number } => Boolean(tab.type))
      .sort((a, b) => b.count - a.count)
  }, [reactors, typeById])

  // "전체"는 시간순(최신 반응이 위)으로 보여준다 -- 타입별로 뭉쳐 있으면 "누가 언제 눌렀나"가
  // 안 읽힌다. 타입 탭도 같은 정렬을 물려받는다(필터만 다르다). ISO 문자열이라 사전순=시간순.
  const ordered = useMemo(
    () => [...reactors].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [reactors]
  )

  // null = "전체", 아니면 특정 타입 id. 다른 글을 열 때 이전 선택이 남지 않게 닫힐 때 초기화한다.
  const [activeTypeId, setActiveTypeId] = useState<number | null>(null)
  const visible =
    activeTypeId === null
      ? ordered
      : ordered.filter((reactor) => reactor.reactionTypeId === activeTypeId)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setActiveTypeId(null)
        onOpenChange(next)
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="flex h-[70svh] flex-col gap-0 overflow-hidden p-0 max-sm:top-0 max-sm:left-0 max-sm:h-svh max-sm:max-h-svh max-sm:max-w-full max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:border-0 sm:max-w-md"
      >
        {/* 제목/설명은 스크린리더용. 화면 헤더 역할은 아래 탭 줄이 한다(페북과 같은 배치). */}
        <DialogTitle className="sr-only">반응한 사람</DialogTitle>
        <DialogDescription className="sr-only">이 게시물에 반응한 사람 목록</DialogDescription>

        <div className="flex shrink-0 items-center border-b pr-2">
          <div
            role="tablist"
            aria-label="반응 종류"
            className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overflow-y-hidden px-2"
          >
            <ReactionTab active={activeTypeId === null} onClick={() => setActiveTypeId(null)}>
              전체 {reactors.length}
            </ReactionTab>
            {tabs.map((tab) => (
              <ReactionTab
                key={tab.type.id}
                active={activeTypeId === tab.type.id}
                onClick={() => setActiveTypeId(tab.type.id)}
              >
                <Twemoji text={getReactionGlyph(tab.type)} className="text-base leading-none" />
                {tab.count}
              </ReactionTab>
            ))}
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onOpenChange(false)}
            aria-label="닫기"
            className="text-muted-foreground ml-1 shrink-0 rounded-full"
          >
            <XIcon />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {visible.length > 0 ? (
            <ul className="flex flex-col">
              {visible.map((reactor) => {
                const type = typeById.get(reactor.reactionTypeId)
                return (
                  <li key={reactor.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5">
                    <ProfileAvatarLink profile={reactor} size="lg">
                      {type?.icon ? (
                        <span className="bg-background ring-background absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full ring-2">
                          <Twemoji text={type.icon} className="text-xs leading-none" />
                        </span>
                      ) : null}
                    </ProfileAvatarLink>
                    <span className="truncate text-sm font-semibold">{reactor.name}</span>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-muted-foreground py-10 text-center text-sm">아직 반응이 없습니다</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
