import { useState, type ReactNode } from "react"
import { Link } from "react-router"
import { SpaceCard } from "~/components/space/space-card"

// pubId는 spaces.pub_id 슬러그이고 그룹 내부 경로(/groups/:pubId)에 실린다. 로더가 붙기 전이라
// 그룹 내부는 아직 pubId와 무관하게 같은 mock 하나를 보여준다 -- 어느 카드를 눌러도 화면은 같다.
const officialSpaces = [
  {
    pubId: "student-council",
    name: "학생회",
    description: "학생회 공지, 행사 운영, 회의 내용을 확인하는 공식 그룹입니다.",
  },
  {
    pubId: "academics",
    name: "학사운영",
    description: "학사 일정, 시험 안내, 수업 관련 공지를 확인하는 그룹입니다.",
  },
  {
    pubId: "dormitory",
    name: "기숙사",
    description: "기숙사 생활, 시설 점검, 생활 규칙 관련 공지를 확인하는 그룹입니다.",
  },
  {
    pubId: "clubs",
    name: "동아리",
    description: "동아리 모집, 활동 일정, 행사 안내를 확인하는 그룹입니다.",
  },
]

const joinedUnofficialSpaces = [
  {
    pubId: "market",
    name: "민사고 먹9 사9 팔9",
    description: "민사고 안에서 필요한 물건을 사고팔거나 나눔하는 비공식 그룹입니다.",
    memberCount: "1.2K명",
  },
  {
    pubId: "lost-and-found",
    name: "민사고 떨99 줍9",
    description: "분실물과 습득물을 공유하고 찾아주는 비공식 그룹입니다.",
    memberCount: "856명",
  },
  {
    pubId: "class-30",
    name: "30기 민사 재학생",
    description: "30기 재학생끼리 학교생활 정보와 일정을 공유하는 그룹입니다.",
    memberCount: "734명",
  },
  {
    pubId: "class-30-boys",
    name: "30남자 민재",
    description: "30기 남학생들이 자유롭게 소통하는 비공식 그룹입니다.",
    memberCount: "612명",
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
            {officialSpaces.map((space) => (
              <SpaceCard
                key={space.pubId}
                space={space}
                variant="group"
                to={`/groups/${space.pubId}`}
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

              <div className="flex gap-2">
                <Link
                  to="/groups/discover"
                  className="rounded-md border px-4 py-2 text-sm font-medium"
                >
                  그룹 찾기
                </Link>
                {/* 비공식 그룹(community)은 accepted면 누구나 만든다. 공식 그룹은 app admin만
                    만들 수 있어서 생성 화면 안에서 갈린다. */}
                <Link
                  to="/groups/create"
                  className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium"
                >
                  그룹 만들기
                </Link>
              </div>
            </div>

            <section className="flex flex-col gap-1.5 sm:gap-2">
              {joinedUnofficialSpaces.map((space) => (
                <SpaceCard
                  key={space.pubId}
                  space={space}
                  variant="community"
                  to={`/groups/${space.pubId}`}
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
