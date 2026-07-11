import { HeartIcon, MessageSquareIcon, Share2Icon } from "lucide-react"

import { RelativeTime } from "~/components/relative-time"
import { Avatar, AvatarFallback } from "~/components/ui/avatar"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Separator } from "~/components/ui/separator"
import type { GroupPost } from "~/lib/group/types"

// 페북식 "카드" 렌즈: 작성자·상대시간·제목·본문·반응 요약·액션 바를 펼쳐 보여준다.
// 이미지 그리드와 더보기(⋯) 메뉴는 다음 단계.
export function GroupPostCard({ post }: { post: GroupPost }) {
  const authorName = post.author?.name ?? "익명"

  return (
    <article className="bg-card rounded-xl border p-4 shadow-sm">
      <header className="flex items-center gap-3">
        <Avatar>
          <AvatarFallback>{authorName.charAt(0)}</AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">{authorName}</span>
            {post.isPinned ? <Badge variant="secondary">고정</Badge> : null}
          </div>
          <RelativeTime value={post.createdAt} className="text-muted-foreground text-xs" />
        </div>
      </header>

      <h3 className="mt-3 font-semibold">{post.title}</h3>
      <p className="text-muted-foreground mt-1 text-sm leading-6 whitespace-pre-line">
        {post.content}
      </p>

      <div className="text-muted-foreground mt-3 flex items-center justify-between text-xs">
        <span>좋아요 {post.reactionCount}</span>
        <span>댓글 {post.commentCount}</span>
      </div>

      <Separator className="my-2" />

      <div className="grid grid-cols-3 gap-1">
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
