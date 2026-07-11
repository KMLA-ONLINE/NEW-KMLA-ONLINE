import { Globe2Icon, LandmarkIcon, LockIcon, SearchIcon, UsersIcon } from "lucide-react"
import { useState } from "react"
import { Link, Outlet, useSearchParams } from "react-router"

import { GroupCategoryChips } from "~/components/group/group-category-chips"
import { GroupHeader } from "~/components/group/group-header"
import { GroupJoinRequests } from "~/components/group/group-join-requests"
import { GroupMemberList } from "~/components/group/group-member-list"
import { GroupSearchDialog } from "~/components/group/group-search-dialog"
import { GroupPostFeed } from "~/components/group/group-post-feed"
import { GroupSettings } from "~/components/group/group-settings"
import { usePostViewMode } from "~/components/group/use-post-view-mode"
import { useInfiniteScroll } from "~/hooks/use-infinite-scroll"
import {
  mockGroup,
  mockGroupCategories,
  mockGroupMembers,
  mockGroupPosts,
  mockJoinRequests,
} from "~/lib/group/mock-data"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { PLACEHOLDER_REACTION_TYPES } from "~/lib/reactions"
import { cn } from "~/lib/utils"

// 피드도 한 번에 다 렌더하지 않고 페이지 단위로만(스크롤이 바닥에 닿으면 다음 페이지).
const FEED_PAGE_SIZE = 6

// 이 라우트는 모바일에서 상·좌·우 패딩을 없애 헤더·카드가 화면 가장자리까지 차게 한다(음수 마진 대신).
// 특정 그룹으로 드릴인하면 하단 탭바를 숨겨 몰입형 공간으로 만든다(메신저 방 진입과 동일 규칙).
export const handle = { mobileContentEdge: "bleed" as const, showMobileTabBar: false }

type GroupTab = "posts" | "members" | "settings"

const TABS: { id: GroupTab; label: string; manageOnly?: boolean }[] = [
  { id: "posts", label: "게시물" },
  { id: "members", label: "멤버" },
  { id: "settings", label: "그룹 설정", manageOnly: true },
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
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [feedVisible, setFeedVisible] = useState(FEED_PAGE_SIZE)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchParams] = useSearchParams()

  // 카테고리 필터를 바꾸면 페이지를 처음부터 다시 센다.
  const selectCategory = (id: number | null) => {
    setCategoryId(id)
    setFeedVisible(FEED_PAGE_SIZE)
  }

  // 가입 정책·멤버·가입 요청은 서로 영향을 줘서(정책 전환 시 대기 요청 정리) 여기서 함께 들고
  // 있는다. 저장(백엔드)만 미루고 mock 동작은 실제처럼 반영한다.
  const [joinPolicy, setJoinPolicy] = useState(mockGroup.joinPolicy)
  const [members, setMembers] = useState(mockGroupMembers)
  const [pendingRequests, setPendingRequests] = useState(mockJoinRequests)
  const [memberCount, setMemberCount] = useState(mockGroup.memberCount)
  const liveGroup = { ...mockGroup, joinPolicy, memberCount }

  const isPrivate = joinPolicy === "invite_only"
  const PrivacyIcon = isPrivate ? LockIcon : Globe2Icon
  // 카테고리 필터(null=전체) 적용 후 정렬. 필터가 정렬보다 먼저라 고정 글도 카테고리에 걸린다.
  const feedPosts = sortForFeed(
    mockGroupPosts.filter((post) => categoryId === null || post.category?.id === categoryId)
  )
  const visiblePosts = feedPosts.slice(0, feedVisible)
  const feedHasMore = feedVisible < feedPosts.length
  const feedSentinelRef = useInfiniteScroll(
    () => setFeedVisible((count) => count + FEED_PAGE_SIZE),
    feedHasMore
  )

  // 개발용 미리보기: ?as=admin 이면 관리자 시점으로 본다. 백엔드 붙으면 로더가 내려주는
  // mockGroup.viewerRole이 그대로 쓰이고 이 override는 사라진다.
  const viewerRole = searchParams.get("as") === "admin" ? "admin" : mockGroup.viewerRole
  const canManage = viewerRole === "owner" || viewerRole === "admin"
  // 관리자 & request 정책일 때만 가입 요청을 관리한다(다른 정책은 요청이 쌓이지 않음).
  const showJoinRequests = canManage && joinPolicy === "request"
  // 그룹 설정 탭은 관리자만 본다.
  const visibleTabs = TABS.filter((item) => !item.manageOnly || canManage)

  // 승인 → 멤버 승격(+member_count), 거절 → 목록에서 제거. 저장은 백엔드 붙일 때(approve_
  // join_request RPC / 요청 delete). id/이름/아바타는 그대로 옮기고 role=member.
  const approveRequests = (list: typeof pendingRequests) => {
    if (list.length === 0) return
    const ids = new Set(list.map((request) => request.id))
    setMembers((prev) => [
      ...prev,
      ...list.map((request) => ({
        id: request.id,
        name: request.name,
        avatarUrl: request.avatarUrl,
        role: "member" as const,
        // TODO(backend): joined_at은 서버 default now()가 채운다. 승인은 approve_join_request RPC로
        // 가고 revalidate로 서버 시각을 받아야 하며, 이 프론트 new Date()는 그때 사라진다(mock 전용).
        joinedAt: new Date().toISOString(),
      })),
    ])
    setMemberCount((count) => count + list.length)
    setPendingRequests((prev) => prev.filter((request) => !ids.has(request.id)))
  }
  const rejectRequests = (list: typeof pendingRequests) => {
    const ids = new Set(list.map((request) => request.id))
    setPendingRequests((prev) => prev.filter((request) => !ids.has(request.id)))
  }

  // 정책 전환 시 대기 요청 정리: 비공개=전부 거절, 공개(즉시가입)=전부 수락. request 유지는 그대로.
  const changeJoinPolicy = (next: typeof joinPolicy) => {
    if (next === "public") approveRequests(pendingRequests)
    else if (next === "invite_only") rejectRequests(pendingRequests)
    setJoinPolicy(next)
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <GroupHeader
        group={liveGroup}
        className="border-0 sm:rounded-xl sm:border"
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onViewMembers={() => setTab("members")}
      />

      <nav className="mx-2 mt-4 flex items-center gap-1 border-b" aria-label="그룹 메뉴">
        {visibleTabs.map((item) => (
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
            {item.id === "members" && showJoinRequests && pendingRequests.length > 0 ? (
              <Badge variant="secondary">{pendingRequests.length}</Badge>
            ) : null}
          </button>
        ))}
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground mb-1 ml-auto"
          onClick={() => setSearchOpen(true)}
          aria-label="게시물 검색"
        >
          <SearchIcon className="size-4" />
        </Button>
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

              {mockGroupCategories.length > 0 ? (
                <div className="py-3 sm:py-0">
                  <GroupCategoryChips
                    categories={mockGroupCategories}
                    selected={categoryId}
                    onSelect={selectCategory}
                  />
                </div>
              ) : null}

              <GroupPostFeed
                posts={visiblePosts}
                viewMode={viewMode}
                reactionTypes={PLACEHOLDER_REACTION_TYPES}
                hasMore={feedHasMore}
                sentinelRef={feedSentinelRef}
              />
            </>
          ) : tab === "members" ? (
            <div className="flex flex-col gap-4">
              {showJoinRequests ? (
                <GroupJoinRequests
                  requests={pendingRequests}
                  onApprove={(request) => approveRequests([request])}
                  onReject={(request) => rejectRequests([request])}
                />
              ) : null}
              <div className="bg-card px-4 py-3 sm:rounded-xl sm:border sm:p-4">
                <GroupMemberList members={members} />
              </div>
            </div>
          ) : (
            <GroupSettings
              group={liveGroup}
              categories={mockGroupCategories}
              joinPolicy={joinPolicy}
              onJoinPolicyChange={changeJoinPolicy}
            />
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
              멤버 {memberCount}명
            </div>
          </div>
        </aside>
      </div>

      <Outlet />

      <GroupSearchDialog open={searchOpen} onOpenChange={setSearchOpen} posts={mockGroupPosts} />
    </div>
  )
}
