import { CheckIcon, ChevronDownIcon, ChevronUpIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { useState } from "react"

import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import type { GroupCategory, GroupSpace } from "~/lib/group/types"

// 관리자 전용 그룹 설정. 백엔드 전이라 전부 로컬 상태(저장 없음). 이름/설명/가입정책은 spaces
// 컬럼, 카테고리는 space_categories에 대응 -- 저장 경로는 백엔드 붙일 때.

const JOIN_POLICY_OPTIONS: {
  value: GroupSpace["joinPolicy"]
  label: string
  description: string
}[] = [
  {
    value: "public",
    label: "공개 · 즉시 가입",
    description: "검색에 노출되고 누구나 바로 가입합니다",
  },
  {
    value: "request",
    label: "공개 · 승인 후 가입",
    description: "검색에 노출되지만 매니저 승인이 필요합니다",
  },
  {
    value: "invite_only",
    label: "비공개 · 초대 전용",
    description: "검색에 노출되지 않고 초대로만 가입합니다",
  },
]

function SettingsCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-card px-4 py-3 sm:rounded-xl sm:border sm:p-4">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  )
}

// 카테고리 CRUD + 순서. sort_order는 배열 순서에서 파생하므로 위/아래로 자리를 바꾼다.
function CategoryManager({ initial }: { initial: GroupCategory[] }) {
  const [categories, setCategories] = useState(
    [...initial].sort((a, b) => a.sortOrder - b.sortOrder)
  )
  const [newName, setNewName] = useState("")

  const rename = (id: number, name: string) =>
    setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, name } : c)))

  const remove = (id: number) => setCategories((prev) => prev.filter((c) => c.id !== id))

  const move = (index: number, direction: -1 | 1) =>
    setCategories((prev) => {
      const target = index + direction
      if (target < 0 || target >= prev.length) return prev
      const next = [...prev]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })

  const add = () => {
    const name = newName.trim()
    if (!name) return
    const nextId = Math.max(0, ...categories.map((c) => c.id)) + 1
    setCategories((prev) => [...prev, { id: nextId, name, sortOrder: prev.length }])
    setNewName("")
  }

  return (
    <div className="flex flex-col gap-2">
      {categories.map((category, index) => (
        <div key={category.id} className="flex items-center gap-1.5">
          <Input
            value={category.name}
            onChange={(event) => rename(category.id, event.target.value)}
            aria-label="카테고리 이름"
            className="flex-1"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => move(index, -1)}
            disabled={index === 0}
            aria-label="위로"
          >
            <ChevronUpIcon />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => move(index, 1)}
            disabled={index === categories.length - 1}
            aria-label="아래로"
          >
            <ChevronDownIcon />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => remove(category.id)}
            aria-label="삭제"
            className="text-muted-foreground"
          >
            <Trash2Icon />
          </Button>
        </div>
      ))}

      {categories.length === 0 ? (
        <p className="text-muted-foreground py-2 text-sm">
          카테고리가 없습니다. 추가하면 피드 상단에 필터로 나타납니다.
        </p>
      ) : null}

      <div className="mt-1 flex items-center gap-2">
        <Input
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              add()
            }
          }}
          placeholder="새 카테고리"
          className="flex-1"
        />
        <Button type="button" size="sm" onClick={add} disabled={!newName.trim()}>
          <PlusIcon className="size-4" aria-hidden="true" />
          추가
        </Button>
      </div>
    </div>
  )
}

export function GroupSettings({
  group,
  categories,
}: {
  group: GroupSpace
  categories: GroupCategory[]
}) {
  const [joinPolicy, setJoinPolicy] = useState(group.joinPolicy)

  return (
    <div className="flex flex-col gap-4">
      <SettingsCard title="기본 정보">
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-muted-foreground text-xs">그룹 이름</span>
            <Input defaultValue={group.name} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-muted-foreground text-xs">설명</span>
            <textarea
              defaultValue={group.description}
              className="border-input focus-visible:ring-ring min-h-20 resize-none rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-2"
            />
          </label>
        </div>
      </SettingsCard>

      <SettingsCard title="가입 정책">
        <div role="radiogroup" aria-label="가입 정책" className="flex flex-col">
          {JOIN_POLICY_OPTIONS.map((option) => {
            const selected = option.value === joinPolicy
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setJoinPolicy(option.value)}
                className="hover:bg-muted flex items-center gap-3 rounded-lg p-2.5 text-left transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{option.label}</p>
                  <p className="text-muted-foreground text-xs">{option.description}</p>
                </div>
                {selected ? (
                  <CheckIcon className="text-primary size-5 shrink-0" aria-hidden="true" />
                ) : null}
              </button>
            )
          })}
        </div>
      </SettingsCard>

      <SettingsCard title="카테고리">
        <CategoryManager initial={categories} />
      </SettingsCard>
    </div>
  )
}
