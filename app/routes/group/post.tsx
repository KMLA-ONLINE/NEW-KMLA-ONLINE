import { PinIcon, XIcon } from "lucide-react"
import { useRef } from "react"
import { useOutletContext, useParams } from "react-router"

import type { GroupOutletContext } from "~/routes/group/group"

import { GroupAuthorAvatar } from "~/components/group/group-author-avatar"
import { GroupCommentComposer } from "~/components/group/group-comment-composer"
import { GroupCommentList } from "~/components/group/group-comment-list"
import { GroupPostActionBar } from "~/components/group/group-post-action-bar"
import { GroupPostFiles } from "~/components/group/group-post-files"
import { GroupPostImageGrid } from "~/components/group/group-post-image-grid"
import { GroupPostMenu } from "~/components/group/group-post-menu"
import { RelativeTime } from "~/components/relative-time"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { useModalClose } from "~/hooks/use-modal-close"
import { mockGroupPosts } from "~/lib/group/mock-data"
import { PLACEHOLDER_REACTION_TYPES } from "~/lib/reactions"

// /groups/:pubId/posts/:postId. 데스크톱은 모달, 모바일은 풀스크린(compose와 같은 패턴).
// 본문 + 좋아요/댓글/공유 + 댓글 목록/입력. 저장은 백엔드 붙일 때.
export default function GroupPostDetailPage() {
  const { postId } = useParams()
  const { canManage } = useOutletContext<GroupOutletContext>()
  const close = useModalClose()
  // 댓글 아이콘은 이미 그 글 위에 있으니 이동할 데가 없다 -- 대신 입력창으로 포커스를 보낸다.
  const composerRef = useRef<HTMLTextAreaElement>(null)
  // postId 파라미터는 posts.pub_id(uuid)다 -- 내부 serial id가 아니라.
  const post = mockGroupPosts.find((item) => item.pubId === postId)
  const authorName = post?.author?.name ?? "익명"
  // comments는 상세 전용 optional(피드엔 없음). 상세는 트리를 조인해 받는다.
  const comments = post?.comments ?? []

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[90svh] flex-col gap-0 overflow-hidden p-0 max-sm:top-0 max-sm:left-0 max-sm:h-svh max-sm:max-h-svh max-sm:max-w-full max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:border-0 sm:max-w-2xl"
      >
        <DialogHeader className="relative flex-row items-center justify-center border-b p-3">
          <DialogTitle className="text-base">
            {post ? `${authorName}님의 게시물` : "게시물"}
          </DialogTitle>
          <DialogDescription className="sr-only">게시물 상세와 댓글</DialogDescription>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={close}
            aria-label="닫기"
            className="text-muted-foreground absolute top-1/2 right-3 -translate-y-1/2"
          >
            <XIcon />
          </Button>
        </DialogHeader>

        {post ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <article>
              <div className="flex flex-col gap-3 p-4">
                {post.isPinned ? (
                  <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold">
                    <PinIcon className="size-3.5 -rotate-45 fill-current" aria-hidden="true" />
                    고정된 게시물
                  </div>
                ) : null}
                <header className="flex items-center gap-3">
                  <GroupAuthorAvatar name={authorName} anonymous={post.author === null} size="lg" />
                  <div className="min-w-0 flex-1">
                    {/* 카테고리 뱃지는 카드(GroupPostCard)와 같은 자리 -- 이름 옆이다. 제목 위에
                        따로 두면 같은 글이 목록과 상세에서 다르게 보인다. */}
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold">{authorName}</span>
                      {post.category ? (
                        <Badge variant="secondary" className="shrink-0">
                          {post.category.name}
                        </Badge>
                      ) : null}
                    </div>
                    <RelativeTime
                      value={post.createdAt}
                      className="text-muted-foreground text-xs"
                    />
                  </div>
                  <GroupPostMenu
                    isMine={post.isMine}
                    isPinned={post.isPinned}
                    isAnonymous={post.author === null}
                    canManage={canManage}
                    editTo="edit"
                  />
                </header>

                <div>
                  <h2 className="font-semibold">{post.title}</h2>
                  <p className="mt-1 text-sm leading-6 whitespace-pre-line">{post.content}</p>
                </div>

                {post.images.length > 0 ? (
                  <GroupPostImageGrid images={post.images} className="overflow-hidden rounded-lg" />
                ) : null}

                {post.files?.length ? <GroupPostFiles files={post.files} /> : null}
              </div>

              <GroupPostActionBar
                reactionCount={post.reactionCount}
                commentCount={post.commentCount}
                topReactions={post.topReactions}
                reactionTypes={PLACEHOLDER_REACTION_TYPES}
                postPath="."
                onComment={() => composerRef.current?.focus()}
              />
            </article>

            <section className="border-t p-4">
              {comments.length > 0 ? (
                <GroupCommentList
                  comments={comments}
                  reactionTypes={PLACEHOLDER_REACTION_TYPES}
                  canManage={canManage}
                />
              ) : (
                <div className="text-muted-foreground py-10 text-center">
                  <p className="text-foreground font-semibold">아직 댓글이 없습니다</p>
                  <p className="mt-1 text-sm">가장 먼저 댓글을 남겨보세요.</p>
                </div>
              )}
            </section>
          </div>
        ) : (
          <div className="text-muted-foreground flex flex-1 items-center justify-center p-10 text-sm">
            게시물을 찾을 수 없습니다.
          </div>
        )}

        <GroupCommentComposer inputRef={composerRef} />
      </DialogContent>
    </Dialog>
  )
}
