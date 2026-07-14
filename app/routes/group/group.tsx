import { Globe2Icon, LandmarkIcon, LockIcon, SearchIcon, UsersIcon } from "lucide-react"
import { useState } from "react"
import { Link, Outlet, useSearchParams } from "react-router"
import { toast } from "sonner"

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
import type { GroupMemberRole } from "~/lib/group/types"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { PLACEHOLDER_REACTION_TYPES } from "~/lib/reactions"
import { cn } from "~/lib/utils"

const FEED_PAGE_SIZE = 6

// 이 라우트는 모바일에서 상·좌·우 패딩을 없애 헤더·카드가 화면 가장자리까지 차게 한다(음수 마진 대신).
// 특정 그룹으로 드릴인하면 하단 탭바를 숨겨 몰입형 공간으로 만든다(메신저 방 진입과 동일 규칙).
export const handle = { mobileContentEdge: "bleed" as const, showMobileTabBar: false }

/**
 * group 라우트가 모달 자식(상세·수정)에 내려주는 컨텍스트. 자식은 useOutletContext로 읽는다.
 * 권한이 두 층이라 둘 다 내려준다 -- canManage(owner/admin: 삭제·익명 제한)와
 * canCurate(owner/admin/manager: 고정). 하나로 합치면 매니저가 남의 글 삭제 버튼을 보게 된다.
 */
export type GroupOutletContext = { canManage: boolean; canCurate: boolean }

type GroupTab = "posts" | "members" | "settings"

// curateOnly: 매니저도 볼 수 있다. 설정 탭에 카테고리 관리가 들어 있고 그건 can_curate_space라
// 매니저에게도 열려 있기 때문이다 -- 탭 자체를 관리자로 잠그면 매니저가 카테고리를 못 만진다.
// 탭 안에서 운영 섹션(기본정보·가입정책·글쓰기제한·익명)은 GroupSettings가 canManage로 다시 가린다.
const TABS: { id: GroupTab; label: string; curateOnly?: boolean }[] = [
  { id: "posts", label: "게시물" },
  { id: "members", label: "멤버" },
  { id: "settings", label: "그룹 설정", curateOnly: true },
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

  const selectCategory = (id: number | null) => {
    setCategoryId(id)
    setFeedVisible(FEED_PAGE_SIZE)
  }

  // 가입 정책·멤버·가입 요청은 서로 영향을 줘서(정책 전환 시 대기 요청 정리) 여기서 함께 들고
  // 있는다. 저장(백엔드)만 미루고 mock 동작은 실제처럼 반영한다.
  const [joinPolicy, setJoinPolicy] = useState(mockGroup.joinPolicy)
  // spaces.post_policy. 'managers'면 owner/admin/manager만 메인 글을 쓴다(공지형 그룹).
  // 댓글은 이 정책과 무관하게 열려 있다 -- comments_insert는 can_access_post만 본다.
  const [postPolicy, setPostPolicy] = useState(mockGroup.postPolicy)
  // spaces.allow_anonymous_posts. 끄면 새 익명 글/댓글이 안 만들어진다(서버 트리거가 강제).
  // 기존 익명 글은 그대로 익명이다 -- is_anonymous는 불변이라 소급해서 까이지 않는다.
  const [allowAnonymous, setAllowAnonymous] = useState(mockGroup.allowAnonymous)
  // spaces.image_url. 업로드는 2단계다(Storage 직접 업로드 -> finalize_space_image). 지금은
  // 로컬 object URL이라 새로고침하면 사라진다.
  const [imageUrl, setImageUrl] = useState(mockGroup.imageUrl)
  const [members, setMembers] = useState(mockGroupMembers)
  const [pendingRequests, setPendingRequests] = useState(mockJoinRequests)
  const [memberCount, setMemberCount] = useState(mockGroup.memberCount)

  // 개발용 미리보기: ?as=admin|manager 로 그 시점을 본다. 백엔드 붙으면 로더가 내려주는
  // mockGroup.viewerRole이 그대로 쓰이고 이 override는 사라진다.
  const roleOverride = searchParams.get("as")
  const viewerRole: GroupMemberRole | null =
    roleOverride === "admin" || roleOverride === "manager" ? roleOverride : mockGroup.viewerRole

  // 권한은 두 층이다(private.can_manage_space / private.can_curate_space).
  // 사람과 규칙을 다루는 일(설정·초대·가입승인·삭제·익명정지·역할변경)은 owner/admin만.
  const canManage = viewerRole === "owner" || viewerRole === "admin"
  // 게시판을 굴리는 일(글 고정, 카테고리)은 매니저까지.
  const canCurate = canManage || viewerRole === "manager"
  // private.can_post_in_space와 같은 규칙. 여기서 막는 건 어디까지나 UI 정리이고, 실제 강제는
  // 서버가 한다(posts_insert 정책 + create_post_with_attachments 양쪽).
  const canPost = postPolicy === "all" ? viewerRole !== null : canCurate

  const liveGroup = {
    ...mockGroup,
    imageUrl,
    joinPolicy,
    postPolicy,
    canPost,
    memberCount,
    allowAnonymous,
    viewerRole,
    canPostAnonymously: allowAnonymous && mockGroup.anonymitySuspendedUntil === null,
  }

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

  const showJoinRequests = canManage && joinPolicy === "request"
  // 그룹 설정 탭은 매니저까지 본다(카테고리 관리가 거기 있다). 운영 섹션은 탭 안에서 다시 가린다.
  const visibleTabs = TABS.filter((item) => !item.curateOnly || canCurate)

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
        cohort: request.cohort,
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

  // request에서 벗어나려면 대기 요청이 먼저 비어 있어야 한다(서버 set_space_join_policy와 같은
  // 규칙). 남겨두면 그 요청들은 아무도 승인할 수 없는 유령이 된다 -- 정책이 바뀌는 순간 이 그룹의
  // 요청함이 화면에서 사라지기 때문이다. 서버가 대신 일괄 수락/거절하지 않는 것도 같은 이유다:
  // 그건 관리자가 내릴 판단이지 정책 전환의 부수 효과일 수 없다.
  const changeJoinPolicy = (next: typeof joinPolicy) => {
    if (next === joinPolicy) return
    if (joinPolicy === "request" && pendingRequests.length > 0) {
      toast.error(`대기 중인 가입 요청 ${pendingRequests.length}건을 먼저 처리해주세요`)
      return
    }
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

      <nav className="mx-2 mt-1 flex items-center gap-1 border-b md:mb-3" aria-label="그룹 메뉴">
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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex min-w-0 flex-col sm:gap-4">
          {tab === "posts" ? (
            <>
              {/* 모바일에선 카드 스택과 같은 언어로 -- flush + border-b-2 구분선. sm+에선
                  다른 카드처럼 라운드·테두리 카드가 되고 위 컨테이너 gap이 사이를 벌린다.

                  글을 못 쓰는 사람(post_policy='managers'인데 매니저가 아님)에겐 입력창을 아예
                  안 띄운다 -- 눌러봤자 서버가 막을 입구를 열어두는 건 거짓말이다. 대신 왜 못 쓰는지
                  한 줄로 말해준다. 댓글은 여전히 열려 있다는 것도 같이. */}
              {canPost ? (
                <Link
                  to="new"
                  className="group bg-card border-foreground/20 sm:border-border flex items-center gap-3 overflow-hidden rounded-none border-b-2 px-4 py-3 sm:rounded-xl sm:border sm:px-3 sm:py-2.5"
                >
                  <div
                    className="bg-muted size-9 shrink-0 rounded-full border"
                    aria-hidden="true"
                  />
                  <span className="bg-muted text-muted-foreground flex-1 rounded-full px-4 py-2 text-sm transition-[filter] group-hover:brightness-95">
                    글쓰기…
                  </span>
                </Link>
              ) : (
                <p className="text-muted-foreground bg-card border-foreground/20 sm:border-border rounded-none border-b-2 px-4 py-3 text-sm sm:rounded-xl sm:border sm:px-4">
                  이 그룹은 매니저만 게시물을 올릴 수 있습니다. 댓글은 자유롭게 달 수 있어요.
                </p>
              )}

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
                canManage={canManage}
                canCurate={canCurate}
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
                {/* 역할 변경이 매니저를 임명하는 유일한 통로다 -- 글쓰기 제한만 켜고 매니저가
                    없으면 owner/admin만 쓰는 그룹이 된다.
                    TODO(backend): set_space_member_role RPC 호출 후 revalidate. */}
                <GroupMemberList
                  members={members}
                  viewerRole={viewerRole}
                  onRoleChange={(target, role) =>
                    setMembers((current) =>
                      current.map((member) =>
                        member.id === target.id ? { ...member, role } : member
                      )
                    )
                  }
                  // 이양은 **맞바꿈**이다: 상대가 owner가 되고 기존 owner는 admin이 된다.
                  // 한쪽만 바꾸면 owner가 둘이 되거나 없어진다(서버도 같은 이유로 UPDATE가 둘이다).
                  onTransferOwnership={(target) =>
                    setMembers((current) =>
                      current.map((member) => {
                        if (member.id === target.id) return { ...member, role: "owner" as const }
                        if (member.role === "owner") return { ...member, role: "admin" as const }
                        return member
                      })
                    )
                  }
                />
              </div>
            </div>
          ) : (
            <GroupSettings
              group={liveGroup}
              categories={mockGroupCategories}
              canManage={canManage}
              imageUrl={imageUrl}
              onImageChange={setImageUrl}
              joinPolicy={joinPolicy}
              onJoinPolicyChange={changeJoinPolicy}
              pendingRequestCount={pendingRequests.length}
              postPolicy={postPolicy}
              onPostPolicyChange={setPostPolicy}
              allowAnonymous={allowAnonymous}
              onAllowAnonymousChange={setAllowAnonymous}
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

      {/* 모달 라우트(상세·수정)는 URL에 ?as=admin이 안 따라가므로 뷰어 권한을 context로 내려준다.
          백엔드 붙으면 부모 로더의 viewerRole이 그 자리를 대신한다. */}
      <Outlet context={{ canManage, canCurate } satisfies GroupOutletContext} />

      <GroupSearchDialog open={searchOpen} onOpenChange={setSearchOpen} posts={mockGroupPosts} />
    </div>
  )
}
