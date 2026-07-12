import { Link } from "react-router"

type SpaceCardVariant = "community" | "group"

type SpaceCardSpace = {
  name: string
  description: string
  memberCount?: string
}

export function SpaceCard({
  space,
  variant,
  actionLabel = "열기",
  to,
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
}) {
  return (
    <article className="relative grid grid-cols-[3.5rem_minmax(0,1fr)] gap-3 rounded-2xl border bg-white p-4 transition hover:border-blue-200 hover:shadow-sm sm:grid-cols-[4rem_minmax(0,1fr)_auto] sm:items-center sm:gap-4">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 text-lg font-bold text-blue-500 sm:h-16 sm:w-16 sm:text-xl">
        {space.name.slice(0, 1)}
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

        {to ? (
          <span className="rounded-md border px-4 py-2 text-sm font-medium">{actionLabel}</span>
        ) : (
          <button type="button" className="rounded-md border px-4 py-2 text-sm font-medium">
            {actionLabel}
          </button>
        )}
      </div>
    </article>
  )
}
