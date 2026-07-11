import { MessageCircleIcon, SendIcon } from "lucide-react"
import { Link } from "react-router"

import { GroupReactionButton } from "~/components/group/group-reaction-button"
import type { ReactionType } from "~/lib/reactions"
import { cn } from "~/lib/utils"

const ACTION_CLASS =
  "hover:bg-muted hover:text-foreground flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors"

// 페북식 게시물 footer: 좋아요(롱프레스 반응)·댓글·공유를 아이콘+개수로 왼쪽에,
// 반응 요약 이모지를 오른쪽에. 카드와 상세가 이걸 공유해 항상 동일하게 보인다.
// commentHref가 있으면 댓글은 상세로 가는 링크, 없으면(상세 안) 평범한 버튼.
export function GroupPostActionBar({
  reactionCount,
  commentCount,
  topReactions,
  reactionTypes,
  commentHref,
  className,
}: {
  reactionCount: number
  commentCount: number
  topReactions: string[]
  reactionTypes: ReactionType[]
  commentHref?: string
  className?: string
}) {
  const commentInner = (
    <>
      <MessageCircleIcon className="size-4.5" aria-hidden="true" />
      {commentCount > 0 ? commentCount : null}
    </>
  )

  return (
    <div className={cn("flex items-center justify-between px-2 py-1", className)}>
      <div className="text-muted-foreground flex items-center">
        <GroupReactionButton count={reactionCount} reactionTypes={reactionTypes} />
        {commentHref ? (
          <Link to={commentHref} aria-label="댓글" className={ACTION_CLASS}>
            {commentInner}
          </Link>
        ) : (
          <button type="button" aria-label="댓글" className={ACTION_CLASS}>
            {commentInner}
          </button>
        )}
        <button type="button" aria-label="공유" className={ACTION_CLASS}>
          <SendIcon className="size-4.5" aria-hidden="true" />
        </button>
      </div>
      {topReactions.length > 0 ? (
        <div className="flex items-center gap-0.5 pr-2 text-sm">
          {topReactions.map((emoji) => (
            <span key={emoji} className="leading-none">
              {emoji}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}
