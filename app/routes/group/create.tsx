import { ChevronLeftIcon } from "lucide-react"
import { useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router"
import { toast } from "sonner"

import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { SLUG_HINT, isValidSlug, randomPubId, type SpaceDraft } from "~/lib/group/create"
import { cn } from "~/lib/utils"

// 공간을 만드는 화면. 서버에는 create_space RPC 하나뿐이고 spaces에는 insert grant가 없다 --
// 그래서 여기서 모으는 값이 곧 그 RPC의 인자다.
//
// TODO(backend): action에서 create_space(p_type, p_name, p_description, p_pub_id, p_join_policy,
// p_post_policy, p_allow_anonymous_posts)를 호출하고 반환된 space id로 revalidate 후
// /groups/{pub_id}로 보낸다. 지금은 로컬 state만 만지고 아무것도 저장하지 않는다.
// TODO(backend): 이름/슬러그 충돌은 서버가 갈라 준다 -- 공식 그룹 이름은
// spaces_active_group_name_key(unique), 슬러그는 'pub id already taken'. 프론트 검사는 형식까지다.

const JOIN_POLICY_OPTIONS: { value: SpaceDraft["joinPolicy"]; label: string; hint: string }[] = [
  { value: "public", label: "공개 · 즉시 가입", hint: "검색에 노출되고 누구나 바로 가입합니다" },
  {
    value: "request",
    label: "공개 · 승인 후 가입",
    hint: "검색에 노출되지만 관리자 승인이 필요합니다",
  },
  {
    value: "invite_only",
    label: "비공개 · 초대 전용",
    hint: "검색에 노출되지 않고 초대로만 가입합니다",
  },
]

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint ? <span className="text-muted-foreground text-xs">{hint}</span> : null}
    </label>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="bg-card flex flex-col gap-4 px-4 py-4 sm:rounded-xl sm:border">
      {children}
    </section>
  )
}

export default function CreateSpacePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // 개발용 미리보기. TODO(backend): 로더가 profiles.role='admin'을 내려준다. 공식 그룹은 app
  // admin만 만든다 -- 이름이 곧 권위라(spaces_active_group_name_key) 아무나 '학생회'를 선점하면
  // 안 되기 때문이다. 서버(create_space)가 이미 require_app_admin()으로 스스로를 잠그고 있으니
  // 여기서 감추는 건 UI 정리일 뿐이다.
  const isAppAdmin = searchParams.get("as") === "admin"

  const [type, setType] = useState<SpaceDraft["type"]>("community")
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [pubId, setPubId] = useState("")
  const [joinPolicy, setJoinPolicy] = useState<SpaceDraft["joinPolicy"]>("public")
  const [postPolicy, setPostPolicy] = useState<SpaceDraft["postPolicy"]>("all")
  const [allowAnonymous, setAllowAnonymous] = useState(true)

  const trimmedName = name.trim()
  const slugTouched = pubId.trim().length > 0
  const slugValid = !slugTouched || isValidSlug(pubId.trim())
  const canSubmit = trimmedName.length > 0 && slugValid

  const submit = () => {
    if (!canSubmit) return
    // 슬러그를 비우면 서버가 컬럼 default(랜덤 12자)를 채운다. 여기서 흉내만 낸다.
    const slug = slugTouched ? pubId.trim() : randomPubId()
    toast.success(`${type === "group" ? "공식 그룹" : "그룹"}을 만들었습니다`)
    navigate(`/groups/${slug}`)
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Link
          to="/groups"
          className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-sm transition-colors"
        >
          <ChevronLeftIcon className="size-4" aria-hidden />
          그룹
        </Link>
        <h1 className="text-xl font-semibold sm:text-2xl">그룹 만들기</h1>
      </div>

      {isAppAdmin ? (
        <Card>
          <div role="radiogroup" aria-label="그룹 종류" className="flex flex-col gap-1">
            <span className="text-sm font-medium">종류</span>
            {(
              [
                {
                  value: "community",
                  label: "비공식 그룹",
                  hint: "학생들이 자유롭게 만드는 커뮤니티입니다",
                },
                {
                  value: "group",
                  label: "공식 그룹",
                  hint: "학교 조직을 그대로 옮긴 그룹입니다. 이름은 학교 전체에서 하나뿐이어야 합니다",
                },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={type === option.value}
                onClick={() => setType(option.value)}
                className={cn(
                  "hover:bg-muted flex flex-col items-start gap-0.5 rounded-lg p-2.5 text-left transition-colors",
                  type === option.value && "bg-muted"
                )}
              >
                <span className="text-sm font-medium">{option.label}</span>
                <span className="text-muted-foreground text-xs">{option.hint}</span>
              </button>
            ))}
          </div>
        </Card>
      ) : null}

      <Card>
        <Field label="이름">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="예: 30기 민사 재학생"
            maxLength={100}
          />
        </Field>

        <Field label="설명" hint="비워둘 수 있습니다.">
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={5000}
            placeholder="이 그룹이 무엇을 하는 곳인지 적어주세요."
            className="border-input focus-visible:ring-ring min-h-24 resize-none rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-2"
          />
        </Field>

        <Field label="주소" hint={slugValid ? SLUG_HINT : undefined}>
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground shrink-0 text-sm">/groups/</span>
            <Input
              value={pubId}
              onChange={(event) => setPubId(event.target.value)}
              placeholder="비워두면 자동으로 정해집니다"
              aria-invalid={!slugValid}
            />
          </div>
          {slugValid ? null : <span className="text-destructive text-xs">{SLUG_HINT}</span>}
        </Field>
      </Card>

      <Card>
        <div role="radiogroup" aria-label="가입 정책" className="flex flex-col gap-1">
          <span className="text-sm font-medium">가입 정책</span>
          {JOIN_POLICY_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={joinPolicy === option.value}
              onClick={() => setJoinPolicy(option.value)}
              className={cn(
                "hover:bg-muted flex flex-col items-start gap-0.5 rounded-lg p-2.5 text-left transition-colors",
                joinPolicy === option.value && "bg-muted"
              )}
            >
              <span className="text-sm font-medium">{option.label}</span>
              <span className="text-muted-foreground text-xs">{option.hint}</span>
            </button>
          ))}
        </div>

        {/* 켜면 owner/admin/manager만 메인 글을 쓴다(공지형 그룹). 댓글은 언제나 멤버 전원에게 열려 있다. */}
        <label className="flex items-start justify-between gap-4">
          <span className="min-w-0">
            <span className="block text-sm font-medium">글쓰기 제한</span>
            <span className="text-muted-foreground mt-1 block text-xs">
              켜면 매니저 이상만 게시물을 올립니다. 댓글, 반응은 그대로 멤버 모두 달 수 있습니다.
            </span>
          </span>
          <input
            type="checkbox"
            checked={postPolicy === "managers"}
            onChange={(event) => setPostPolicy(event.target.checked ? "managers" : "all")}
            className="mt-1 size-4 shrink-0"
          />
        </label>

        <label className="flex items-start justify-between gap-4">
          <span className="min-w-0">
            <span className="block text-sm font-medium">익명 글 허용</span>
            <span className="text-muted-foreground mt-1 block text-xs">
              나중에 꺼도 이미 올라간 익명 글은 그대로 익명으로 남습니다.
            </span>
          </span>
          <input
            type="checkbox"
            checked={allowAnonymous}
            onChange={(event) => setAllowAnonymous(event.target.checked)}
            className="mt-1 size-4 shrink-0"
          />
        </label>
      </Card>

      <div className="flex justify-end gap-2 px-4 sm:px-0">
        <Button type="button" variant="ghost" onClick={() => navigate("/groups")}>
          취소
        </Button>
        <Button type="button" onClick={submit} disabled={!canSubmit}>
          만들기
        </Button>
      </div>
    </div>
  )
}
