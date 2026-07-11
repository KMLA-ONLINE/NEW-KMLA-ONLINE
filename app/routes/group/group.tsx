import { Globe2Icon, LandmarkIcon, LockIcon, PenSquareIcon, UsersIcon } from "lucide-react"
import { Link, Outlet } from "react-router"

import { GroupHeader } from "~/components/group/group-header"
import { GroupPostFeed } from "~/components/group/group-post-feed"
import { usePostViewMode } from "~/components/group/use-post-view-mode"
import { mockGroup, mockGroupPosts } from "~/lib/group/mock-data"
import { PLACEHOLDER_REACTION_TYPES } from "~/lib/reactions"
import { cn } from "~/lib/utils"

// 이 라우트는 모바일에서 상·좌·우 패딩을 없애 헤더·카드가 화면 가장자리까지 차게 한다(음수 마진 대신).
export const handle = { mobileContentPadding: "bleed" as const }

const TABS = [
  { label: "게시물", active: true },
  { label: "멤버", active: false },
  { label: "정보", active: false },
]

// 라우트는 /groups/:pubId. 슬러그로 space와 글을 읽는 로더는 백엔드 붙일 때 추가한다.
// 멤버/정보 탭은 아직 표시만(별도 라우트 없음).
export default function GroupPage() {
  const [viewMode, setViewMode] = usePostViewMode()
  const isPrivate = mockGroup.joinPolicy === "invite_only"
  const PrivacyIcon = isPrivate ? LockIcon : Globe2Icon

  return (
    <div className="mx-auto w-full max-w-5xl">
      <GroupHeader
        group={mockGroup}
        className="border-0 sm:rounded-xl sm:border"
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />

      <nav className="mx-2 mt-4 flex gap-1 border-b" aria-label="그룹 메뉴">
        {TABS.map((tab) => (
          <button
            key={tab.label}
            type="button"
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab.active
                ? "border-foreground text-foreground"
                : "text-muted-foreground hover:text-foreground border-transparent"
            )}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <Link
            to="new"
            className="hover:bg-muted/60 bg-card flex items-center gap-3 rounded-none px-4 py-3 text-left transition-colors sm:rounded-xl sm:border sm:px-3 sm:py-2.5"
          >
            <div className="bg-muted size-8 shrink-0 rounded-full" aria-hidden="true" />
            <span className="text-muted-foreground text-sm">
              {mockGroup.name}에 글을 남겨보세요…
            </span>
            <PenSquareIcon className="text-muted-foreground ml-auto size-4" aria-hidden="true" />
          </Link>

          <GroupPostFeed
            posts={mockGroupPosts}
            viewMode={viewMode}
            reactionTypes={PLACEHOLDER_REACTION_TYPES}
          />
        </div>

        <aside className="hidden lg:block">
          <div className="bg-card sticky top-4 flex flex-col gap-3 rounded-xl border p-4">
            <h2 className="text-sm font-semibold">그룹 정보</h2>
            <p className="text-muted-foreground text-sm">{mockGroup.description}</p>
            <div className="text-muted-foreground flex items-center gap-2 text-sm">
              <LandmarkIcon className="size-4" aria-hidden="true" />
              {mockGroup.type === "group" ? "공식 그룹" : "비공식 그룹"}
            </div>
            <div className="text-muted-foreground flex items-center gap-2 text-sm">
              <PrivacyIcon className="size-4" aria-hidden="true" />
              {isPrivate ? "비공개" : "공개"}
            </div>
            <div className="text-muted-foreground flex items-center gap-2 text-sm">
              <UsersIcon className="size-4" aria-hidden="true" />
              멤버 {mockGroup.memberCount}명
            </div>
          </div>
        </aside>
      </div>

      <Outlet />
    </div>
  )
}
