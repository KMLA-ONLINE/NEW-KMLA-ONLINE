type SpaceCardVariant = "community" | "group"

type SpaceCardSpace = {
  name: string
  description: string
  memberCount?: string
}

export function SpaceCard({
  space,
  variant,
}: {
  space: SpaceCardSpace
  variant: SpaceCardVariant
}) {
  return (
    <article className="grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border bg-white px-3 py-3 transition hover:border-blue-200 hover:shadow-sm sm:grid-cols-[4rem_minmax(0,1fr)_auto] sm:gap-4 sm:rounded-2xl sm:p-4">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-base font-bold text-blue-500 sm:h-16 sm:w-16 sm:rounded-xl sm:text-xl">
        {space.name.slice(0, 1)}
      </div>

      <div className="min-w-0">
        <h2 className="truncate text-base font-semibold sm:text-lg">{space.name}</h2>

        <p className="text-muted-foreground mt-0.5 truncate text-sm sm:mt-1">{space.description}</p>

        {variant === "community" && space.memberCount ? (
          <p className="text-muted-foreground mt-1 text-xs">멤버 {space.memberCount}</p>
        ) : null}
      </div>

      <button className="rounded-md border px-3 py-1.5 text-sm font-medium sm:px-4 sm:py-2">
        열기
      </button>
    </article>
  )
}
