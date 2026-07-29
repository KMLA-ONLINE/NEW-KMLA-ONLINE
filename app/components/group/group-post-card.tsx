import { LandmarkIcon, PinIcon, UsersIcon } from "lucide-react"
import { useCallback, useState } from "react"
import { Link } from "react-router"

import { AnonymousAvatar, ProfileAvatarLink } from "~/components/profile/profile-avatar"
import { GroupEditedMark } from "~/components/group/group-edited-mark"
import { GroupPostActionBar } from "~/components/group/group-post-action-bar"
import { GroupPostFiles } from "~/components/group/group-post-files"
import { GroupPostImageGrid } from "~/components/group/group-post-image-grid"
import { GroupPostMenu } from "~/components/group/group-post-menu"
import { GroupStaffAvatar } from "~/components/group/group-staff-avatar"
import { RelativeTime } from "~/components/relative-time"
import { Badge } from "~/components/ui/badge"
import { RichText } from "~/components/rich-text/rich-text"
import { Twemoji } from "~/components/ui/twemoji"
import type { GroupPost, GroupPostReportReason } from "~/lib/group/types"
import type { ReactionType } from "~/lib/reactions"
import { cn } from "~/lib/utils"

// 페북식 "카드" 렌즈: 아바타 헤더·제목·본문(3줄 클램프 + 더 보기)·이미지 그리드,
// 그리고 좋아요/댓글/공유를 아이콘+개수로 왼쪽에, 반응 요약 이모지를 오른쪽에.
export function GroupPostCard({
  post,
  reactionTypes,
  canManage,
  canCurate,
  reported,
  onReport,
}: {
  post: GroupPost
  reactionTypes: ReactionType[]
  /** owner/admin이면 남의 글에도 ⋯ 모더레이션 메뉴가 뜬다. */
  canManage?: boolean
  /** owner/admin/manager. 고정은 매니저도 한다(can_curate_space). */
  canCurate?: boolean
  reported?: boolean
  onReport?: (post: GroupPost, reason: GroupPostReportReason, details: string | null) => void
}) {
  const isStaffPost = post.authorAttribution === "staff"
  const authorName = post.author?.name ?? (isStaffPost ? "운영진" : "익명")
  // 피드(space 있음)에선 다른 그룹의 글이라 그룹을 명시한 절대 경로로 링크한다. 그룹 안
  // (space 없음)에선 지금까지처럼 라우트 기준 상대 경로 -- 둘 다 상세/수정으로 옳게 간다.
  const postPath = post.space
    ? `/groups/${post.space.pubId}/posts/${post.pubId}`
    : `posts/${post.pubId}`
  const [expanded, setExpanded] = useState(false)
  const [clampable, setClampable] = useState(false)

  // 3줄 클램프 상태에서 실제로 잘렸는지 마운트 시 측정해 "더 보기"를 필요할 때만 띄운다.
  // effect가 아니라 ref 콜백이라 set-state-in-effect 린트에 걸리지 않는다.
  const measureContent = useCallback((node: HTMLDivElement | null) => {
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
      {/* 피드에서만: 이 글이 어느 그룹에서 왔는지. 제목 링크 바깥이라 그룹으로 따로 눌러 갈 수 있다. */}
      {post.space ? (
        <Link
          to={`/groups/${post.space.pubId}`}
          className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 px-4 pt-3 text-xs font-semibold transition-colors"
        >
          {post.space.type === "group" ? (
            <LandmarkIcon className="size-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <UsersIcon className="size-3.5 shrink-0" aria-hidden="true" />
          )}
          <span className="truncate">{post.space.name}</span>
        </Link>
      ) : null}
      {post.isPinned ? (
        <div
          className={cn(
            "text-muted-foreground flex items-center gap-1.5 px-4 text-xs font-semibold",
            post.space ? "pt-1.5" : "pt-3"
          )}
        >
          <PinIcon className="size-3.5 -rotate-45 fill-current" aria-hidden="true" />
          고정된 게시물
        </div>
      ) : null}
      <header
        className={cn(
          "flex items-start gap-3 px-4 pb-3",
          post.isPinned || post.space ? "pt-2" : "pt-4"
        )}
      >
        {post.author ? (
          <ProfileAvatarLink profile={post.author} size="lg" />
        ) : isStaffPost ? (
          <GroupStaffAvatar size="lg" />
        ) : (
          <AnonymousAvatar size="lg" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">{authorName}</span>
            {post.isMine && post.author === null ? (
              <Badge variant="secondary" className="shrink-0">
                나
              </Badge>
            ) : null}
            {post.category ? (
              <Badge variant="secondary" className="shrink-0">
                {post.category.name}
              </Badge>
            ) : null}
          </div>
          <div className="text-muted-foreground flex items-center gap-1 text-xs">
            <RelativeTime value={post.createdAt} />
            <GroupEditedMark at={post.updatedAt} />
          </div>
        </div>
        <GroupPostMenu
          isMine={post.isMine}
          isPinned={post.isPinned}
          isAnonymous={post.author === null && !isStaffPost}
          isAnonymitySuspended={post.isAuthorAnonymitySuspended}
          canManage={canManage}
          canCurate={canCurate}
          editTo={`${postPath}/edit`}
          postTitle={post.title}
          reported={reported}
          onReport={(reason, details) => onReport?.(post, reason, details)}
        />
      </header>

      <div className="px-4">
        {/* 제목은 문단이 아니라 헤딩이다. Tailwind Preflight가 h1~h6의 크기를 inherit으로 리셋하므로
            태그를 바꿔도 화면은 그대로고(크기는 클래스가 정한다), 대신 스크린리더가 피드를 헤딩
            단위로 훑을 수 있게 된다 -- <p>면 게시물 사이를 점프할 수가 없다. 그룹 이름이
            h1(group-header)이라 게시물 제목은 h2다(상세 모달의 제목과도 같은 레벨). */}
        <h2 className="mb-2 text-xl font-semibold">
          <Link to={postPath} className="hover:underline">
            <Twemoji text={post.title} />
          </Link>
        </h2>
        <div
          ref={measureContent}
          onClick={toggleFromContent}
          className={cn(
            "mt-1 text-sm leading-6 whitespace-pre-line",
            !expanded && "line-clamp-3",
            (clampable || expanded) && "pointer-coarse:cursor-pointer"
          )}
        >
          {/* 상세 화면과 같은 블록 렌더러로 제목은 유지하되, 카드에서는 연속 개행을 하나로
              접는다. 바깥 요소에서 전체 블록을 클램프하고 측정해 더 보기 동작을 유지한다. */}
          <RichText text={post.content.replace(/\n{2,}/g, "\n")} mode="block" />
        </div>
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

      {post.images.length > 0 ? (
        <GroupPostImageGrid images={post.images} postPubId={post.pubId} className="mt-3" />
      ) : null}

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
        reactionDetails={post.reactionDetails}
        postPath={postPath}
        className="mt-1"
      />
    </article>
  )
}
