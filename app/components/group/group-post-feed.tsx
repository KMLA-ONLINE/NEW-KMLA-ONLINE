import type { PostViewMode } from "~/components/group/use-post-view-mode"
import { GroupPostCard } from "~/components/group/group-post-card"
import { GroupPostRow } from "~/components/group/group-post-row"
import type { GroupPost } from "~/lib/group/types"

// 같은 글 목록을 두 렌즈로 렌더한다: 펼친 카드(페북) 또는 촘촘한 제목 행(레딧).
export function GroupPostFeed({ posts, viewMode }: { posts: GroupPost[]; viewMode: PostViewMode }) {
  if (viewMode === "list") {
    return (
      <ul className="divide-border/70 flex flex-col divide-y">
        {posts.map((post) => (
          <li key={post.id}>
            <GroupPostRow post={post} />
          </li>
        ))}
      </ul>
    )
  }

  // 모바일에선 카드가 화면 옆까지 full-bleed로 채워지고 라디우스 없이 divider 선으로
  // 나뉜다. sm+에선 라디우스·테두리를 갖춘 카드가 간격을 두고 놓인다.
  return (
    <div className="flex flex-col sm:gap-3">
      {posts.map((post) => (
        <GroupPostCard key={post.id} post={post} />
      ))}
    </div>
  )
}
