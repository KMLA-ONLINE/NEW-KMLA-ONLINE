import { BadgeCheckIcon, Globe2Icon, LockIcon, MoreHorizontalIcon } from "lucide-react"
import { useState } from "react"

import { GroupNotificationsDialog } from "~/components/group/group-notifications-dialog"
import type { PostViewMode } from "~/components/group/use-post-view-mode"
import { Button } from "~/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip"
import type { GroupSpace } from "~/lib/group/types"
import { cn } from "~/lib/utils"

// 커버 배너 + 그 위로 겹친 그룹 아이콘. 설명은 여기 두지 않고 "그룹 정보" aside에 둔다.
// 프레임(마진·모서리·테두리)은 호출부가 className으로 정한다 -- 모바일 full-bleed 때문.
export function GroupHeader({
  group,
  className,
  viewMode,
  onViewModeChange,
  onViewMembers,
}: {
  group: GroupSpace
  className?: string
  viewMode: PostViewMode
  onViewModeChange: (mode: PostViewMode) => void
  /** "멤버 N명"을 누르면 멤버 탭으로. 탭은 부모(group 라우트)의 로컬 상태라 콜백으로 올린다. */
  onViewMembers: () => void
}) {
  // invite_only만 비공개(검색 노출 X). public·request(승인가입)는 검색에 노출되니 공개로 묶는다.
  const isPrivate = group.joinPolicy === "invite_only"
  const VisibilityIcon = isPrivate ? LockIcon : Globe2Icon
  const visibilityLabel = isPrivate ? "비공개 그룹" : "공개 그룹"
  // space_type: group=공식, community=비공식. 공식이면 제목 옆에 인증 표시.
  const isOfficial = group.type === "group"
  const [notiOpen, setNotiOpen] = useState(false)

  return (
    <section className={cn("bg-card overflow-hidden", className)}>
      <div className="from-primary/30 to-primary/5 h-32 w-full bg-linear-to-br sm:h-44" />
      <div className="flex items-start gap-3 p-4">
        <div className="bg-muted ring-card -mt-12 hidden size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl text-2xl font-semibold ring-4 sm:-mt-14 sm:flex sm:size-20">
          {group.imageUrl ? (
            <img src={group.imageUrl} alt="" className="size-full object-cover" />
          ) : (
            group.name.charAt(0)
          )}
        </div>
        <div className="min-w-0 flex-1 pt-1">
          <div className="flex items-center gap-1.5">
            <h1 className="truncate text-2xl font-bold">{group.name}</h1>
            {isOfficial ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    tabIndex={0}
                    role="img"
                    aria-label="공식 그룹"
                    className="inline-flex shrink-0 cursor-default"
                  >
                    <BadgeCheckIcon className="text-primary size-5 sm:size-6" aria-hidden="true" />
                  </span>
                </TooltipTrigger>
                <TooltipContent>공식 그룹입니다</TooltipContent>
              </Tooltip>
            ) : null}
          </div>
          <p className="text-muted-foreground mt-1 flex items-center gap-1.5 text-sm">
            <VisibilityIcon className="size-3.5 shrink-0" aria-hidden="true" />
            <span>
              {visibilityLabel} ·{" "}
              <button type="button" onClick={onViewMembers} className="hover:underline">
                멤버 {group.memberCount}명
              </button>
            </span>
          </p>
        </div>
        <div className="flex items-center gap-1 pt-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon-sm"
                variant="ghost"
                className="text-muted-foreground"
                aria-label="그룹 옵션"
              >
                <MoreHorizontalIcon className="size-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>게시물 보기</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={viewMode}
                onValueChange={(value) => onViewModeChange(value as PostViewMode)}
              >
                <DropdownMenuRadioItem value="card">카드</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="list">목록</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setNotiOpen(true)}>알림 설정</DropdownMenuItem>
              <DropdownMenuItem variant="destructive">그룹 나가기</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <GroupNotificationsDialog open={notiOpen} onOpenChange={setNotiOpen} />
    </section>
  )
}
