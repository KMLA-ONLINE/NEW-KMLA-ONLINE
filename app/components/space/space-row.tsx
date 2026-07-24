import { PinIcon, VenetianMaskIcon } from "lucide-react"
import { Link } from "react-router"

import { SpaceAvatar } from "~/components/space/space-avatar"
import { Badge } from "~/components/ui/badge"
import { formatMemberCount } from "~/lib/space/format"
import type { SpaceSummary } from "~/lib/space/types"
import { cn } from "~/lib/utils"

/**
 * **이미 내 그룹**인 것들의 줄. 여기 온 사람은 그룹을 고르러 온 게 아니라 들어가러 왔으므로
 * 설득할 게 없다 -- 촘촘하게, 한 번에 많이 보이게. (모르는 그룹을 권하는 SpaceDiscoverCard가
 * 커버까지 펼쳐 보이는 것과 일부러 반대다.)
 */
export function SpaceRow({ space, onTogglePin }: { space: SpaceSummary; onTogglePin: () => void }) {
  const pinned = space.pinnedAt !== null

  return (
    <li className="bg-card hover:bg-muted/40 relative flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors">
      <SpaceAvatar space={space} className="size-11 text-base" />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-semibold">
            {/* after:inset-0으로 줄 전체를 덮어 어디를 눌러도 열린다. 링크가 이거 하나뿐이라
                스크린리더가 줄을 중복해서 읽지 않고, 링크 이름은 그룹 이름 그대로다. */}
            <Link to={`/groups/${space.pubId}`} className="after:absolute after:inset-0">
              {space.name}
            </Link>
          </p>
          {space.anonymityPolicy === "required" ? (
            <Badge variant="secondary">
              <VenetianMaskIcon data-icon="inline-start" aria-hidden="true" />
              항상 익명
            </Badge>
          ) : null}
        </div>
        <p className="text-muted-foreground truncate text-xs">
          {/* 공식 그룹은 전교생이 속해 있어 멤버 수가 다 같다 -- 신호가 없으니 안 보여준다. */}
          {space.type === "community" ? (
            <span className="tabular-nums">멤버 {formatMemberCount(space.memberCount)}명 · </span>
          ) : null}
          {space.description}
        </p>
      </div>

      <button
        type="button"
        onClick={onTogglePin}
        aria-pressed={pinned}
        aria-label={pinned ? `${space.name} 고정 해제` : `${space.name} 고정`}
        // 줄 전체가 링크라(위 after:inset-0) 그 오버레이보다 위에 있어야 눌린다.
        className={cn(
          "hover:bg-muted relative z-10 flex size-9 shrink-0 items-center justify-center rounded-md transition-colors",
          pinned ? "text-primary" : "text-muted-foreground/50 hover:text-foreground"
        )}
      >
        <PinIcon className={cn("size-4 -rotate-45", pinned && "fill-current")} aria-hidden="true" />
      </button>
    </li>
  )
}
