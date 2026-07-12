import type { Ref } from "react"

import type { PostViewMode } from "~/components/group/use-post-view-mode"
import { GroupPostCard } from "~/components/group/group-post-card"
import { GroupPostRow } from "~/components/group/group-post-row"
import type { GroupPost } from "~/lib/group/types"
import type { ReactionType } from "~/lib/reactions"

// 피드 하단: 더 불러올 게 있으면 sentinel(스크롤이 닿으면 부모가 다음 페이지를 부른다),
// 없으면 끝 표시로 목록이 잘린 게 아님을 알린다.
function FeedFooter({
  hasMore,
  sentinelRef,
}: {
  hasMore: boolean
  sentinelRef?: Ref<HTMLDivElement>
}) {
  if (hasMore) {
    return (
      <div ref={sentinelRef} className="text-muted-foreground py-6 text-center text-sm">
        불러오는 중…
      </div>
    )
  }
  return <p className="text-muted-foreground py-6 text-center text-sm">마지막 게시물입니다</p>
}

// 같은 글 목록을 두 렌즈로 렌더한다: 펼친 카드(페북) 또는 촘촘한 제목 행(레딧). 페이지네이션은
// 부모가 관리하고(posts는 이미 잘린 페이지), hasMore/sentinelRef로 무한 스크롤을 잇는다.
export function GroupPostFeed({
  posts,
  viewMode,
  reactionTypes,
  hasMore = false,
  sentinelRef,
  canManage,
  canCurate,
}: {
  posts: GroupPost[]
  viewMode: PostViewMode
  reactionTypes: ReactionType[]
  hasMore?: boolean
  sentinelRef?: Ref<HTMLDivElement>
  /** owner/admin이면 카드 ⋯에 모더레이션 메뉴가 뜬다. */
  canManage?: boolean
  /** owner/admin/manager. 고정은 매니저도 한다(can_curate_space). */
  canCurate?: boolean
}) {
  if (posts.length === 0) {
    return (
      <div className="text-muted-foreground py-16 text-center">
        <p className="text-foreground font-semibold">아직 게시물이 없습니다</p>
        <p className="mt-1 text-sm">가장 먼저 글을 남겨보세요.</p>
      </div>
    )
  }

  if (viewMode === "list") {
    return (
      <>
        <ul className="divide-border/70 flex flex-col divide-y">
          {posts.map((post) => (
            <li key={post.id}>
              <GroupPostRow post={post} />
            </li>
          ))}
        </ul>
        <FeedFooter hasMore={hasMore} sentinelRef={sentinelRef} />
      </>
    )
  }

  // 모바일에선 카드가 화면 옆까지 full-bleed로 채워지고 라디우스 없이 divider 선으로
  // 나뉜다. sm+에선 라디우스·테두리를 갖춘 카드가 간격을 두고 놓인다.
  return (
    <div className="flex flex-col sm:gap-3">
      {posts.map((post) => (
        <GroupPostCard
          key={post.id}
          post={post}
          reactionTypes={reactionTypes}
          canManage={canManage}
          canCurate={canCurate}
        />
      ))}
      <FeedFooter hasMore={hasMore} sentinelRef={sentinelRef} />
    </div>
  )
}
