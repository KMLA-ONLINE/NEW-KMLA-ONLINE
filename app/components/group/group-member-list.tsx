import { useState } from "react"

import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar"
import { Badge } from "~/components/ui/badge"
import { useInfiniteScroll } from "~/hooks/use-infinite-scroll"
import type { GroupMember, GroupMemberRole } from "~/lib/group/types"

// 일반 멤버는 한 번에 다 그리지 않고 페이지 단위로만 보여준다 -- 실제로는 로더가 space_
// members를 keyset(role, joined_at)로 페이지네이션해 이 "더 보기"가 다음 페이지 요청이 된다.
const MEMBER_PAGE_SIZE = 10

const ROLE_LABEL: Record<GroupMemberRole, string> = {
  owner: "소유자",
  admin: "관리자",
  manager: "매니저",
  member: "멤버",
}

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

function MemberRow({ member }: { member: GroupMember }) {
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
      {member.role !== "member" ? (
        <Badge variant="secondary">{ROLE_LABEL[member.role]}</Badge>
      ) : null}
    </li>
  )
}

// 멤버를 운영진(owner/admin/manager)과 일반 멤버 두 섹션으로 나눠 보여준다. 각 섹션은
// 역할 순 → 가입 순으로 정렬한다. 개수는 실제 렌더 목록에서 파생.
export function GroupMemberList({ members }: { members: GroupMember[] }) {
  const staff = members.filter((member) => member.role !== "member").sort(byRoleThenJoined)
  const regular = members.filter((member) => member.role === "member").sort(byRoleThenJoined)
  // 운영진은 소수라 전부, 일반 멤버는 페이지 단위로만 노출하고 스크롤이 바닥에 닿으면 더 부른다.
  const [visibleCount, setVisibleCount] = useState(MEMBER_PAGE_SIZE)
  const shownRegular = regular.slice(0, visibleCount)
  const hasMore = visibleCount < regular.length
  const sentinelRef = useInfiniteScroll(
    () => setVisibleCount((count) => count + MEMBER_PAGE_SIZE),
    hasMore
  )

  return (
    <div className="flex flex-col gap-6">
      {staff.length > 0 ? (
        <section>
          <h2 className="text-muted-foreground mb-1 text-sm font-semibold">
            운영진 {staff.length}
          </h2>
          <ul className="divide-border/70 flex flex-col divide-y">
            {staff.map((member) => (
              <MemberRow key={member.id} member={member} />
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2 className="text-muted-foreground mb-1 text-sm font-semibold">멤버 {regular.length}</h2>
        <ul className="divide-border/70 flex flex-col divide-y">
          {shownRegular.map((member) => (
            <MemberRow key={member.id} member={member} />
          ))}
        </ul>
        {hasMore ? (
          <div ref={sentinelRef} className="text-muted-foreground py-4 text-center text-sm">
            불러오는 중…
          </div>
        ) : null}
      </section>
    </div>
  )
}
