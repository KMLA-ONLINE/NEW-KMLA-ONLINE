import { HeartIcon, MessageSquareIcon } from "lucide-react"

import { RelativeTime } from "~/components/relative-time"
import { Badge } from "~/components/ui/badge"
import type { GroupPost } from "~/lib/group/types"

// 레딧식 "목록" 렌즈: 본문 없이 제목을 훑고 눌러 들어가는 촘촘한 행. 상세 라우트가
// 아직 없어 지금은 아무 데도 가지 않는 버튼이다.
export function GroupPostRow({ post }: { post: GroupPost }) {
  const authorName = post.author?.name ?? "익명"

  return (
    <button
      type="button"
      className="hover:bg-muted/60 dark:hover:bg-muted/40 flex w-full flex-col gap-1 rounded-md px-3 py-2.5 text-left transition-colors"
    >
      <div className="flex items-center gap-2">
        {post.isPinned ? (
          <Badge variant="secondary" className="shrink-0">
            고정
          </Badge>
        ) : null}
        <p className="line-clamp-1 text-sm font-medium sm:text-base">{post.title}</p>
      </div>
      <div className="text-muted-foreground flex items-center gap-2 text-xs">
        <span className="truncate">{authorName}</span>
        <span aria-hidden="true">·</span>
        <RelativeTime value={post.createdAt} />
        <span className="ml-auto flex shrink-0 items-center gap-3">
          <span className="flex items-center gap-1">
            <HeartIcon className="size-3.5" aria-hidden="true" />
            {post.reactionCount}
          </span>
          <span className="flex items-center gap-1">
            <MessageSquareIcon className="size-3.5" aria-hidden="true" />
            {post.commentCount}
          </span>
        </span>
      </div>
    </button>
  )
}
