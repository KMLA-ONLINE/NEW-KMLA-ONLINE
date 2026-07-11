import { Globe2Icon, LandmarkIcon, LockIcon, UsersIcon } from "lucide-react"
import { useState } from "react"
import { Link, Outlet } from "react-router"

import { GroupHeader } from "~/components/group/group-header"
import { GroupMemberList } from "~/components/group/group-member-list"
import { GroupPostFeed } from "~/components/group/group-post-feed"
import { usePostViewMode } from "~/components/group/use-post-view-mode"
import { mockGroup, mockGroupMembers, mockGroupPosts } from "~/lib/group/mock-data"
import { PLACEHOLDER_REACTION_TYPES } from "~/lib/reactions"
import { cn } from "~/lib/utils"

// 이 라우트는 모바일에서 상·좌·우 패딩을 없애 헤더·카드가 화면 가장자리까지 차게 한다(음수 마진 대신).
// 특정 그룹으로 드릴인하면 하단 탭바를 숨겨 몰입형 공간으로 만든다(메신저 방 진입과 동일 규칙).
export const handle = { mobileContentEdge: "bleed" as const, showMobileTabBar: false }

type GroupTab = "posts" | "members"

const TABS: { id: GroupTab; label: string }[] = [
  { id: "posts", label: "게시물" },
  { id: "members", label: "멤버" },
]

// 고정 글은 정렬과 무관하게 항상 맨 위(FB식), 나머지는 최신순(created_at 내림차순). ISO
// 문자열이라 사전식 비교가 곧 시간순이다. 정렬 옵션은 최신순 하나뿐이라 드롭다운은 없다.
function sortForFeed(posts: typeof mockGroupPosts) {
  return [...posts].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1
    return b.createdAt.localeCompare(a.createdAt)
  })
}

// 라우트는 /groups/:pubId. 슬러그로 space·글·멤버를 읽는 로더는 백엔드 붙일 때 추가한다.
export default function GroupPage() {
  const [viewMode, setViewMode] = usePostViewMode()
  const [tab, setTab] = useState<GroupTab>("posts")
  const isPrivate = mockGroup.joinPolicy === "invite_only"
  const PrivacyIcon = isPrivate ? LockIcon : Globe2Icon
  const feedPosts = sortForFeed(mockGroupPosts)

  return (
    <div className="mx-auto w-full max-w-5xl">
      <GroupHeader
        group={mockGroup}
        className="border-0 sm:rounded-xl sm:border"
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />

      <nav className="mx-2 mt-4 flex gap-1 border-b" aria-label="그룹 메뉴">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            aria-current={tab === item.id ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab === item.id
                ? "border-foreground text-foreground"
                : "text-muted-foreground hover:text-foreground border-transparent"
            )}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex min-w-0 flex-col gap-4">
          {tab === "posts" ? (
            <>
              <Link
                to="new"
                className="group bg-card flex items-center gap-3 rounded-none px-4 py-3 sm:rounded-xl sm:border sm:px-3 sm:py-2.5"
              >
                <div className="bg-muted size-9 shrink-0 rounded-full border" aria-hidden="true" />
                <span className="bg-muted text-muted-foreground flex-1 rounded-full px-4 py-2 text-sm transition-[filter] group-hover:brightness-95">
                  글쓰기…
                </span>
              </Link>

              <GroupPostFeed
                posts={feedPosts}
                viewMode={viewMode}
                reactionTypes={PLACEHOLDER_REACTION_TYPES}
              />
            </>
          ) : (
            <div className="bg-card px-4 py-3 sm:rounded-xl sm:border sm:p-4">
              <GroupMemberList members={mockGroupMembers} />
            </div>
          )}
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
