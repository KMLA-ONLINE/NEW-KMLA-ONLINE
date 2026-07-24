import { CirclePlusIcon } from "lucide-react"
import { useState } from "react"
import { Link, useSearchParams } from "react-router"

import { SpaceDiscoverCard } from "~/components/space/space-discover-card"
import { SpaceRow } from "~/components/space/space-row"
import { TeacherGroupsHome } from "~/components/space/teacher-groups-home"
import { Button } from "~/components/ui/button"
import { mockSpaces, mockTeacherSpaces } from "~/lib/space/mock-data"
import { mockProfileForPreview } from "~/lib/profile/mock-data"
import type { SpaceSummary } from "~/lib/space/types"
import { cn } from "~/lib/utils"

type SpaceTab = "official" | "community"

const TABS: { id: SpaceTab; label: string }[] = [
  { id: "official", label: "공식" },
  { id: "community", label: "비공식" },
]

// 인기 그룹은 맛보기만. 검색이 붙은 전체 목록은 /groups/discover가 맡는다.
const POPULAR_PREVIEW = 4

// 고정한 그룹이 맨 위, 최근에 고정한 순. idx_space_members_user_pinned가 (user_id, pinned_at desc)로
// 잡혀 있는 이유가 이 정렬이고, 로더가 붙으면 서버가 한다. Array.sort는 안정 정렬이라 둘 다 고정이
// 아니면 원래 순서가 유지된다.
function sortPinnedFirst(spaces: SpaceSummary[]) {
  return [...spaces].sort((first, second) => {
    if ((first.pinnedAt !== null) !== (second.pinnedAt !== null)) return first.pinnedAt ? -1 : 1
    if (first.pinnedAt && second.pinnedAt) return second.pinnedAt.localeCompare(first.pinnedAt)
    return 0
  })
}

export default function GroupsPage() {
  const [searchParams] = useSearchParams()

  if (mockProfileForPreview(searchParams.get("as")).type === "teacher") {
    return <TeacherGroupsPage />
  }

  return <MemberGroupsPage />
}

function TeacherGroupsPage() {
  const [spaces, setSpaces] = useState(mockTeacherSpaces)

  const togglePin = (pubId: string) =>
    setSpaces((current) =>
      current.map((space) =>
        space.pubId === pubId
          ? { ...space, pinnedAt: space.pinnedAt ? null : new Date().toISOString() }
          : space
      )
    )

  return <TeacherGroupsHome spaces={sortPinnedFirst(spaces)} onTogglePin={togglePin} />
}

function MemberGroupsPage() {
  const [tab, setTab] = useState<SpaceTab>("official")
  const [spaces, setSpaces] = useState(mockSpaces)

  // TODO(backend): 고정은 space_members.pinned_at을 직접 update한다 -- 정책이 내 행만 열고 컬럼
  // grant에 pinned_at이 있어 RPC가 필요 없다. 서버가 now()를 찍으므로 이 new Date()는 mock 전용이다.
  const togglePin = (pubId: string) =>
    setSpaces((current) =>
      current.map((space) =>
        space.pubId === pubId
          ? { ...space, pinnedAt: space.pinnedAt ? null : new Date().toISOString() }
          : space
      )
    )

  // TODO(backend): join_space(space_id)가 'joined'(공개) 또는 'requested'(승인제)를 돌려준다 --
  // 아래 두 갈래가 정확히 그 두 응답이다. invite_only는 여기 올 수가 없다(목록에 뜨질 않는다).
  const join = (pubId: string) =>
    setSpaces((current) =>
      current.map((space) => {
        if (space.pubId !== pubId) return space
        if (space.joinPolicy === "request") return { ...space, hasPendingRequest: true }
        return { ...space, isMember: true, memberCount: space.memberCount + 1 }
      })
    )

  const official = sortPinnedFirst(spaces.filter((space) => space.type === "group"))
  const joined = sortPinnedFirst(
    spaces.filter((space) => space.type === "community" && space.isMember)
  )
  // 디렉터리 정렬은 멤버 많은 순이다 -- idx_spaces_active_directory가 (join_policy, member_count)로
  // 잡혀 있다. 개인화할 근거가 스키마에 없으므로 "추천"이라 부르지 않고 인기순이라고 말한다.
  const popular = spaces
    .filter((space) => space.type === "community" && !space.isMember)
    .sort((first, second) => second.memberCount - first.memberCount)
    .slice(0, POPULAR_PREVIEW)

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">그룹</h1>
        {tab === "community" ? (
          <Button asChild size="sm">
            <Link to="/groups/create">
              <CirclePlusIcon data-icon="inline-start" aria-hidden="true" />
              그룹 만들기
            </Link>
          </Button>
        ) : null}
      </header>

      <nav className="flex items-center gap-1 border-b" aria-label="그룹 종류">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            aria-current={tab === item.id ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
              tab === item.id
                ? "border-foreground text-foreground"
                : "text-muted-foreground hover:text-foreground border-transparent"
            )}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {tab === "official" ? (
        <section className="flex flex-col gap-3">
          {/* 공식 그룹엔 가입 버튼도 찾기도 없다 -- 전교생이 이미 속해 있어서 고를 게 없다.
              남는 결정은 "어느 걸 자주 보나"뿐이고, 그게 핀이다. */}
          <ul className="flex flex-col gap-1.5">
            {official.map((space) => (
              <SpaceRow
                key={space.pubId}
                space={space}
                onTogglePin={() => togglePin(space.pubId)}
              />
            ))}
          </ul>
        </section>
      ) : (
        <div className="flex flex-col gap-7">
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold">
              내 그룹 <span className="text-muted-foreground font-normal">{joined.length}</span>
            </h2>
            {joined.length > 0 ? (
              <ul className="flex flex-col gap-1.5">
                {joined.map((space) => (
                  <SpaceRow
                    key={space.pubId}
                    space={space}
                    onTogglePin={() => togglePin(space.pubId)}
                  />
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground bg-card rounded-xl border px-4 py-6 text-center text-sm">
                아직 들어간 비공식 그룹이 없습니다. 아래에서 둘러보세요.
              </p>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold">인기 그룹</h2>
              <Link
                to="/groups/discover"
                className="text-muted-foreground hover:text-foreground text-sm transition-colors"
              >
                전체 보기 →
              </Link>
            </div>
            {popular.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {popular.map((space) => (
                  <SpaceDiscoverCard
                    key={space.pubId}
                    space={space}
                    onJoin={() => join(space.pubId)}
                  />
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">더 들어갈 그룹이 없습니다.</p>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
