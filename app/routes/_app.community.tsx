import type { ReactNode } from "react"
import { SpaceCard } from "../components/layout/space-card"
const communitySpaces = [
  {
    name: "학생회",
    description: "학교 행사, 공지 등을 함께 논의하는 커뮤니티입니다.",
    notificationCount: "1.2K명",
  },
  {
    name: "국어과",
    description: "국어과 공지, 과제 정보를 공유하는 공간입니다.",
    notificationCount: "856명",
  },
  {
    name: "수학과",
    description: "수학 과제 제출, 공지 자료, 스터디 모집을 함께 나눠요.",
    notificationCount: "734명",
  },
  {
    name: "영어과",
    description: "영어 수행, 에세이 피드백을 공유하는 커뮤니티입니다.",
    notificationCount: "612명",
  },
]

const recentCommentPosts = [
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

export default function CommunityPage() {
  return (
    <div className="mx-auto grid w-full max-w-7xl gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <section className="flex min-w-0 flex-col gap-4">
        <section className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold">커뮤니티</h1>
          <p className="text-muted-foreground text-sm">
            관심사별 커뮤니티에서 자유롭게 소통하고 정보를 나눠요.
          </p>
        </section>

        <section className="flex flex-col gap-4">
          {communitySpaces.map((space) => (
            <SpaceCard key={space.name} space={space} variant="community" />
          ))}
        </section>
      </section>

      <aside className="hidden flex-col gap-3 xl:flex">
        <SidePanel title="최근 댓글 많은 글">
          <ul className="space-y-2 text-sm">
            {recentCommentPosts.map((post) => (
              <li key={post.title} className="flex justify-between gap-3">
                <span className="truncate">{post.title}</span>
                <span className="text-muted-foreground shrink-0">{post.count}</span>
              </li>
            ))}
          </ul>
        </SidePanel>
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
