import type { GroupCategory } from "~/lib/group/types"
import { cn } from "~/lib/utils"

// 그룹 피드 상단의 카테고리 필터 칩. "전체" + 각 카테고리(sort_order 순). 선택은 부모가
// categoryId로 들고 필터한다(null=전체). 카테고리 0개면 렌더하지 않는다.
export function GroupCategoryChips({
  categories,
  selected,
  onSelect,
}: {
  categories: GroupCategory[]
  selected: number | null
  onSelect: (id: number | null) => void
}) {
  if (categories.length === 0) return null

  const sorted = [...categories].sort((a, b) => a.sortOrder - b.sortOrder)

  const chipClass = (active: boolean) =>
    cn(
      "shrink-0 rounded-full border px-3 py-1 text-sm font-medium transition-colors",
      active
        ? "border-foreground bg-foreground text-background"
        : "text-muted-foreground hover:bg-muted border-transparent"
    )

  return (
    <div
      className="no-scrollbar flex gap-2 overflow-x-auto px-4 sm:px-0"
      role="tablist"
      aria-label="카테고리"
    >
      <button
        type="button"
        role="tab"
        aria-selected={selected === null}
        onClick={() => onSelect(null)}
        className={chipClass(selected === null)}
      >
        전체
      </button>
      {sorted.map((category) => (
        <button
          key={category.id}
          type="button"
          role="tab"
          aria-selected={selected === category.id}
          onClick={() => onSelect(category.id)}
          className={chipClass(selected === category.id)}
        >
          {category.name}
        </button>
      ))}
    </div>
  )
}
