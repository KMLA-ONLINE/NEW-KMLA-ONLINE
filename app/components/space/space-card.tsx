import { PinIcon } from "lucide-react"
import { Link } from "react-router"

import { cn } from "~/lib/utils"

type SpaceCardVariant = "community" | "group"

type SpaceCardSpace = {
  name: string
  description: string
  memberCount?: string
  /** spaces.image_url 기반 서명 URL. 없으면 이니셜 폴백. */
  imageUrl?: string | null
}

export function SpaceCard({
  space,
  variant,
  actionLabel = "열기",
  to,
  isPinned,
  onTogglePin,
}: {
  space: SpaceCardSpace
  variant: SpaceCardVariant
  actionLabel?: string
  /**
   * 카드를 눌렀을 때 갈 곳(그룹 내부 /groups/:pubId). 주면 카드 전체가 링크가 되고
   * actionLabel은 같은 곳으로 가므로 버튼이 아니라 장식이 된다. 안 주면 카드는 링크가 아니고
   * actionLabel이 버튼으로 남는다 -- 아직 못 들어가는 미가입 그룹의 "가입"이 그 경우다.
   */
  to?: string
  /** space_members.pinned_at 중 내 행이 있는지. 개인 고정이라 나에게만 보인다. */
  isPinned?: boolean
  /** 주면 핀 토글이 뜬다. 안 주면 고정을 못 거는 목록이다(예: 아직 가입 안 한 그룹). */
  onTogglePin?: () => void
}) {
  return (
    <article className="bg-card hover:ring-primary/50 relative grid grid-cols-[3.5rem_minmax(0,1fr)] gap-3 rounded-2xl border p-4 transition hover:ring-2 sm:grid-cols-[4rem_minmax(0,1fr)_auto] sm:items-center sm:gap-4">
      <div className="border-primary/20 bg-primary/10 text-primary flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border text-lg font-bold sm:size-16 sm:text-xl">
        {space.imageUrl ? (
          // 이름이 바로 옆에 있으므로 장식이다 -- 스크린리더가 같은 말을 두 번 읽지 않게 alt는 빈다.
          <img src={space.imageUrl} alt="" className="size-full object-cover" />
        ) : (
          space.name.slice(0, 1)
        )}
      </div>

      <div className="min-w-0 self-center">
        <h2 className="truncate text-lg font-semibold">
          {to ? (
            // after:inset-0으로 카드 전체를 덮어 어디를 눌러도 그룹이 열린다. 링크는 이거 하나뿐이라
            // 스크린리더가 카드를 중복해서 읽지 않고, 링크 이름은 그룹 이름 그대로다.
            <Link to={to} className="after:absolute after:inset-0">
              {space.name}
            </Link>
          ) : (
            space.name
          )}
        </h2>

        <p className="text-muted-foreground mt-1 hidden truncate text-sm sm:block">
          {space.description}
        </p>
      </div>

      <p className="text-muted-foreground col-span-2 truncate text-sm sm:hidden">
        {space.description}
      </p>

      <div className="col-span-2 flex items-center justify-end gap-3 sm:col-span-1 sm:flex-col sm:items-end sm:justify-between">
        {variant === "community" && space.memberCount ? (
          <span className="text-muted-foreground text-xs">멤버 {space.memberCount}</span>
        ) : null}

        <div className="flex items-center gap-2">
          {onTogglePin ? (
            <button
              type="button"
              onClick={onTogglePin}
              aria-pressed={isPinned}
              aria-label={isPinned ? `${space.name} 고정 해제` : `${space.name} 고정`}
              // 카드 전체가 링크라(위 after:inset-0) 그 오버레이보다 위에 있어야 눌린다.
              className={cn(
                "hover:bg-muted relative z-10 flex size-9 items-center justify-center rounded-md transition-colors",
                isPinned ? "text-primary" : "text-muted-foreground"
              )}
            >
              <PinIcon
                className={cn("size-4 -rotate-45", isPinned && "fill-current")}
                aria-hidden="true"
              />
            </button>
          ) : null}

          {to ? (
            <span className="rounded-md border px-4 py-2 text-sm font-medium">{actionLabel}</span>
          ) : (
            <button
              type="button"
              className="relative z-10 rounded-md border px-4 py-2 text-sm font-medium"
            >
              {actionLabel}
            </button>
          )}
        </div>
      </div>
    </article>
  )
}
