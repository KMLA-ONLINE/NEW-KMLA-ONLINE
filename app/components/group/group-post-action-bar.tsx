import { MessageCircleIcon, SendIcon } from "lucide-react"
import { useState } from "react"
import { Link, useHref } from "react-router"
import { toast } from "sonner"

import { GroupReactionButton } from "~/components/group/group-reaction-button"
import { GroupReactionListDialog } from "~/components/group/group-reaction-list-dialog"
import { Twemoji } from "~/components/ui/twemoji"
import type { GroupPostReactionDetails } from "~/lib/group/types"
import type { ReactionType } from "~/lib/reactions"
import { cn } from "~/lib/utils"

const ACTION_CLASS =
  "hover:bg-muted hover:text-foreground flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors"

export function GroupPostActionBar({
  reactionCount,
  commentCount,
  topReactions,
  reactionTypes,
  reactionDetails,
  postPath,
  onComment,
  className,
}: {
  reactionCount: number
  commentCount: number
  topReactions: string[]
  reactionTypes: ReactionType[]
  /** 실명 반응자 목록과 익명 타입별 집계. 없으면 요약은 표시만 되고 클릭되지 않는다. */
  reactionDetails?: GroupPostReactionDetails
  /** 이 게시물의 상대 경로. 카드에선 "posts/:pubId", 상세에선 "."(이미 그 글 위에 있으므로). */
  postPath: string
  /** 주면 댓글 아이콘이 링크 대신 버튼이 된다(상세에서 댓글 입력창으로 포커스). */
  onComment?: () => void
  className?: string
}) {
  // 상대 경로를 이 라우트 기준의 절대 경로로 해석한다 -- 공유 링크에 origin을 붙이려면 필요하다.
  const postHref = useHref(postPath)
  const [reactorsOpen, setReactorsOpen] = useState(false)
  const anonymousReactionCount =
    reactionDetails?.anonymousCounts.reduce((sum, item) => sum + item.count, 0) ?? 0
  const canOpenReactors =
    reactionDetails != null && (reactionDetails.identified.length > 0 || anonymousReactionCount > 0)

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
        {/* 익명 작성 제한 중에도 반응은 허용하며 운영진 반응도 따로 드러내지 않는다.
            TODO(backend): required 공간의 반응은 DB가 당시 is_anonymous=true로 기록해야 한다. */}
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
        canOpenReactors ? (
          <button
            type="button"
            onClick={() => setReactorsOpen(true)}
            aria-label={
              anonymousReactionCount > 0
                ? `반응 ${reactionCount}개 상세 보기`
                : `반응한 사람 ${reactionCount}명 보기`
            }
            className="hover:bg-muted -mr-1 flex items-center gap-0.5 rounded-md px-2 py-1 text-sm transition-colors"
          >
            {topReactions.map((emoji) => (
              <Twemoji key={emoji} text={emoji} className="leading-none" />
            ))}
          </button>
        ) : (
          <div className="flex items-center gap-0.5 pr-2 text-sm">
            {topReactions.map((emoji) => (
              <Twemoji key={emoji} text={emoji} className="leading-none" />
            ))}
          </div>
        )
      ) : null}

      {canOpenReactors ? (
        <GroupReactionListDialog
          open={reactorsOpen}
          onOpenChange={setReactorsOpen}
          reactionDetails={reactionDetails}
          reactionTypes={reactionTypes}
        />
      ) : null}
    </div>
  )
}
