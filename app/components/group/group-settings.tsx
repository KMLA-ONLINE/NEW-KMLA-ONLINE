import {
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ImageIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"
import { useRef, useState } from "react"

import { ImageCropper } from "~/components/image/image-cropper"
import { useImageCrop } from "~/hooks/use-image-crop"
import { useImageDraft } from "~/hooks/use-image-draft"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import type { GroupCategory, GroupSpace } from "~/lib/group/types"
import { cn } from "~/lib/utils"

// 관리자 전용 그룹 설정. 실수로 바꾸기 쉽지 않게 각 섹션은 읽기 모드가 기본이고, "편집"을
// 누른 뒤에만 수정할 수 있다(저장/취소). 백엔드 전이라 저장은 로컬 상태만 갱신한다 --
// 이름/설명/가입정책은 spaces, 카테고리는 space_categories 컬럼으로 갈 자리.
//
// TODO(backend): 지금 이름/설명/카테고리 편집은 각 섹션 로컬 state에만 커밋돼(joinPolicy만 부모로
// 리프팅됨) 헤더·사이드바·칩과 어긋나고 탭 전환 시 사라진다. 붙일 때는 action으로 저장 후 loader
// revalidate가 단일 소스를 갱신하게 해 이 로컬-only 편집을 대체한다(그때 UI 불일치도 자연 해소).

const GROUP_ICON_CROP = { aspect: 1, maxOutputEdge: 512 }
const GROUP_COVER_CROP = { aspect: 4, maxOutputEdge: 1600 }

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

// 아이콘(spaces.image_url)과 커버(spaces.cover_image_url). 세우는 것도 떼는 것도 RPC다 -- 두 컬럼
// 모두 update grant에 없기 때문이다(열면 올린 적도 없는 경로나 남의 space 경로를 그대로 박아 넣을 수
// 있다). 그래서 이 섹션들은 운영 권한(can_manage_space = owner/admin)에만 열린다 -- 매니저는
// 게시판만 굴린다.
//
// TODO(backend): 파일을 버킷의 <space.pubId>/<uuid>에 올린 뒤 확정한다. 슬롯마다 버킷이 다르다 --
// 아이콘은 space-images + finalize_space_image, 커버는 space-covers + finalize_space_cover(그
// RPC들이 경로·소유·MIME을 다시 본다). 제거는 clear_space_image / clear_space_cover이고 멱등이라
// 상태를 몰라도 안전하게 부를 수 있다.

function ImageControls({
  url,
  onSelect,
  onRemove,
}: {
  url: string | null
  onSelect: (file: File) => void
  onRemove: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  // TODO(backend): 실제 업로드 연결 때는 업로드 중 버튼 잠금·진행률, 압축/업로드/RPC 실패 표시와
  // 재시도·취소를 추가한다. accept는 선택창 힌트일 뿐이므로 MIME·크기·권한 검증은 Storage/RPC가
  // 최종적으로 맡는다.
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      {/* 버킷이 실제로 받는 것과 같은 말이어야 한다 -- 둘 다 jpeg/png/webp, 10MB까지. 화면이
          서버보다 관대하게 말하면 거짓말이 된다. */}
      <p className="text-muted-foreground text-xs">JPG · PNG · WebP · 10MB까지</p>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
          <ImageIcon className="size-4" aria-hidden="true" />
          {url ? "변경" : "업로드"}
        </Button>
        {url ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={() => {
              onRemove()
              // 같은 파일을 다시 골라도 change가 뜨도록 입력을 비운다.
              if (inputRef.current) inputRef.current.value = ""
            }}
          >
            제거
          </Button>
        ) : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) onSelect(file)
          event.currentTarget.value = ""
        }}
      />
    </div>
  )
}

function ImageSection({ group }: { group: GroupSpace }) {
  const [url, replace] = useImageDraft(group.imageUrl)
  const crop = useImageCrop({
    onCropped: (file) => replace(URL.createObjectURL(file)),
  })

  return (
    <SettingsCard>
      <h2 className="mb-3 text-sm font-semibold">그룹 아이콘</h2>
      <div className="flex items-center gap-4">
        <div className="bg-muted flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border text-xl font-semibold">
          {url ? <img src={url} alt="" className="size-full object-cover" /> : group.name.charAt(0)}
        </div>
        <ImageControls url={url} onSelect={crop.start} onRemove={() => replace(null)} />
      </div>
      {crop.cropperProps ? (
        <ImageCropper
          {...crop.cropperProps}
          aspect={GROUP_ICON_CROP.aspect}
          maxOutputEdge={GROUP_ICON_CROP.maxOutputEdge}
          title="그룹 아이콘"
        />
      ) : null}
    </SettingsCard>
  )
}

function CoverSection({ group }: { group: GroupSpace }) {
  const [url, replace] = useImageDraft(group.coverImageUrl)
  const crop = useImageCrop({
    onCropped: (file) => replace(URL.createObjectURL(file)),
  })

  return (
    <SettingsCard>
      <h2 className="mb-3 text-sm font-semibold">그룹 커버</h2>
      <div className="flex flex-col gap-3">
        {/* 헤더와 같은 그라디언트를 폴백으로 써서, 올리기 전에도 결과가 어떻게 보일지 그대로 보인다. */}
        <div className="from-primary/30 to-primary/5 aspect-[4/1] w-full overflow-hidden rounded-lg border bg-linear-to-br">
          {url ? <img src={url} alt="" className="size-full object-cover" /> : null}
        </div>
        <ImageControls url={url} onSelect={crop.start} onRemove={() => replace(null)} />
      </div>
      {crop.cropperProps ? (
        <ImageCropper
          {...crop.cropperProps}
          aspect={GROUP_COVER_CROP.aspect}
          maxOutputEdge={GROUP_COVER_CROP.maxOutputEdge}
          title="그룹 커버"
        />
      ) : null}
    </SettingsCard>
  )
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

// spaces.post_policy. 켜면 owner/admin/manager만 메인 글을 쓴다(공지형 그룹).
//
// 켜는 것 자체는 **운영 권한**이다(spaces의 컬럼 grant가 owner/admin에게만 열려 있다) --
// 매니저는 글을 쓸 뿐 자기 권한을 스스로 열지 못한다. 그래서 이 섹션은 그룹 설정 탭 안에 있고,
// 그 탭은 이미 관리자에게만 보인다.
//
// TODO(backend): action에서 spaces.post_policy를 update. 멤버에게 manager를 부여하는 건
// 멤버 탭의 역할 드롭다운(set_space_member_role RPC)이 한다.
function PostPolicySection({
  policy,
  onChange,
}: {
  policy: GroupSpace["postPolicy"]
  onChange: (next: GroupSpace["postPolicy"]) => void
}) {
  const restricted = policy === "managers"

  return (
    <SettingsCard>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">글쓰기 제한</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            켜면 매니저 이상만 게시물을 올릴 수 있습니다. <strong>댓글, 반응은 그대로</strong> 멤버
            모두 달 수 있습니다.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={restricted}
          aria-label="글쓰기 제한"
          onClick={() => onChange(restricted ? "all" : "managers")}
          className={cn(
            "focus-visible:ring-ring relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:ring-2 focus-visible:outline-none",
            restricted ? "bg-primary" : "bg-muted-foreground/30"
          )}
        >
          <span
            className={cn(
              "bg-background absolute top-0.5 size-5 rounded-full shadow transition-[left]",
              restricted ? "left-[1.375rem]" : "left-0.5"
            )}
          />
        </button>
      </div>
    </SettingsCard>
  )
}

// spaces.allow_anonymous_posts. 다른 섹션과 달리 edit 모드가 없다 -- 값이 하나뿐이라 토글이 곧
// 저장이다. TODO(backend): action에서 spaces.allow_anonymous_posts를 update(매니저 컬럼 grant).
function AnonymousSection({
  allowed,
  onChange,
}: {
  allowed: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <SettingsCard>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">익명 글 허용</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            끄면 새 익명 글과 익명 댓글을 쓸 수 없습니다. 이미 올라간 익명 글은 그대로 익명으로
            남습니다.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={allowed}
          aria-label="익명 글 허용"
          onClick={() => onChange(!allowed)}
          className={cn(
            "focus-visible:ring-ring relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:ring-2 focus-visible:outline-none",
            allowed ? "bg-primary" : "bg-muted-foreground/30"
          )}
        >
          <span
            className={cn(
              "bg-background absolute top-0.5 size-5 rounded-full shadow transition-[left]",
              allowed ? "left-[1.375rem]" : "left-0.5"
            )}
          />
        </button>
      </div>
    </SettingsCard>
  )
}

// 이 탭은 **매니저에게도** 열려 있다 -- 카테고리 관리가 can_curate_space라 매니저도 하기 때문이다.
// 나머지 섹션은 전부 운영 권한(can_manage_space)이므로 canManage가 아니면 아예 감춘다.
// 매니저에게 보여주고 저장만 막으면, 서버가 어차피 거절할 버튼을 띄우는 거짓말이 된다.
export function GroupSettings({
  group,
  categories,
  canManage,
  joinPolicy,
  onJoinPolicyChange,
  postPolicy,
  onPostPolicyChange,
  allowAnonymous,
  onAllowAnonymousChange,
}: {
  group: GroupSpace
  categories: GroupCategory[]
  /** owner/admin. false면(= 매니저) 카테고리 섹션만 보인다. */
  canManage: boolean
  joinPolicy: GroupSpace["joinPolicy"]
  onJoinPolicyChange: (next: GroupSpace["joinPolicy"]) => void
  postPolicy: GroupSpace["postPolicy"]
  onPostPolicyChange: (next: GroupSpace["postPolicy"]) => void
  allowAnonymous: boolean
  onAllowAnonymousChange: (next: boolean) => void
}) {
  return (
    <div className="flex flex-col gap-4">
      {canManage ? (
        <>
          <ImageSection group={group} />
          <CoverSection group={group} />
          <BasicInfoSection group={group} />
          <JoinPolicySection policy={joinPolicy} onChange={onJoinPolicyChange} />
          {/* 누가 들어오는가(가입) → 누가 쓰는가(글쓰기) → 어떻게 쓰는가(익명) 순이다. */}
          <PostPolicySection policy={postPolicy} onChange={onPostPolicyChange} />
          <AnonymousSection allowed={allowAnonymous} onChange={onAllowAnonymousChange} />
        </>
      ) : null}
      <CategorySection initial={categories} />
    </div>
  )
}
