import { ChevronDownIcon, SearchIcon } from "lucide-react"
import { useState } from "react"

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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { Input } from "~/components/ui/input"
import { useDebouncedValue } from "~/hooks/use-debounced-value"
import { useInfiniteScroll } from "~/hooks/use-infinite-scroll"
import { normalizeSearch, ROLE_LABEL } from "~/lib/group/format"
import type { GroupMember, GroupMemberRole } from "~/lib/group/types"

// 일반 멤버는 한 번에 다 그리지 않고 페이지 단위로만 보여준다 -- 실제로는 로더가 space_
// members를 keyset(role, joined_at)로 페이지네이션해 스크롤 바닥에서 다음 페이지를 부른다.
const MEMBER_PAGE_SIZE = 10

// owner → admin → manager → member 순. 스키마 enum 정의 순서와 같다.
const ROLE_RANK: Record<GroupMemberRole, number> = {
  owner: 0,
  admin: 1,
  manager: 2,
  member: 3,
}

function byRoleThenJoined(a: GroupMember, b: GroupMember) {
  if (a.role !== b.role) return ROLE_RANK[a.role] - ROLE_RANK[b.role]
  return a.joinedAt.localeCompare(b.joinedAt) // 먼저 가입한 사람 먼저
}

// 줄 수 있는 역할. owner는 목록에 **없다** -- set_space_member_role이 owner를 세우지도 내리지도
// 않기 때문이다. owner는 space당 정확히 1명이라 새 owner를 세우는 건 반드시 기존 owner를 내리는
// 일이기도 한데, 그걸 "승격" 버튼 뒤에 숨기면 안 된다. 소유권은 별도 항목(아래)으로만 넘긴다.
const ASSIGNABLE_ROLES: GroupMemberRole[] = ["admin", "manager", "member"]

// 이 사람의 역할을 내가 바꿀 수 있는가. set_space_member_role의 규칙 그대로다:
// owner/admin은 권한이 같고 **서로를 임명하고 서로를 내릴 수 있다.** 예외는 owner 한 명뿐이고,
// 그 한 줄이 admin의 쿠데타를 막는다. 실제 강제는 서버가 하고, 여기서 막는 건 누를 수 없는
// 버튼을 안 띄우려는 것뿐이다.
function canChangeRole(viewerRole: GroupMemberRole | null, target: GroupMember) {
  if (viewerRole !== "owner" && viewerRole !== "admin") return false
  return target.role !== "owner"
}

// 소유권을 넘길 수 있는 상대인가. owner만, 그리고 현재 admin에게만(transfer_space_ownership).
// 일반 멤버에게 바로 넘기려면 admin으로 먼저 올려야 한다 -- 그룹을 통째로 넘기는 일이라 한 단계 더.
function canTransferTo(viewerRole: GroupMemberRole | null, target: GroupMember) {
  return viewerRole === "owner" && target.role === "admin"
}

function MemberRow({
  member,
  viewerRole,
  onRoleChange,
  onTransferOwnership,
}: {
  member: GroupMember
  viewerRole: GroupMemberRole | null
  onRoleChange: (member: GroupMember, role: GroupMemberRole) => void
  onTransferOwnership: (member: GroupMember) => void
}) {
  const editable = canChangeRole(viewerRole, member)
  const transferable = canTransferTo(viewerRole, member)

  return (
    <li className="flex items-center gap-3 py-2">
      <ProfileAvatar profile={member} />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        {member.name}
        {/* 기수. 동명이인이 흔하고 profiles.name엔 유니크 제약이 없어서, 이름만으로는 목록에서
            사람을 가를 수가 없다. 교사 등 학생이 아닌 프로필은 기수가 없다(null). */}
        {member.cohort !== null ? (
          <span className="text-muted-foreground ml-1.5 text-xs font-normal">
            {member.cohort}기
          </span>
        ) : null}
        {member.isMe ? <span className="text-muted-foreground font-normal"> (나)</span> : null}
      </span>

      {/* 아래 역할 메뉴는 소유권 이양 AlertDialog를 여니 non-modal이다. 메뉴와 뒤이어 열리는
          모달이 body의 pointer-events 잠금을 겹쳐 쥐면, 둘이 함께 닫힐 때 잠금이 풀리지
          않아 페이지 전체가 클릭 불가가 된다. */}
      {editable && viewerRole !== null ? (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`${member.name} 역할 변경`}
              className="hover:bg-muted flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5"
            >
              <Badge variant="secondary">{ROLE_LABEL[member.role]}</Badge>
              <ChevronDownIcon className="text-muted-foreground size-3.5" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44">
            <DropdownMenuRadioGroup
              value={member.role}
              onValueChange={(next) => onRoleChange(member, next as GroupMemberRole)}
            >
              {ASSIGNABLE_ROLES.map((role) => (
                <DropdownMenuRadioItem key={role} value={role}>
                  {/* 라벨을 span으로 감싸고 nowrap을 건다. RadioItem이 flex + gap이라 맨텍스트는
                      그 자체로 줄어드는 flex 아이템이 되는데, 한국어는 단어 경계가 없어 아무 데서나
                      끊긴다 -- "매니저"가 "매니 / 저"로 갈라졌다. 힌트는 ml-auto로 오른쪽에 붙인다. */}
                  <span className="whitespace-nowrap">{ROLE_LABEL[role]}</span>
                  {role === "manager" ? (
                    <span className="text-muted-foreground ml-auto text-xs whitespace-nowrap">
                      고정·분류·글쓰기
                    </span>
                  ) : null}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>

            {/* 소유권 이양은 라디오 밖이다. 라디오는 "이 사람의 역할을 고른다"인데, 이양은 **두**
                사람의 역할을 맞바꾸는 일이다(내가 admin이 된다) -- 같은 위젯에 넣으면 그 사실이
                숨는다. 서버도 같은 이유로 함수를 나눴다(set_space_member_role vs
                transfer_space_ownership). owner가 admin을 볼 때만 뜬다. */}
            {transferable ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => onTransferOwnership(member)}
                >
                  <span className="whitespace-nowrap">소유권 이양</span>
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : member.role !== "member" ? (
        <Badge variant="secondary">{ROLE_LABEL[member.role]}</Badge>
      ) : null}
    </li>
  )
}

// 멤버를 운영진(owner/admin/manager)과 일반 멤버 두 섹션으로 나눠 보여준다. 이름 검색으로
// 걸러지며(디바운스 -- 백엔드에선 키 입력마다 쿼리 방지), 일반 멤버는 스크롤로 페이지네이션.
//
// 역할 변경은 관리자(owner/admin)에게만 드롭다운으로 열린다. 이게 매니저를 임명하는 유일한
// 통로다 -- 그룹 설정의 "글쓰기 제한"을 켜도 매니저가 없으면 owner/admin만 쓰는 그룹이 된다.
// TODO(backend): onRoleChange → set_space_member_role, onTransferOwnership →
// transfer_space_ownership. 둘 다 부른 뒤 revalidate하면 된다.
export function GroupMemberList({
  members,
  viewerRole = null,
  onRoleChange,
  onTransferOwnership,
}: {
  members: GroupMember[]
  viewerRole?: GroupMemberRole | null
  onRoleChange?: (member: GroupMember, role: GroupMemberRole) => void
  onTransferOwnership?: (member: GroupMember) => void
}) {
  // 이양은 되돌릴 수 없다(넘기고 나면 나는 admin이라 다시 못 가져온다). 그래서 드롭다운에서
  // 바로 실행하지 않고 상대 이름을 눈으로 확인시킨다 -- 동명이인이 있는 목록에서는 더욱.
  const [transferTarget, setTransferTarget] = useState<GroupMember | null>(null)
  const [query, setQuery] = useState("")
  const needle = normalizeSearch(useDebouncedValue(query.trim(), 300))
  // 이름 + 기수를 한 건초더미로 합쳐 검색한다. 덕분에 "김도윤"으로 동명이인 둘을 다 찾고,
  // "32기"로 기수를 훑고, "김도윤32"로 그중 한 명을 바로 집을 수 있다.
  // normalizeSearch가 공백을 지우므로 "김도윤 32기"도 같은 것이 된다.
  const haystack = (member: GroupMember) =>
    normalizeSearch(member.cohort === null ? member.name : `${member.name}${member.cohort}기`)
  const matches = (member: GroupMember) => needle === "" || haystack(member).includes(needle)

  const staff = members
    .filter((member) => member.role !== "member" && matches(member))
    .sort(byRoleThenJoined)
  const regular = members
    .filter((member) => member.role === "member" && matches(member))
    .sort(byRoleThenJoined)

  const [visibleCount, setVisibleCount] = useState(MEMBER_PAGE_SIZE)
  const shownRegular = regular.slice(0, visibleCount)
  const hasMore = visibleCount < regular.length
  const sentinelRef = useInfiniteScroll(
    () => setVisibleCount((count) => count + MEMBER_PAGE_SIZE),
    hasMore
  )

  const isEmpty = staff.length === 0 && regular.length === 0

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="멤버 검색"
          className="bg-muted h-9 rounded-full border-0 pl-9 shadow-none"
        />
      </div>

      {isEmpty ? (
        <p className="text-muted-foreground py-8 text-center text-sm">
          {needle ? "일치하는 멤버가 없습니다." : "멤버가 없습니다."}
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {staff.length > 0 ? (
            <section>
              <h2 className="text-muted-foreground mb-1 text-sm font-semibold">
                운영진 {staff.length}
              </h2>
              <ul className="divide-border/70 flex flex-col divide-y">
                {staff.map((member) => (
                  <MemberRow
                    key={member.id}
                    member={member}
                    viewerRole={viewerRole}
                    onRoleChange={onRoleChange ?? (() => {})}
                    onTransferOwnership={setTransferTarget}
                  />
                ))}
              </ul>
            </section>
          ) : null}

          {regular.length > 0 ? (
            <section>
              <h2 className="text-muted-foreground mb-1 text-sm font-semibold">
                멤버 {regular.length}
              </h2>
              <ul className="divide-border/70 flex flex-col divide-y">
                {shownRegular.map((member) => (
                  <MemberRow
                    key={member.id}
                    member={member}
                    viewerRole={viewerRole}
                    onRoleChange={onRoleChange ?? (() => {})}
                    onTransferOwnership={setTransferTarget}
                  />
                ))}
              </ul>
              {hasMore ? (
                <div ref={sentinelRef} className="text-muted-foreground py-4 text-center text-sm">
                  불러오는 중…
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      )}

      {/* 이양은 되돌릴 수 없다. 드롭다운에서 바로 실행하지 않고 상대 이름(+기수)을 눈으로 다시
          확인시킨다 -- 동명이인이 있는 목록에서 잘못 누르면 그룹을 통째로 남에게 넘긴 것이 된다. */}
      <Dialog
        open={transferTarget !== null}
        onOpenChange={(open) => !open && setTransferTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>소유권을 넘길까요?</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  <span className="text-foreground font-semibold">
                    {transferTarget?.name}
                    {transferTarget?.cohort != null ? ` ${transferTarget.cohort}기` : ""}
                  </span>
                  님이 이 그룹의 소유자가 되고,{" "}
                  <span className="text-foreground font-semibold">회원님은 관리자가 됩니다.</span>
                </p>
                {/* 권한이 같다는 걸 말해주는 게 중요하다 -- 안 그러면 "다 잃는다"고 오해한다.
                    실제로 잃는 건 이양권 하나뿐이고, 그건 되돌릴 수 없다. */}
                <p>
                  관리자는 소유자와 권한이 같습니다. 다만{" "}
                  <strong className="text-foreground">되돌릴 수 없습니다</strong> — 다시 가져오려면
                  새 소유자가 넘겨줘야 합니다.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setTransferTarget(null)}>
              취소
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (transferTarget) onTransferOwnership?.(transferTarget)
                setTransferTarget(null)
              }}
            >
              넘기기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
