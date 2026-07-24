import { LockIcon, SearchIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { MenuSubHeader } from "~/components/menu/menu-sub-header"
import { ProfileAvatar } from "~/components/profile/profile-avatar"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { Input } from "~/components/ui/input"
import { mockAdminCandidates, mockAppAdmins } from "~/lib/admin/mock-data"
import { PROFILE_TYPE_LABEL, type AppAdminProfile } from "~/lib/admin/types"

// 앱 관리자 관리. 관리자가 관리자를 늘리고 줄이는 유일한 화면이다.
//
// 이 화면이 없으면 가입 승인이 한 사람에게 묶인다: bootstrap_first_app_admin은 admin이 0명일
// 때만 통하므로, 첫 관리자가 졸업하는 날 아무도 가입을 승인할 수 없게 된다.
//
// TODO(backend): 로더가 profiles.role='admin'을 확인하고 아니면 리다이렉트한다(가입 승인 화면과
// 같다 -- "권한이 없습니다" 화면을 그리지 말 것).
// TODO(backend): 목록은 RPC가 아니라 profiles 직접 select다. 관리자는 role='admin', 후보는
// status='accepted' and role='user'. 승인 큐(pending)와 달리 accepted 행은 profiles_select가
// 이미 모두에게 열어두고 있어서 창을 따로 낼 이유가 없다.
// TODO(backend): 임명은 set_app_admin(profile_id), 강등은 unset_app_admin(profile_id). 둘 다
// 호출 후 revalidate. 아바타는 avatars 버킷이 private이라 서명 URL이 필요하다.
// 임명도 강등도 확인을 **두 번** 받는다. 관리자 권한은 이 화면에서 오가는 다른 값들과 무게가
// 다르다 -- 관리자는 전교생의 가입 신청서(전화번호·생일·기숙사 호실)를 열어볼 수 있고, 다른
// 관리자를 세우고 내릴 수 있다. 잘못 누른 뒤 되돌리면 그만인 일이 아니라, 잘못 누른 순간 이미
// 그 사람이 명부를 다 본 뒤다. 되돌리기가 원상복구가 아닌 조작은 두 번 묻는 게 맞다.
//
// 두 단계가 서로 다른 것을 묻는다는 게 요점이다: 1단계는 **무엇이 바뀌는지**(이 사람이 무엇을
// 할 수 있게 되는가), 2단계는 **대상이 맞는지**(동명이인이 흔하고 profiles.name엔 유니크 제약이
// 없다). 같은 질문을 두 번 하면 두 번째는 눈을 감고 누르게 된다.
type Confirmation = {
  person: AppAdminProfile
  action: "appoint" | "demote"
  step: 1 | 2
}

// 이 화면은 비밀번호를 다시 받고서야 열린다.
//
// 막으려는 건 "관리자가 아닌 사람"이 아니다 -- 그건 서버가 막는다(set_app_admin/unset_app_admin이
// require_app_admin()으로 스스로를 잠근다). 막으려는 건 **관리자의 열린 세션**이다: 자리를 비운
// 노트북, 잠기지 않은 폰. 거기서 공범을 관리자로 심으면 그 순간부터 전교생 명부가 열린다.
// 세션은 훔칠 수 있어도 비밀번호는 못 훔친다.
//
// 정직하게 적어두면, 이 게이트는 **키보드 앞의 사람**을 막지 devtools를 여는 사람을 막지는
// 못한다(세션 토큰으로 RPC를 직접 부르면 그만이다). 그걸 진짜로 막으려면 재인증 사실이 서버에
// 남아야 하고 -- AAL 클레임이나 짧은 수명의 nonce -- 그건 별도 작업이다.
//
// TODO(backend): 비밀번호는 우리 서버를 지나가면 안 된다(menu/password와 같은 이유). 브라우저가
// masterKey에서 authHash를 유도해 supabase.auth.signInWithPassword로 재검증하고, 성공하면 그때
// 화면을 연다. 지금은 아무 값이나 통과한다.
function ReauthGate({ onUnlock }: { onUnlock: () => void }) {
  const [password, setPassword] = useState("")

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <MenuSubHeader title="관리자" />
      <form
        className="bg-card flex flex-col gap-4 rounded-xl border p-5"
        onSubmit={(event) => {
          event.preventDefault()
          if (password.length > 0) onUnlock()
        }}
      >
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <LockIcon className="text-muted-foreground size-4" aria-hidden />
            <h2 className="text-sm font-semibold">관리자 확인</h2>
          </div>
          <p className="text-muted-foreground text-xs">
            관리자 명단 확인을 위해 비밀번호를 입력해주세요.
          </p>
        </div>
        <Input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="비밀번호"
          aria-label="비밀번호"
        />
        <Button type="submit" disabled={password.length === 0}>
          확인
        </Button>
      </form>
    </div>
  )
}

export default function AdminAdminsPage() {
  const [unlocked, setUnlocked] = useState(false)
  const [admins, setAdmins] = useState(mockAppAdmins)
  const [candidates, setCandidates] = useState(mockAdminCandidates)
  const [query, setQuery] = useState("")
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)

  if (!unlocked) return <ReauthGate onUnlock={() => setUnlocked(true)} />

  // 마지막 한 명은 내리지 못한다. 서버(unset_app_admin)가 'the last app admin cannot be demoted'로
  // 거절하는 조건 그대로다 -- admin이 0명이 되면 다시 세우는 길이 service_role뿐이라 앱 안에서
  // 복구할 수 없는 상태가 된다.
  const isLastAdmin = admins.length === 1

  const commit = ({ person, action }: Confirmation) => {
    if (action === "appoint") {
      setAdmins((prev) => [...prev, person])
      setCandidates((prev) => prev.filter((c) => c.id !== person.id))
      toast.success(`${person.name} 님을 관리자로 임명했습니다`)
    } else {
      setAdmins((prev) => prev.filter((a) => a.id !== person.id))
      setCandidates((prev) => [person, ...prev])
      toast.success(`${person.name} 님을 관리자에서 내렸습니다`)
    }
    setConfirmation(null)
  }

  // 찾기 전에는 아무도 보여주지 않는다. 전교생 명부를 스크롤할 수 있는 화면이 될 이유가 없고,
  // 관리자를 세우는 사람은 이미 누구를 세울지 알고 온다. 목록이 있으면 "누가 있나" 훑어보는
  // 화면이 되고, 그때부터 이 페이지는 명부 열람 도구다.
  const normalized = query.trim()
  const searching = normalized.length >= 2
  const matches = searching
    ? candidates.filter(
        (person) => person.name.includes(normalized) || String(person.cohort ?? "") === normalized
      )
    : []

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <MenuSubHeader title="관리자" aside={<Badge variant="secondary">{admins.length}명</Badge>} />

      <section className="flex flex-col gap-2">
        <h2 className="text-muted-foreground px-1 text-xs font-semibold tracking-wide">
          현재 관리자
        </h2>
        <div className="bg-card divide-border/70 divide-y overflow-hidden rounded-xl border">
          {admins.map((person) => (
            <PersonRow
              key={person.id}
              person={person}
              action={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  disabled={isLastAdmin}
                  onClick={() => setConfirmation({ person, action: "demote", step: 1 })}
                >
                  내리기
                </Button>
              }
            />
          ))}
        </div>
        {isLastAdmin ? (
          <p className="text-muted-foreground px-1 text-xs">
            관리자가 한 명뿐이라 내릴 수 없습니다. 먼저 다른 사람을 관리자로 임명해주세요.
          </p>
        ) : null}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-muted-foreground px-1 text-xs font-semibold tracking-wide">
          관리자 임명
        </h2>
        <div className="relative">
          <SearchIcon
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="이름 또는 기수로 찾기"
            aria-label="관리자 후보 검색"
            className="pl-9"
          />
        </div>

        {!searching ? (
          <p className="text-muted-foreground bg-card rounded-xl border px-4 py-6 text-center text-sm">
            이름이나 기수를 두 글자 이상 입력하면 찾습니다.
          </p>
        ) : matches.length > 0 ? (
          <div className="bg-card divide-border/70 divide-y overflow-hidden rounded-xl border">
            {matches.map((person) => (
              <PersonRow
                key={person.id}
                person={person}
                action={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmation({ person, action: "appoint", step: 1 })}
                  >
                    임명
                  </Button>
                }
              />
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground bg-card rounded-xl border px-4 py-6 text-center text-sm">
            찾는 사람이 없습니다. 가입이 승인된 사람만 관리자가 될 수 있습니다.
          </p>
        )}
      </section>

      <ConfirmDialog
        confirmation={confirmation}
        onCancel={() => setConfirmation(null)}
        onNext={(next) => setConfirmation(next)}
        onCommit={commit}
      />
    </div>
  )
}

function ConfirmDialog({
  confirmation,
  onCancel,
  onNext,
  onCommit,
}: {
  confirmation: Confirmation | null
  onCancel: () => void
  onNext: (next: Confirmation) => void
  onCommit: (confirmation: Confirmation) => void
}) {
  // 대화상자가 닫히며 사라지는 동안에도 마지막 내용이 남아 있어야 한다. confirmation을 null로
  // 만드는 순간 이름이 빈칸이 되면 닫히는 프레임에 "님을 관리자로" 같은 문장이 스친다.
  const [shown, setShown] = useState<Confirmation | null>(null)
  if (confirmation && confirmation !== shown) setShown(confirmation)

  if (!shown) return null

  const { person, action, step } = shown
  const appointing = action === "appoint"
  const facts = [person.cohort !== null ? `${person.cohort}기` : PROFILE_TYPE_LABEL[person.type]]
  if (person.department) facts.push(person.department)

  const title = step === 1 ? (appointing ? "관리자로 임명" : "관리자에서 내리기") : "한 번 더 확인"

  return (
    <Dialog open={confirmation !== null} onOpenChange={(open) => (open ? null : onCancel())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {step === 1 ? (
              appointing ? (
                <>
                  이 사람은 <strong>모든 가입 신청서</strong>(이름·학번·전화번호·생일·기숙사 호실)를
                  열어보고 승인하거나 거절할 수 있게 됩니다. 다른 관리자를 세우고 내릴 수도
                  있습니다.
                </>
              ) : (
                <>
                  이 사람은 더 이상 가입 신청을 승인하거나 관리자를 관리할 수 없게 됩니다. 계정과
                  그룹 권한은 그대로입니다.
                </>
              )
            ) : (
              <>이름이 같은 사람이 있을 수 있습니다. 아래가 맞는 사람인지 확인해주세요.</>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="bg-muted/50 flex items-center gap-3 rounded-lg border px-3 py-2.5">
          <ProfileAvatar profile={person} className="size-9" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{person.name}</p>
            <p className="text-muted-foreground truncate text-xs">{facts.join(" · ")}</p>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onCancel}>
            취소
          </Button>
          {step === 1 ? (
            <Button
              type="button"
              variant={appointing ? "default" : "destructive"}
              onClick={() => onNext({ person, action, step: 2 })}
            >
              계속
            </Button>
          ) : (
            <Button
              type="button"
              variant={appointing ? "default" : "destructive"}
              onClick={() => onCommit(shown)}
            >
              {appointing ? `${person.name} 님을 임명` : `${person.name} 님을 내리기`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PersonRow({ person, action }: { person: AppAdminProfile; action: React.ReactNode }) {
  // 이름만으로는 사람을 못 가른다 -- profiles.name엔 유니크 제약이 없다. 기수·부서를 같이 보여준다.
  const facts = [
    person.cohort !== null ? `${person.cohort}기` : PROFILE_TYPE_LABEL[person.type],
    person.department,
  ].filter(Boolean)

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <ProfileAvatar profile={person} className="size-9" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {person.name}
          {person.isMe ? <span className="text-muted-foreground ml-1.5 text-xs">나</span> : null}
        </p>
        <p className="text-muted-foreground truncate text-xs">{facts.join(" · ")}</p>
      </div>
      {action}
    </div>
  )
}
