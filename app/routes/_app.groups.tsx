import type { ReactNode } from "react"
import { SpaceCard } from "../components/layout/space-card"
const groupSpaces = [
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

const recentNotices = [
  "7월 학생회 회의 일정 안내",
  "기숙사 시설 점검 안내",
  "동아리 활동 보고서 제출 안내",
]

export default function GroupsPage() {
  return (
    <div className="mx-auto grid w-full max-w-7xl gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <section className="flex min-w-0 flex-col gap-4">
        <section className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold">그룹</h1>
          <p className="text-muted-foreground text-sm">
            학교 공식 그룹에서 공지와 업데이트를 확인해요.
          </p>
        </section>

        <section className="flex flex-col gap-4">
          {groupSpaces.map((space) => (
            <SpaceCard key={space.name} space={space} variant="group" />
          ))}
        </section>
      </section>

      <aside className="hidden flex-col gap-3 xl:flex">
        <SidePanel title="최근 공지">
          <ul className="space-y-2 text-sm">
            {recentNotices.map((notice) => (
              <li key={notice} className="truncate">
                {notice}
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
