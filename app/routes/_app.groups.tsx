import { useState, type ReactNode } from "react"
import { Link } from "react-router"
import { SpaceCard } from "~/components/space/space-card"

// pubId는 spaces.pub_id 슬러그이고 그룹 내부 경로(/groups/:pubId)에 실린다. 로더가 붙기 전이라
// 그룹 내부는 아직 pubId와 무관하게 같은 mock 하나를 보여준다 -- 어느 카드를 눌러도 화면은 같다.
//
// pinnedAt은 space_members.pinned_at 중 **내 행**이다. 개인 고정이라 나에게만 보인다.
const officialSpaces = [
  {
    pubId: "student-council",
    name: "학생회",
    description: "학생회 공지, 행사 운영, 회의 내용을 확인하는 공식 그룹입니다.",
    pinnedAt: null as string | null,
  },
  {
    pubId: "academics",
    name: "학사운영",
    description: "학사 일정, 시험 안내, 수업 관련 공지를 확인하는 그룹입니다.",
    pinnedAt: null as string | null,
  },
  {
    pubId: "dormitory",
    name: "기숙사",
    description: "기숙사 생활, 시설 점검, 생활 규칙 관련 공지를 확인하는 그룹입니다.",
    pinnedAt: "2026-07-13T02:00:00.000Z" as string | null,
  },
  {
    pubId: "clubs",
    name: "동아리",
    description: "동아리 모집, 활동 일정, 행사 안내를 확인하는 그룹입니다.",
    pinnedAt: null as string | null,
  },
]

const joinedUnofficialSpaces = [
  {
    pubId: "market",
    name: "민사고 먹9 사9 팔9",
    description: "민사고 안에서 필요한 물건을 사고팔거나 나눔하는 비공식 그룹입니다.",
    memberCount: "1.2K명",
    pinnedAt: null as string | null,
  },
  {
    pubId: "lost-and-found",
    name: "민사고 떨99 줍9",
    description: "분실물과 습득물을 공유하고 찾아주는 비공식 그룹입니다.",
    memberCount: "856명",
    pinnedAt: null as string | null,
  },
  {
    pubId: "class-30",
    name: "30기 민사 재학생",
    description: "30기 재학생끼리 학교생활 정보와 일정을 공유하는 그룹입니다.",
    memberCount: "734명",
    pinnedAt: "2026-07-13T05:00:00.000Z" as string | null,
  },
  {
    pubId: "class-30-boys",
    name: "30남자 민재",
    description: "30기 남학생들이 자유롭게 소통하는 비공식 그룹입니다.",
    memberCount: "612명",
    pinnedAt: null as string | null,
  },
]

const recentOfficialNotices = [
  "7월 학생회 회의 일정 안내",
  "기숙사 시설 점검 안내",
  "동아리 활동 보고서 제출 안내",
]

const recentUnofficialPosts = [
  {
    title: "기말고사 공부법 공유해요!",
    count: 32,
  },
  {
    title: "대회팀 추천 부탁드려요",
    count: 28,
  },
  {
    title: "교재 나눔합니다",
    count: 24,
  },
]

export default function GroupsPage() {
  const [activeTab, setActiveTab] = useState<"official" | "unofficial">("official")

  // TODO(backend): 고정은 space_members.pinned_at을 직접 update하면 된다 -- 정책이 내 행만 열고
  // 컬럼 grant에 pinned_at이 있어 RPC가 필요 없다. 서버가 now()를 찍으므로 아래 new Date()는
  // mock 전용이고 로더가 붙으면 사라진다.
  const [pinnedAt, setPinnedAt] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(
      [...officialSpaces, ...joinedUnofficialSpaces].map((space) => [space.pubId, space.pinnedAt])
    )
  )

  const togglePin = (pubId: string) =>
    setPinnedAt((current) => ({
      ...current,
      [pubId]: current[pubId] ? null : new Date().toISOString(),
    }))

  // 고정한 그룹이 맨 위, 최근에 고정한 순. idx_space_members_user_pinned가 (user_id, pinned_at desc)로
  // 잡혀 있는 이유가 이 정렬이고, 로더가 붙으면 이건 서버가 한다. Array.sort는 안정 정렬이라
  // 둘 다 고정이 아니면 원래 순서가 유지된다.
  const sortByPin = <T extends { pubId: string }>(spaces: T[]) =>
    [...spaces].sort((first, second) => {
      const firstPin = pinnedAt[first.pubId]
      const secondPin = pinnedAt[second.pubId]
      if (Boolean(firstPin) !== Boolean(secondPin)) return firstPin ? -1 : 1
      if (firstPin && secondPin) return secondPin.localeCompare(firstPin)
      return 0
    })

  const isOfficial = activeTab === "official"

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <section className="flex min-w-0 flex-col gap-4">
        <section className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold">그룹</h1>
          <p className="text-muted-foreground text-sm">
            공식 그룹과 비공식 커뮤니티를 한 곳에서 확인해요.
          </p>
        </section>

        <div className="bg-card flex w-fit rounded-xl border p-1">
          <button
            onClick={() => setActiveTab("official")}
            className={
              isOfficial
                ? "bg-primary/10 text-primary rounded-lg px-4 py-2 text-sm font-medium"
                : "text-muted-foreground rounded-lg px-4 py-2 text-sm font-medium"
            }
          >
            공식
          </button>

          <button
            onClick={() => setActiveTab("unofficial")}
            className={
              !isOfficial
                ? "bg-primary/10 text-primary rounded-lg px-4 py-2 text-sm font-medium"
                : "text-muted-foreground rounded-lg px-4 py-2 text-sm font-medium"
            }
          >
            비공식
          </button>
        </div>

        {isOfficial ? (
          <section className="flex flex-col gap-1.5 sm:gap-2">
            {sortByPin(officialSpaces).map((space) => (
              <SpaceCard
                key={space.pubId}
                space={space}
                variant="group"
                to={`/groups/${space.pubId}`}
                isPinned={Boolean(pinnedAt[space.pubId])}
                onTogglePin={() => togglePin(space.pubId)}
              />
            ))}
          </section>
        ) : (
          <section className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="flex flex-col gap-1">
                <h2 className="text-lg font-semibold">가입한 그룹</h2>
                <p className="text-muted-foreground text-sm">내가 참여 중인 비공식 그룹</p>
              </div>

              <Link
                to="/groups/discover"
                className="rounded-md border px-4 py-2 text-sm font-medium"
              >
                그룹 찾기
              </Link>
            </div>

            <section className="flex flex-col gap-1.5 sm:gap-2">
              {sortByPin(joinedUnofficialSpaces).map((space) => (
                <SpaceCard
                  key={space.pubId}
                  space={space}
                  variant="community"
                  to={`/groups/${space.pubId}`}
                  isPinned={Boolean(pinnedAt[space.pubId])}
                  onTogglePin={() => togglePin(space.pubId)}
                />
              ))}
            </section>
          </section>
        )}
      </section>

      <aside className="hidden flex-col gap-3 xl:flex">
        {isOfficial ? (
          <SidePanel title="최근 공지">
            <ul className="space-y-2 text-sm">
              {recentOfficialNotices.map((notice) => (
                <li key={notice} className="truncate">
                  {notice}
                </li>
              ))}
            </ul>
          </SidePanel>
        ) : (
          <SidePanel title="최근 댓글 많은 글">
            <ul className="space-y-2 text-sm">
              {recentUnofficialPosts.map((post) => (
                <li key={post.title} className="flex justify-between gap-3">
                  <span className="truncate">{post.title}</span>
                  <span className="text-muted-foreground shrink-0">{post.count}</span>
                </li>
              ))}
            </ul>
          </SidePanel>
        )}
      </aside>
    </div>
  )
}

function SidePanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="bg-card rounded-2xl border p-4">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {children}
    </section>
  )
}
