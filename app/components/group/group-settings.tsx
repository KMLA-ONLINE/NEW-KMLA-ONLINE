import { CheckIcon, ChevronDownIcon, ChevronUpIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { useState } from "react"

import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import type { GroupCategory, GroupSpace } from "~/lib/group/types"

// 관리자 전용 그룹 설정. 실수로 바꾸기 쉽지 않게 각 섹션은 읽기 모드가 기본이고, "편집"을
// 누른 뒤에만 수정할 수 있다(저장/취소). 백엔드 전이라 저장은 로컬 상태만 갱신한다 --
// 이름/설명/가입정책은 spaces, 카테고리는 space_categories 컬럼으로 갈 자리.
//
// TODO(backend): 지금 이름/설명/카테고리 편집은 각 섹션 로컬 state에만 커밋돼(joinPolicy만 부모로
// 리프팅됨) 헤더·사이드바·칩과 어긋나고 탭 전환 시 사라진다. 붙일 때는 action으로 저장 후 loader
// revalidate가 단일 소스를 갱신하게 해 이 로컬-only 편집을 대체한다(그때 UI 불일치도 자연 해소).

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

// 카드 헤더: 제목 + 편집/저장·취소. 읽기 모드에선 "편집"만, 편집 모드에선 취소·저장.
function SectionHeader({
  title,
  editing,
  onEdit,
  onCancel,
  onSave,
}: {
  title: string
  editing: boolean
  onEdit: () => void
  onCancel: () => void
  onSave: () => void
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-sm font-semibold">{title}</h2>
      {editing ? (
        <div className="flex gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            취소
          </Button>
          <Button type="button" size="sm" onClick={onSave}>
            저장
          </Button>
        </div>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={onEdit}>
          편집
        </Button>
      )}
    </div>
  )
}

function SettingsCard({ children }: { children: React.ReactNode }) {
  return <section className="bg-card px-4 py-3 sm:rounded-xl sm:border sm:p-4">{children}</section>
}

function BasicInfoSection({ group }: { group: GroupSpace }) {
  const [name, setName] = useState(group.name)
  const [description, setDescription] = useState(group.description)
  const [editing, setEditing] = useState(false)
  // 편집 중 초안. 취소하면 버리고, 저장할 때만 커밋한다.
  const [draftName, setDraftName] = useState(name)
  const [draftDescription, setDraftDescription] = useState(description)

  const edit = () => {
    setDraftName(name)
    setDraftDescription(description)
    setEditing(true)
  }
  const save = () => {
    setName(draftName)
    setDescription(draftDescription)
    setEditing(false)
  }

  return (
    <SettingsCard>
      <SectionHeader
        title="기본 정보"
        editing={editing}
        onEdit={edit}
        onCancel={() => setEditing(false)}
        onSave={save}
      />
      {editing ? (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-muted-foreground text-xs">그룹 이름</span>
            <Input value={draftName} onChange={(event) => setDraftName(event.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-muted-foreground text-xs">설명</span>
            <textarea
              value={draftDescription}
              onChange={(event) => setDraftDescription(event.target.value)}
              className="border-input focus-visible:ring-ring min-h-20 resize-none rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-2"
            />
          </label>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">{name}</p>
          <p className="text-muted-foreground text-sm whitespace-pre-line">
            {description || "설명 없음"}
          </p>
        </div>
      )}
    </SettingsCard>
  )
}

function JoinPolicySection({
  policy,
  onChange,
}: {
  policy: GroupSpace["joinPolicy"]
  onChange: (next: GroupSpace["joinPolicy"]) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(policy)
  const current = JOIN_POLICY_OPTIONS.find((option) => option.value === policy)

  const edit = () => {
    setDraft(policy)
    setEditing(true)
  }
  const save = () => {
    // 전환 side effect(request에서 벗어날 때 대기 요청 정리 -- 비공개=거절/공개=수락)는 부모가 처리.
    onChange(draft)
    setEditing(false)
  }

  return (
    <SettingsCard>
      <SectionHeader
        title="가입 정책"
        editing={editing}
        onEdit={edit}
        onCancel={() => setEditing(false)}
        onSave={save}
      />
      {editing ? (
        <div role="radiogroup" aria-label="가입 정책" className="flex flex-col">
          {JOIN_POLICY_OPTIONS.map((option) => {
            const selected = option.value === draft
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setDraft(option.value)}
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
      ) : (
        <div>
          <p className="text-sm font-medium">{current?.label}</p>
          <p className="text-muted-foreground text-xs">{current?.description}</p>
        </div>
      )}
    </SettingsCard>
  )
}

// 카테고리 CRUD + 순서(편집 모드 전용, controlled). sort_order는 배열 순서에서 파생.
function CategoryEditor({
  categories,
  onChange,
}: {
  categories: GroupCategory[]
  onChange: (next: GroupCategory[]) => void
}) {
  const [newName, setNewName] = useState("")

  // sort_order는 배열 순서에서 파생한다 -- 변경 결과를 항상 index로 재계산해 배열 순서와
  // space_categories.sort_order가 어긋나지 않게 한다(그냥 onChange로 넘기면 move가 값을 안 고쳐 어긋남).
  const commit = (next: GroupCategory[]) =>
    onChange(next.map((category, index) => ({ ...category, sortOrder: index })))

  const rename = (id: number, name: string) =>
    commit(categories.map((c) => (c.id === id ? { ...c, name } : c)))
  const remove = (id: number) => commit(categories.filter((c) => c.id !== id))
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= categories.length) return
    const next = [...categories]
    ;[next[index], next[target]] = [next[target], next[index]]
    commit(next)
  }
  const add = () => {
    const name = newName.trim()
    if (!name) return
    // TODO(backend): id는 space_categories.id(bigserial). 지금은 임시 음수 id -- 서버 insert 응답의
    // 실제 id로 교체(또는 revalidate)해야 하고, 그 전엔 posts.category_id로 참조하면 안 된다.
    // 또 lower(btrim(name)) 유니크 인덱스가 있으니 저장 시 중복 이름은 서버에서 거부될 수 있다.
    const tempId = Math.min(0, ...categories.map((c) => c.id)) - 1
    commit([...categories, { id: tempId, name, sortOrder: categories.length }])
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

function CategorySection({ initial }: { initial: GroupCategory[] }) {
  const [categories, setCategories] = useState(
    [...initial].sort((a, b) => a.sortOrder - b.sortOrder)
  )
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(categories)

  const edit = () => {
    setDraft(categories)
    setEditing(true)
  }
  const save = () => {
    setCategories(draft)
    setEditing(false)
  }

  return (
    <SettingsCard>
      <SectionHeader
        title="카테고리"
        editing={editing}
        onEdit={edit}
        onCancel={() => setEditing(false)}
        onSave={save}
      />
      {editing ? (
        <CategoryEditor categories={draft} onChange={setDraft} />
      ) : categories.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {categories.map((category) => (
            <span key={category.id} className="bg-muted rounded-full px-3 py-1 text-sm">
              {category.name}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          카테고리가 없습니다. 편집에서 추가하면 피드 상단에 필터로 나타납니다.
        </p>
      )}
    </SettingsCard>
  )
}

export function GroupSettings({
  group,
  categories,
  joinPolicy,
  onJoinPolicyChange,
}: {
  group: GroupSpace
  categories: GroupCategory[]
  joinPolicy: GroupSpace["joinPolicy"]
  onJoinPolicyChange: (next: GroupSpace["joinPolicy"]) => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <BasicInfoSection group={group} />
      <JoinPolicySection policy={joinPolicy} onChange={onJoinPolicyChange} />
      <CategorySection initial={categories} />
    </div>
  )
}
