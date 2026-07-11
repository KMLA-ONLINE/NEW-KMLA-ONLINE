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
}: {
  space: SpaceCardSpace
  variant: SpaceCardVariant
  actionLabel?: string
}) {
  return (
    <article className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-3 rounded-2xl border bg-white p-4 transition hover:border-blue-200 hover:shadow-sm sm:grid-cols-[4rem_minmax(0,1fr)_auto] sm:items-center sm:gap-4">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 text-lg font-bold text-blue-500 sm:h-16 sm:w-16 sm:text-xl">
        {space.name.slice(0, 1)}
      </div>

      <div className="min-w-0 self-center">
        <h2 className="truncate text-lg font-semibold">{space.name}</h2>

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

        <button className="rounded-md border px-4 py-2 text-sm font-medium">{actionLabel}</button>
      </div>
    </article>
  )
}
