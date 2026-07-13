import { MessageCircleIcon, SendIcon } from "lucide-react"
import { Link, useHref } from "react-router"
import { toast } from "sonner"

import { GroupReactionButton } from "~/components/group/group-reaction-button"
import { Twemoji } from "~/components/ui/twemoji"
import type { ReactionType } from "~/lib/reactions"
import { cn } from "~/lib/utils"

const ACTION_CLASS =
  "hover:bg-muted hover:text-foreground flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors"

// 페북식 게시물 footer: 좋아요(롱프레스 반응)·댓글·공유를 아이콘+개수로 왼쪽에,
// 반응 요약 이모지를 오른쪽에. 카드와 상세가 이걸 공유해 항상 동일하게 보인다.
export function GroupPostActionBar({
  reactionCount,
  commentCount,
  topReactions,
  reactionTypes,
  postPath,
  onComment,
  className,
}: {
  reactionCount: number
  commentCount: number
  topReactions: string[]
  reactionTypes: ReactionType[]
  /** 이 게시물의 상대 경로. 카드에선 "posts/:pubId", 상세에선 "."(이미 그 글 위에 있으므로). */
  postPath: string
  /** 주면 댓글 아이콘이 링크 대신 버튼이 된다(상세에서 댓글 입력창으로 포커스). */
  onComment?: () => void
  className?: string
}) {
  // 상대 경로를 이 라우트 기준의 절대 경로로 해석한다 -- 공유 링크에 origin을 붙이려면 필요하다.
  const postHref = useHref(postPath)

  const commentInner = (
    <>
      <MessageCircleIcon className="size-4.5" aria-hidden="true" />
      {commentCount > 0 ? commentCount : null}
    </>
  )

  // 공유는 스키마에 대응 테이블이 없다 -- 백엔드가 붙어도 살아나지 않으니 프론트에서 끝낸다.
  // 터치 기기에선 OS 공유 시트를, 데스크톱에선 링크 복사를 쓴다(마우스로 공유 시트를 여는 건
  // 대개 복사보다 번거롭다). navigator.share는 보안 컨텍스트에서만 존재한다.
  const share = async () => {
    const url = `${window.location.origin}${postHref}`

    if (typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches) {
      try {
        await navigator.share({ url })
      } catch {
        // 공유 시트를 닫으면 reject된다. 취소는 실패가 아니므로 조용히 넘어간다.
      }
      return
    }

    try {
      await navigator.clipboard.writeText(url)
      toast.success("링크를 복사했습니다")
    } catch {
      toast.error("링크를 복사하지 못했습니다")
    }
  }

  return (
    <div className={cn("flex items-center justify-between px-2 py-1", className)}>
      <div className="text-muted-foreground flex items-center">
        <GroupReactionButton count={reactionCount} reactionTypes={reactionTypes} />
        {onComment ? (
          <button type="button" aria-label="댓글" className={ACTION_CLASS} onClick={onComment}>
            {commentInner}
          </button>
        ) : (
          <Link to={postPath} aria-label="댓글" className={ACTION_CLASS}>
            {commentInner}
          </Link>
        )}
        <button type="button" aria-label="공유" className={ACTION_CLASS} onClick={share}>
          <SendIcon className="size-4.5" aria-hidden="true" />
        </button>
      </div>
      {topReactions.length > 0 ? (
        <div className="flex items-center gap-0.5 pr-2 text-sm">
          {topReactions.map((emoji) => (
            <Twemoji key={emoji} text={emoji} className="leading-none" />
          ))}
        </div>
      ) : null}
    </div>
  )
}
