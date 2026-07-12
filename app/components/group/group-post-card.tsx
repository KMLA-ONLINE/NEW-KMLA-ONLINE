import { PinIcon } from "lucide-react"
import { useCallback, useState } from "react"
import { Link } from "react-router"

import { GroupAuthorAvatar } from "~/components/group/group-author-avatar"
import { GroupPostActionBar } from "~/components/group/group-post-action-bar"
import { GroupPostFiles } from "~/components/group/group-post-files"
import { GroupPostImageGrid } from "~/components/group/group-post-image-grid"
import { GroupPostMenu } from "~/components/group/group-post-menu"
import { RelativeTime } from "~/components/relative-time"
import { Badge } from "~/components/ui/badge"
import type { GroupPost } from "~/lib/group/types"
import type { ReactionType } from "~/lib/reactions"
import { cn } from "~/lib/utils"

// 페북식 "카드" 렌즈: 아바타 헤더·제목·본문(3줄 클램프 + 더 보기)·이미지 그리드,
// 그리고 좋아요/댓글/공유를 아이콘+개수로 왼쪽에, 반응 요약 이모지를 오른쪽에.
export function GroupPostCard({
  post,
  reactionTypes,
  canManage,
}: {
  post: GroupPost
  reactionTypes: ReactionType[]
  /** owner/admin이면 남의 글에도 ⋯ 모더레이션 메뉴가 뜬다. */
  canManage?: boolean
}) {
  const authorName = post.author?.name ?? "익명"
  const [expanded, setExpanded] = useState(false)
  const [clampable, setClampable] = useState(false)

  // 3줄 클램프 상태에서 실제로 잘렸는지 마운트 시 측정해 "더 보기"를 필요할 때만 띄운다.
  // effect가 아니라 ref 콜백이라 set-state-in-effect 린트에 걸리지 않는다.
  const measureContent = useCallback((node: HTMLParagraphElement | null) => {
    if (node) setClampable(node.scrollHeight > node.clientHeight + 1)
  }, [])

  // 터치 기기(핸드폰·패드)에서만 본문을 눌러도 "더 보기/접기"가 토글되게 한다. 데스크톱
  // (마우스)은 링크를 직접 누르게 두어 본문 클릭이 방해되지 않게 한다. 텍스트를 드래그해
  // 선택 중이면 무시해 긁다가 접히는 오작동을 막고, 접거나 펼칠 게 있을 때만 반응한다.
  const toggleFromContent = () => {
    if (!clampable && !expanded) return
    if (!window.matchMedia("(pointer: coarse)").matches) return
    const selection = window.getSelection()
    if (selection && !selection.isCollapsed) return
    setExpanded((value) => !value)
  }

  return (
    <article className="bg-card border-foreground/20 sm:border-border overflow-hidden border-b-2 shadow-none sm:rounded-xl sm:border sm:shadow-sm">
      {post.isPinned ? (
        <div className="text-muted-foreground flex items-center gap-1.5 px-4 pt-3 text-xs font-semibold">
          <PinIcon className="size-3.5 -rotate-45 fill-current" aria-hidden="true" />
          고정된 게시물
        </div>
      ) : null}
      <header className={cn("flex items-start gap-3 px-4 pb-3", post.isPinned ? "pt-2" : "pt-4")}>
        <GroupAuthorAvatar name={authorName} anonymous={post.author === null} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">{authorName}</span>
            {post.category ? (
              <Badge variant="secondary" className="shrink-0">
                {post.category.name}
              </Badge>
            ) : null}
          </div>
          <RelativeTime value={post.createdAt} className="text-muted-foreground text-xs" />
        </div>
        <GroupPostMenu
          isMine={post.isMine}
          isPinned={post.isPinned}
          isAnonymous={post.author === null}
          canManage={canManage}
          editTo={`posts/${post.pubId}/edit`}
        />
      </header>

      <div className="px-4">
        <p className="mb-2 text-xl font-semibold">
          <Link to={`posts/${post.pubId}`} className="hover:underline">
            {post.title}
          </Link>
        </p>
        <p
          ref={measureContent}
          onClick={toggleFromContent}
          className={cn(
            "mt-1 text-sm leading-6 whitespace-pre-line",
            !expanded && "line-clamp-3",
            (clampable || expanded) && "pointer-coarse:cursor-pointer"
          )}
        >
          {post.content}
        </p>
        {clampable || expanded ? (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="text-muted-foreground pointer-fine:text-foreground mt-0.5 text-sm font-medium hover:underline pointer-fine:font-semibold"
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
        commentCount={post.commentCount}
        topReactions={post.topReactions}
        reactionTypes={reactionTypes}
        postPath={`posts/${post.pubId}`}
        className="mt-1"
      />
    </article>
  )
}
