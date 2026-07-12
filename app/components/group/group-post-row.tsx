import { HeartIcon, MessageSquareIcon, PinIcon } from "lucide-react"
import { Link } from "react-router"

import { GroupEditedMark } from "~/components/group/group-edited-mark"
import { RelativeTime } from "~/components/relative-time"
import { Badge } from "~/components/ui/badge"
import type { GroupPost } from "~/lib/group/types"

// 레딧식 "목록" 렌즈: 본문 없이 제목을 훑고 눌러 게시물 상세로 들어가는 촘촘한 행.
export function GroupPostRow({ post }: { post: GroupPost }) {
  const authorName = post.author?.name ?? "익명"

  return (
    <Link
      to={`posts/${post.pubId}`}
      className="hover:bg-muted/60 dark:hover:bg-muted/40 flex w-full flex-col gap-1 rounded-md px-3 py-2.5 text-left transition-colors"
    >
      <div className="flex items-center gap-2">
        {post.isPinned ? (
          <PinIcon
            className="text-muted-foreground size-4 shrink-0 -rotate-45 fill-current"
            role="img"
            aria-label="고정됨"
          />
        ) : null}
        {post.category ? (
          <Badge variant="outline" className="text-muted-foreground shrink-0 font-normal">
            {post.category.name}
          </Badge>
        ) : null}
        <p className="line-clamp-1 text-sm font-medium sm:text-base">{post.title}</p>
      </div>
      <div className="text-muted-foreground flex items-center gap-2 text-xs">
        <span className="truncate">{authorName}</span>
        <span aria-hidden="true">·</span>
        <RelativeTime value={post.createdAt} />
        <GroupEditedMark at={post.updatedAt} />
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
    </Link>
  )
}
