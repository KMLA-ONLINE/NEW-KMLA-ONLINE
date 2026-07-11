import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar"
import { Badge } from "~/components/ui/badge"
import type { GroupMember, GroupMemberRole } from "~/lib/group/types"

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
          {regular.map((member) => (
            <MemberRow key={member.id} member={member} />
          ))}
        </ul>
      </section>
    </div>
  )
}
