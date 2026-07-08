import { useState, type ReactNode } from "react"
import { SpaceCard } from "../components/layout/space-card"

const officialSpaces = [
  {
    name: "학생회",
    description: "학생회 공지, 행사 운영, 회의 내용을 확인하는 공식 그룹입니다.",
  },
  {
    name: "학사운영",
    description: "학사 일정, 시험 안내, 수업 관련 공지를 확인하는 그룹입니다.",
  },
  {
    name: "기숙사",
    description: "기숙사 생활, 시설 점검, 생활 규칙 관련 공지를 확인하는 그룹입니다.",
  },
  {
    name: "동아리",
    description: "동아리 모집, 활동 일정, 행사 안내를 확인하는 그룹입니다.",
  },
]

const myUnofficialSpaces = [
  {
    name: "민사고 먹9 사9 팔9",
    description: "민사고 안에서 필요한 물건을 사고팔거나 나눔하는 비공식 그룹입니다.",
    memberCount: "1.2K명",
  },
  {
    name: "민사고 떨99 줍9",
    description: "분실물과 습득물을 공유하고 찾아주는 비공식 그룹입니다.",
    memberCount: "856명",
  },
  {
    name: "30기 민사 재학생",
    description: "30기 재학생끼리 학교생활 정보와 일정을 공유하는 그룹입니다.",
    memberCount: "734명",
  },
  {
    name: "30남자 민재",
    description: "30기 남학생들이 자유롭게 소통하는 비공식 그룹입니다.",
    memberCount: "612명",
  },
]

const recommendedUnofficialSpaces = [
  {
    name: "민사고 사진 공유",
    description: "학교 행사, 일상, 풍경 사진을 함께 올리고 공유하는 그룹입니다.",
    memberCount: "248명",
  },
  {
    name: "시험기간 생존방",
    description: "시험 공부법, 자료, 멘탈 관리 팁을 나누는 비공식 그룹입니다.",
    memberCount: "193명",
  },
  {
    name: "기숙사 생활 공유",
    description: "기숙사 생활 팁, 필요한 물건, 생활 정보를 나누는 그룹입니다.",
    memberCount: "321명",
  },
  {
    name: "급식 리뷰",
    description: "오늘 급식 후기와 메뉴 이야기를 가볍게 나누는 그룹입니다.",
    memberCount: "287명",
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

        <div className="flex w-fit rounded-xl border bg-white p-1">
          <button
            onClick={() => setActiveTab("official")}
            className={
              isOfficial
                ? "rounded-lg bg-blue-50 px-4 py-2 text-sm font-medium text-blue-600"
                : "text-muted-foreground rounded-lg px-4 py-2 text-sm font-medium"
            }
          >
            공식
          </button>

          <button
            onClick={() => setActiveTab("unofficial")}
            className={
              !isOfficial
                ? "rounded-lg bg-blue-50 px-4 py-2 text-sm font-medium text-blue-600"
                : "text-muted-foreground rounded-lg px-4 py-2 text-sm font-medium"
            }
          >
            비공식
          </button>
        </div>

        {isOfficial ? (
          <section className="flex flex-col gap-1.5 sm:gap-2">
            {officialSpaces.map((space) => (
              <SpaceCard key={space.name} space={space} variant="group" />
            ))}
          </section>
        ) : (
          <section className="flex flex-col gap-1.5 sm:gap-2">
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold">가입한 그룹</h2>
              <p className="text-muted-foreground text-sm">
                내가 참여 중인 비공식 그룹을 확인해요.
              </p>
            </div>

            {myUnofficialSpaces.map((space) => (
              <SpaceCard key={space.name} space={space} variant="community" />
            ))}
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
          <>
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

            <SidePanel title="다른 그룹 추천">
              <ul className="space-y-3 text-sm">
                {recommendedUnofficialSpaces.map((space) => (
                  <li key={space.name} className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 text-base font-bold text-blue-500">
                      {space.name.slice(0, 1)}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{space.name}</p>
                      <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">
                        {space.description}
                      </p>
                      <p className="text-muted-foreground mt-1 text-xs">멤버 {space.memberCount}</p>
                    </div>

                    <button className="rounded-md border px-2 py-1 text-xs font-medium">+</button>
                  </li>
                ))}
              </ul>
            </SidePanel>
          </>
        )}
      </aside>
    </div>
  )
}

function SidePanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {children}
    </section>
  )
}
