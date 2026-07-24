import {
  BadgeCheckIcon,
  Globe2Icon,
  LockIcon,
  MoreHorizontalIcon,
  VenetianMaskIcon,
} from "lucide-react"
import { useState } from "react"

import { GroupLeaveDialog } from "~/components/group/group-leave-dialog"
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
  canViewMembers,
  canCurate,
  onViewSettings,
}: {
  group: GroupSpace
  className?: string
  viewMode: PostViewMode
  onViewModeChange: (mode: PostViewMode) => void
  /** "멤버 N명"을 누르면 멤버 탭으로. 탭은 부모(group 라우트)의 로컬 상태라 콜백으로 올린다. */
  onViewMembers: () => void
  /** 항상 익명 그룹에서는 owner/admin만 실명 멤버 명부를 볼 수 있다. */
  canViewMembers: boolean
  canCurate: boolean
  onViewSettings: () => void
}) {
  // invite_only만 비공개(검색 노출 X). public·request(승인가입)는 검색에 노출되니 공개로 묶는다.
  const isPrivate = group.joinPolicy === "invite_only"
  const VisibilityIcon = isPrivate ? LockIcon : Globe2Icon
  const visibilityLabel = isPrivate ? "비공개 그룹" : "공개 그룹"
  // space_type: group=공식, community=비공식. 공식이면 제목 옆에 인증 표시.
  const isOfficial = group.type === "group"
  const [notiOpen, setNotiOpen] = useState(false)
  const [leaveOpen, setLeaveOpen] = useState(false)

  return (
    <section className={cn("bg-card overflow-hidden", className)}>
      <div className="from-primary/30 to-primary/5 aspect-4/1 w-full overflow-hidden bg-linear-to-br">
        {group.coverImageUrl ? (
          <img src={group.coverImageUrl} alt="" className="size-full object-cover" />
        ) : null}
      </div>
      <div className="flex items-start gap-5 p-4">
        <div className="bg-muted border-border hidden size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border text-2xl font-semibold shadow-xs sm:flex sm:size-20">
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
              {canViewMembers ? (
                <button type="button" onClick={onViewMembers} className="hover:underline">
                  멤버 {group.memberCount}명
                </button>
              ) : (
                <>멤버 {group.memberCount}명</>
              )}
            </span>
          </p>
          {group.anonymityPolicy === "required" ? (
            <p className="text-muted-foreground mt-1 flex items-center gap-1.5 text-xs">
              <VenetianMaskIcon className="size-3.5" aria-hidden="true" />
              게시물, 댓글, 반응이 모두 익명입니다
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-1 pt-1">
          {/* 알림 설정 Dialog와 나가기 AlertDialog를 여는 메뉴라 non-modal이다. 메뉴와 뒤이어
              열리는 모달이 body의 pointer-events 잠금을 겹쳐 쥐면, 둘이 함께 닫힐 때 잠금이
              풀리지 않아 페이지 전체가 클릭 불가가 된다. */}
          <DropdownMenu modal={false}>
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
              {canCurate ? (
                <DropdownMenuItem className="sm:hidden" onSelect={onViewSettings}>
                  그룹 설정
                </DropdownMenuItem>
              ) : null}
              {/* 공식 그룹(학생회·사감부 등)은 소속이지 취향 가입이 아니라서 나가기가 없다 --
                재가입도 초대·승인이 아니라 소속 변경(전학·부서 이동)으로 처리된다. */}
              {isOfficial ? null : (
                <DropdownMenuItem variant="destructive" onSelect={() => setLeaveOpen(true)}>
                  그룹 나가기
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <GroupNotificationsDialog
        open={notiOpen}
        onOpenChange={setNotiOpen}
        mentionsAllowed={group.anonymityPolicy !== "required"}
      />
      <GroupLeaveDialog group={group} open={leaveOpen} onOpenChange={setLeaveOpen} />
    </section>
  )
}
