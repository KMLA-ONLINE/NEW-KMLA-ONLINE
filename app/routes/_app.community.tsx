import { useState } from "react"
import { SpaceDirectoryCard } from "~/components/layout/space-directory-card"
import { Input } from "~/components/ui/input"

const communitySpaces = [
  {
    name: "학생회",
    category: "학교/운영",
    description: "학교 행사, 공지, 제안 등을 함께 논의하는 학생회 공식 커뮤니티입니다.",
    latestActivity: "15m ago",
    members: "1.2K명",
    newPosts: "32개의 새 글",
  },
  {
    name: "국어과",
    category: "학과/전공",
    description: "국어과 공지, 과제 정보, 학습 자료를 공유하는 공간입니다.",
    latestActivity: "1h ago",
    members: "856명",
    newPosts: "8개의 새 글",
  },
  {
    name: "수학과",
    category: "학과/전공",
    description: "수학 과제 제출, 공지 자료, 스터디 모집을 함께 나눠요.",
    latestActivity: "2h ago",
    members: "734명",
    newPosts: "5개의 새 글",
  },
  {
    name: "영어과",
    category: "학과/전공",
    description: "영어 수행, 발표 자료, 에세이 피드백을 공유하는 커뮤니티입니다.",
    latestActivity: "3h ago",
    members: "612명",
    newPosts: "4개의 새 글",
  },
]

const popularTags = ["#과제", "#분실", "#스터디", "#식당", "#행사"]

export default function CommunityPage() {
  const [viewMode, setViewMode] = useState<"list" | "card">("card")

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <section className="flex min-w-0 flex-col gap-4">
        <section className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold">그룹</h1>
          <p className="text-muted-foreground text-sm">
            관심사별 커뮤니티에서 자유롭게 소통하고 정보를 나눠요.
          </p>
        </section>

        <div className="flex flex-wrap items-center gap-2">
          <button className="rounded-md border border-blue-500 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-600">
            추천
          </button>
          <button className="rounded-md border px-4 py-2 text-sm font-medium">인기</button>

          <button
            onClick={() => setViewMode(viewMode === "card" ? "list" : "card")}
            className="rounded-md border px-4 py-2 text-sm font-medium"
          >
            {viewMode === "card" ? "리스트형" : "카드형"}
          </button>

          <button className="rounded-md border px-4 py-2 text-sm font-medium">내 커뮤니티</button>

          <Input placeholder="커뮤니티 검색" className="ml-auto max-w-xs" />
        </div>

        {viewMode === "list" ? (
          <section className="grid gap-3 md:grid-cols-2">
            {communitySpaces.map((space) => (
              <SpaceDirectoryCard
                key={space.name}
                name={space.name}
                category={space.category}
                description={space.description}
                latestActivity={space.latestActivity}
              />
            ))}
          </section>
        ) : (
          <section className="grid gap-4 md:grid-cols-2">
            {communitySpaces.map((space) => (
              <FacebookStyleCommunityCard key={space.name} space={space} />
            ))}
          </section>
        )}
      </section>

      <aside className="hidden flex-col gap-3 xl:flex">
        <SidePanel title="🔥 인기 태그">
          <div className="flex flex-wrap gap-2">
            {popularTags.map((tag) => (
              <span key={tag} className="rounded-md border px-3 py-1 text-xs font-medium">
                {tag}
              </span>
            ))}
          </div>
        </SidePanel>

        <SidePanel title="최근 댓글 많은 글">
          <ul className="space-y-2 text-sm">
            <li className="flex justify-between gap-3">
              <span>기말고사 공부법 공유해요!</span>
              <span className="text-muted-foreground">32</span>
            </li>
            <li className="flex justify-between gap-3">
              <span>대회팀 추천 부탁드려요</span>
              <span className="text-muted-foreground">28</span>
            </li>
            <li className="flex justify-between gap-3">
              <span>교재 나눔합니다</span>
              <span className="text-muted-foreground">24</span>
            </li>
          </ul>
        </SidePanel>

        <SidePanel title="추천 커뮤니티">
          <ul className="space-y-2 text-sm">
            <li className="flex items-center justify-between">
              <span>토익 스터디</span>
              <button className="rounded-md border px-2 py-1 text-xs">+</button>
            </li>
            <li className="flex items-center justify-between">
              <span>프로그래밍</span>
              <button className="rounded-md border px-2 py-1 text-xs">+</button>
            </li>
            <li className="flex items-center justify-between">
              <span>사진 동아리</span>
              <button className="rounded-md border px-2 py-1 text-xs">+</button>
            </li>
          </ul>
        </SidePanel>

        <SidePanel title="공지/규칙 미리보기">
          <ul className="text-muted-foreground list-inside list-disc space-y-1 text-sm">
            <li>욕설, 비방 금지</li>
            <li>거래글은 종류 표시</li>
            <li>신고는 운영진에게 문의</li>
          </ul>
        </SidePanel>
      </aside>
    </div>
  )
}

function FacebookStyleCommunityCard({
  space,
}: {
  space: {
    name: string
    category: string
    description: string
    latestActivity: string
    members: string
    newPosts: string
  }
}) {
  return (
    <article className="flex min-h-36 gap-4 rounded-2xl border bg-white p-4 transition hover:border-blue-200 hover:shadow-sm">
      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 text-xl font-bold text-blue-500">
        {space.name.slice(0, 1)}
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <h2 className="truncate text-lg font-semibold">{space.name}</h2>
          <span className="rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-600">
            {space.category}
          </span>
        </div>

        <p className="text-muted-foreground line-clamp-2 text-sm">{space.description}</p>

        <div className="text-muted-foreground mt-3 flex flex-wrap gap-4 text-xs">
          <span>최신 활동 · {space.latestActivity}</span>
          <span>{space.newPosts}</span>
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end justify-between">
        <div className="flex items-center gap-1">
          <span className="bg-muted h-5 w-5 rounded-full border" />
          <span className="bg-muted h-5 w-5 rounded-full border" />
          <span className="bg-muted h-5 w-5 rounded-full border" />
          <span className="text-muted-foreground ml-1 text-xs">{space.members}</span>
        </div>

        <button className="rounded-md border px-4 py-2 text-sm font-medium">열기</button>
      </div>
    </article>
  )
}

function SidePanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {children}
    </section>
  )
}
