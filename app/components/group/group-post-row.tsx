import { HeartIcon, MessageSquareIcon, PinIcon } from "lucide-react"
import { Link } from "react-router"

import { GroupEditedMark } from "~/components/group/group-edited-mark"
import { RelativeTime } from "~/components/relative-time"
import { Badge } from "~/components/ui/badge"
import { Twemoji } from "~/components/ui/twemoji"
import type { GroupPost } from "~/lib/group/types"
import { cn } from "~/lib/utils"

export function GroupPostRow({
  post,
  isVisited = false,
  onVisit,
}: {
  post: GroupPost
  isVisited?: boolean
  onVisit?: () => void
}) {
  const authorName = post.author?.name ?? (post.authorAttribution === "staff" ? "운영진" : "익명")
  // 카드와 같은 규칙: 피드(space 있음)에선 그룹을 명시한 절대 경로, 그룹 안에선 라우트 기준 상대 경로.
  const postPath = post.space
    ? `/groups/${post.space.pubId}/posts/${post.pubId}`
    : `posts/${post.pubId}`

  return (
    <Link
      to={postPath}
      onClick={onVisit}
      className={cn(
        "hover:bg-muted/60 flex w-full flex-col gap-1 px-3 py-2.5 text-left transition-colors",
        isVisited && "bg-muted/45 hover:bg-muted/60"
      )}
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
        <p className="line-clamp-1 text-sm font-medium sm:text-base">
          <Twemoji text={post.title} />
        </p>
      </div>
      <div className="text-muted-foreground flex items-center gap-2 text-xs">
        {/* 피드에서만: 출처 그룹. 행 전체가 이미 상세로 가는 Link라(중첩 앵커 금지) 여기선 링크가
            아니라 강조 텍스트로 둔다. */}
        {post.space ? (
          <>
            <span className="text-foreground truncate font-medium">{post.space.name}</span>
            <span aria-hidden="true">·</span>
          </>
        ) : null}
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
