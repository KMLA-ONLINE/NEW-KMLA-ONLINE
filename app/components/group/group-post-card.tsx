import { HeartIcon, MessageSquareIcon, MoreHorizontalIcon, Share2Icon } from "lucide-react"

import { GroupPostImageGrid } from "~/components/group/group-post-image-grid"
import { RelativeTime } from "~/components/relative-time"
import { Avatar, AvatarFallback } from "~/components/ui/avatar"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Separator } from "~/components/ui/separator"
import type { GroupPost } from "~/lib/group/types"

// 페북식 "카드" 렌즈: 아바타 헤더·제목·본문·이미지 그리드·반응 요약·액션 바.
// 제목은 스키마상 필수라 본문 위 굵은 헤딩으로 둔다(페북엔 제목이 없지만 posts엔 있음).
// 더보기(⋯)는 아직 정적 -- 드롭다운 메뉴는 다음 단계.
export function GroupPostCard({ post }: { post: GroupPost }) {
  const authorName = post.author?.name ?? "익명"

  return (
    <article className="bg-card overflow-hidden rounded-xl border shadow-sm">
      <header className="flex items-start gap-3 p-4 pb-3">
        <Avatar>
          <AvatarFallback>{authorName.charAt(0)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">{authorName}</span>
            {post.isPinned ? <Badge variant="secondary">고정</Badge> : null}
          </div>
          <RelativeTime value={post.createdAt} className="text-muted-foreground text-xs" />
        </div>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          className="text-muted-foreground"
          aria-label="게시물 옵션"
        >
          <MoreHorizontalIcon className="size-4" aria-hidden="true" />
        </Button>
      </header>

      <div className="px-4">
        <h3 className="font-semibold">{post.title}</h3>
        <p className="text-muted-foreground mt-1 text-sm leading-6 whitespace-pre-line">
          {post.content}
        </p>
      </div>

      {post.images.length > 0 ? (
        <GroupPostImageGrid images={post.images} className="mt-3 border-y" />
      ) : null}

      <div className="text-muted-foreground flex items-center justify-between px-4 pt-3 text-xs">
        <span>좋아요 {post.reactionCount}</span>
        <span>댓글 {post.commentCount}</span>
      </div>

      <Separator className="mt-2" />

      <div className="grid grid-cols-3 gap-1 p-1">
        <Button type="button" variant="ghost" size="sm" className="text-muted-foreground w-full">
          <HeartIcon className="size-4" aria-hidden="true" />
          좋아요
        </Button>
        <Button type="button" variant="ghost" size="sm" className="text-muted-foreground w-full">
          <MessageSquareIcon className="size-4" aria-hidden="true" />
          댓글
        </Button>
        <Button type="button" variant="ghost" size="sm" className="text-muted-foreground w-full">
          <Share2Icon className="size-4" aria-hidden="true" />
          공유
        </Button>
      </div>
    </article>
  )
}
