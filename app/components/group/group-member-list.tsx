import { ChevronDownIcon, SearchIcon } from "lucide-react"
import { useState } from "react"

import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar"
import { Badge } from "~/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
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

// 무엇을 줄 수 있는가. owner는 목록에 없다 -- 소유권 이양은 별개의 일이고(space당 owner는 정확히
// 1명이라 넘기려면 기존 owner를 같은 트랜잭션에서 내려야 한다) set_space_member_role이 거부한다.
// admin을 세우고 내리는 건 owner만 한다: 안 그러면 admin끼리 서로 강등하는 진흙탕이 열린다.
function assignableRoles(viewerRole: GroupMemberRole): GroupMemberRole[] {
  return viewerRole === "owner" ? ["admin", "manager", "member"] : ["manager", "member"]
}

// 이 사람의 역할을 내가 바꿀 수 있는가. set_space_member_role의 규칙을 그대로 옮긴 것이고,
// 실제 강제는 서버가 한다 -- 여기서 막는 건 누를 수 없는 버튼을 안 띄우려는 것뿐이다.
function canChangeRole(viewerRole: GroupMemberRole | null, target: GroupMember) {
  if (viewerRole !== "owner" && viewerRole !== "admin") return false
  if (target.role === "owner") return false
  if (viewerRole === "admin" && target.role === "admin") return false
  return true
}

function MemberRow({
  member,
  viewerRole,
  onRoleChange,
}: {
  member: GroupMember
  viewerRole: GroupMemberRole | null
  onRoleChange: (member: GroupMember, role: GroupMemberRole) => void
}) {
  const editable = canChangeRole(viewerRole, member)

  return (
    <li className="flex items-center gap-3 py-2">
      <Avatar>
        {member.avatarUrl ? <AvatarImage src={member.avatarUrl} alt="" /> : null}
        <AvatarFallback>{member.name.charAt(0)}</AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        {member.name}
        {member.isMe ? <span className="text-muted-foreground font-normal"> (나)</span> : null}
      </span>

      {editable && viewerRole !== null ? (
        <DropdownMenu>
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
              {assignableRoles(viewerRole).map((role) => (
                <DropdownMenuRadioItem key={role} value={role}>
                  {/* 라벨을 span으로 감싸고 nowrap을 건다. RadioItem이 flex + gap이라 맨텍스트는
                      그 자체로 줄어드는 flex 아이템이 되는데, 한국어는 단어 경계가 없어 아무 데서나
                      끊긴다 -- "매니저"가 "매니 / 저"로 갈라졌다. 힌트는 ml-auto로 오른쪽에 붙인다. */}
                  <span className="whitespace-nowrap">{ROLE_LABEL[role]}</span>
                  {role === "manager" ? (
                    <span className="text-muted-foreground ml-auto text-xs whitespace-nowrap">
                      글쓰기 허용
                    </span>
                  ) : null}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
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
// TODO(backend): onRoleChange가 set_space_member_role RPC를 부르고 revalidate하면 된다.
export function GroupMemberList({
  members,
  viewerRole = null,
  onRoleChange,
}: {
  members: GroupMember[]
  viewerRole?: GroupMemberRole | null
  onRoleChange?: (member: GroupMember, role: GroupMemberRole) => void
}) {
  const [query, setQuery] = useState("")
  const needle = normalizeSearch(useDebouncedValue(query.trim(), 300))
  const matches = (member: GroupMember) =>
    needle === "" || normalizeSearch(member.name).includes(needle)

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
    </div>
  )
}
