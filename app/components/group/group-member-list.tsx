import { SearchIcon } from "lucide-react"
import { useState } from "react"

import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar"
import { Badge } from "~/components/ui/badge"
import { Input } from "~/components/ui/input"
import { useDebouncedValue } from "~/hooks/use-debounced-value"
import { useInfiniteScroll } from "~/hooks/use-infinite-scroll"
import type { GroupMember, GroupMemberRole } from "~/lib/group/types"

// 일반 멤버는 한 번에 다 그리지 않고 페이지 단위로만 보여준다 -- 실제로는 로더가 space_
// members를 keyset(role, joined_at)로 페이지네이션해 스크롤 바닥에서 다음 페이지를 부른다.
const MEMBER_PAGE_SIZE = 10

// 이름 검색은 공백 제거 + 소문자로 정규화해 부분 일치(게시물 검색과 같은 계약).
const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, "")

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

// 멤버를 운영진(owner/admin/manager)과 일반 멤버 두 섹션으로 나눠 보여준다. 이름 검색으로
// 걸러지며(디바운스 -- 백엔드에선 키 입력마다 쿼리 방지), 일반 멤버는 스크롤로 페이지네이션.
export function GroupMemberList({ members }: { members: GroupMember[] }) {
  const [query, setQuery] = useState("")
  const needle = normalize(useDebouncedValue(query.trim(), 300))
  const matches = (member: GroupMember) => needle === "" || normalize(member.name).includes(needle)

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
                  <MemberRow key={member.id} member={member} />
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
                  <MemberRow key={member.id} member={member} />
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
