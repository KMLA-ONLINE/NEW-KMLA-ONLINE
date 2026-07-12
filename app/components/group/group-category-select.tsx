import { ChevronDownIcon, TagIcon } from "lucide-react"

import { Button } from "~/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import type { GroupCategory } from "~/lib/group/types"

// 작성/수정 모달의 카테고리 선택(단일). "없음"(미분류) + 각 카테고리. 카테고리 0개면 안 뜬다.
// 값은 부모가 categoryId(null=미분류)로 들고 저장 시 posts.category_id로 내려간다.
export function GroupCategorySelect({
  categories,
  selected,
  onSelect,
  className,
}: {
  categories: GroupCategory[]
  selected: number | null
  onSelect: (id: number | null) => void
  className?: string
}) {
  if (categories.length === 0) return null

  const sorted = [...categories].sort((a, b) => a.sortOrder - b.sortOrder)
  const current = categories.find((category) => category.id === selected)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className={className}>
          <TagIcon className="size-4" aria-hidden="true" />
          {current ? current.name : "카테고리"}
          <ChevronDownIcon className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={selected === null ? "none" : String(selected)}
          onValueChange={(value) => onSelect(value === "none" ? null : Number(value))}
        >
          <DropdownMenuRadioItem value="none">없음</DropdownMenuRadioItem>
          {sorted.map((category) => (
            <DropdownMenuRadioItem key={category.id} value={String(category.id)}>
              {category.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
