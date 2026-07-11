import { MoreHorizontalIcon } from "lucide-react"
import { useCallback, useState } from "react"
import { Link } from "react-router"

import { GroupPostActionBar } from "~/components/group/group-post-action-bar"
import { GroupPostFiles } from "~/components/group/group-post-files"
import { GroupPostImageGrid } from "~/components/group/group-post-image-grid"
import { RelativeTime } from "~/components/relative-time"
import { Avatar, AvatarFallback } from "~/components/ui/avatar"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import type { GroupPost } from "~/lib/group/types"
import type { ReactionType } from "~/lib/reactions"
import { cn } from "~/lib/utils"

// 페북식 "카드" 렌즈: 아바타 헤더·제목·본문(3줄 클램프 + 더 보기)·이미지 그리드,
// 그리고 좋아요/댓글/공유를 아이콘+개수로 왼쪽에, 반응 요약 이모지를 오른쪽에.
export function GroupPostCard({
  post,
  reactionTypes,
}: {
  post: GroupPost
  reactionTypes: ReactionType[]
}) {
  const authorName = post.author?.name ?? "익명"
  const [expanded, setExpanded] = useState(false)
  const [clampable, setClampable] = useState(false)

  // 3줄 클램프 상태에서 실제로 잘렸는지 마운트 시 측정해 "더 보기"를 필요할 때만 띄운다.
  // effect가 아니라 ref 콜백이라 set-state-in-effect 린트에 걸리지 않는다.
  const measureContent = useCallback((node: HTMLParagraphElement | null) => {
    if (node) setClampable(node.scrollHeight > node.clientHeight + 1)
  }, [])

  return (
    <article className="bg-card border-foreground/20 sm:border-border overflow-hidden border-b-2 shadow-none sm:rounded-xl sm:border sm:shadow-sm">
      <header className="flex items-start gap-3 p-4 pb-3">
        <Avatar size="lg">
          <AvatarFallback>{authorName.charAt(0)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center">
            <span className="truncate text-sm font-semibold">{authorName}</span>
            {post.isPinned ? <Badge variant="secondary">고정</Badge> : null}
          </div>
          <RelativeTime value={post.createdAt} className="text-muted-foreground text-xs" />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              className="text-muted-foreground"
              aria-label="게시물 옵션"
            >
              <MoreHorizontalIcon className="size-4" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>숨기기</DropdownMenuItem>
            <DropdownMenuItem variant="destructive">신고하기</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div className="px-4">
        <h3 className="font-semibold">
          <Link to={`posts/${post.pubId}`} className="hover:underline">
            {post.title}
          </Link>
        </h3>
        <p
          ref={measureContent}
          className={cn(
            "text-muted-foreground mt-1 text-sm leading-6 whitespace-pre-line",
            !expanded && "line-clamp-3"
          )}
        >
          {post.content}
        </p>
        {clampable || expanded ? (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="text-muted-foreground mt-0.5 text-sm font-medium hover:underline"
          >
            {expanded ? "접기" : "더 보기"}
          </button>
        ) : null}
      </div>

      {post.images.length > 0 ? <GroupPostImageGrid images={post.images} className="mt-3" /> : null}

      {post.files?.length ? (
        <div className="mt-3 px-4">
          <GroupPostFiles files={post.files} />
        </div>
      ) : null}

      <GroupPostActionBar
        reactionCount={post.reactionCount}
        commentCount={post.comments.length}
        topReactions={post.topReactions}
        reactionTypes={reactionTypes}
        commentHref={`posts/${post.pubId}`}
        className="mt-1"
      />
    </article>
  )
}
