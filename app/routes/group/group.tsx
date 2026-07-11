import { Globe2Icon, LandmarkIcon, LockIcon, UsersIcon } from "lucide-react"
import { useState } from "react"
import { Link, Outlet, useSearchParams } from "react-router"

import { GroupHeader } from "~/components/group/group-header"
import { GroupJoinRequests } from "~/components/group/group-join-requests"
import { GroupMemberList } from "~/components/group/group-member-list"
import { GroupPostFeed } from "~/components/group/group-post-feed"
import { usePostViewMode } from "~/components/group/use-post-view-mode"
import {
  mockGroup,
  mockGroupMembers,
  mockGroupPosts,
  mockJoinRequests,
} from "~/lib/group/mock-data"
import { Badge } from "~/components/ui/badge"
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
  const [searchParams] = useSearchParams()
  const isPrivate = mockGroup.joinPolicy === "invite_only"
  const PrivacyIcon = isPrivate ? LockIcon : Globe2Icon
  const feedPosts = sortForFeed(mockGroupPosts)

  // 개발용 미리보기: ?as=admin 이면 관리자 시점으로 본다. 백엔드 붙으면 로더가 내려주는
  // mockGroup.viewerRole이 그대로 쓰이고 이 override는 사라진다.
  const viewerRole = searchParams.get("as") === "admin" ? "admin" : mockGroup.viewerRole
  const canManage = viewerRole === "owner" || viewerRole === "admin"
  // 관리자 & request 정책일 때만 가입 요청을 관리한다(다른 정책은 요청이 쌓이지 않음).
  const showJoinRequests = canManage && mockGroup.joinPolicy === "request"

  return (
    <div className="mx-auto w-full max-w-5xl">
      <GroupHeader
        group={mockGroup}
        className="border-0 sm:rounded-xl sm:border"
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onViewMembers={() => setTab("members")}
      />

      <nav className="mx-2 mt-4 flex gap-1 border-b" aria-label="그룹 메뉴">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            aria-current={tab === item.id ? "page" : undefined}
            className={cn(
              "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab === item.id
                ? "border-foreground text-foreground"
                : "text-muted-foreground hover:text-foreground border-transparent"
            )}
          >
            {item.label}
            {/* 관리자는 멤버 탭에 대기 중인 가입 요청 수를 배지로 봐서 알아챈다. */}
            {item.id === "members" && showJoinRequests && mockJoinRequests.length > 0 ? (
              <Badge variant="secondary">{mockJoinRequests.length}</Badge>
            ) : null}
          </button>
        ))}
      </nav>

      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex min-w-0 flex-col sm:gap-4">
          {tab === "posts" ? (
            <>
              {/* 모바일에선 카드 스택과 같은 언어로 -- flush + border-b-2 구분선. sm+에선
                  다른 카드처럼 라운드·테두리 카드가 되고 위 컨테이너 gap이 사이를 벌린다. */}
              <Link
                to="new"
                className="group bg-card border-foreground/20 sm:border-border flex items-center gap-3 overflow-hidden rounded-none border-b-2 px-4 py-3 sm:rounded-xl sm:border sm:px-3 sm:py-2.5"
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
            <div className="flex flex-col gap-4">
              {showJoinRequests ? <GroupJoinRequests requests={mockJoinRequests} /> : null}
              <div className="bg-card px-4 py-3 sm:rounded-xl sm:border sm:p-4">
                <GroupMemberList members={mockGroupMembers} />
              </div>
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
