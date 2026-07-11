import { MoreHorizontalIcon, SmilePlusIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { GroupCommentComposer } from "~/components/group/group-comment-composer"
import { QuickReactionList } from "~/components/quick-reaction-list"
import { RelativeTime } from "~/components/relative-time"
import { Avatar, AvatarFallback } from "~/components/ui/avatar"
import { Button } from "~/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import type { GroupComment } from "~/lib/group/types"
import { getReactionGlyph, type ReactionType } from "~/lib/reactions"
import { cn } from "~/lib/utils"

// 평면 댓글 목록을 parentId로 스레드화해 렌더한다. 대댓글은 부모 아래로 들여쓰며,
// 임의 깊이를 재귀로 처리한다(comments.parent_id).
export function GroupCommentList({
  comments,
  reactionTypes,
}: {
  comments: GroupComment[]
  reactionTypes: ReactionType[]
}) {
  const [highlightedId, setHighlightedId] = useState<number | null>(null)
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // TODO(scale): 댓글은 전부 렌더 + parentId 조회가 O(n²)이고 @부모 스크롤이 렌더를 전제한다.
  // 실제로는 상세 로더가 댓글을 페이지네이션(스레드 단위)해 내려줄 자리 -- 그때 창 밖 부모 처리도.
  const roots = comments.filter((comment) => comment.parentId === null)

  // @이름 클릭 시 부모 댓글로 스크롤하고 잠깐 강조한다. 타이머는 언마운트/재호출 시 정리.
  const navigateToComment = (id: number) => {
    setHighlightedId(id)
    document
      .getElementById(`comment-${id}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" })
    if (highlightTimer.current) clearTimeout(highlightTimer.current)
    highlightTimer.current = setTimeout(
      () => setHighlightedId((current) => (current === id ? null : current)),
      1600
    )
  }

  useEffect(
    () => () => {
      if (highlightTimer.current) clearTimeout(highlightTimer.current)
    },
    []
  )

  return (
    <ul className="flex flex-col gap-3">
      {roots.map((comment) => (
        <GroupCommentItem
          key={comment.id}
          comment={comment}
          all={comments}
          reactionTypes={reactionTypes}
          highlightedId={highlightedId}
          onNavigate={navigateToComment}
        />
      ))}
    </ul>
  )
}

function GroupCommentItem({
  comment,
  all,
  reactionTypes,
  highlightedId,
  onNavigate,
  depth = 0,
}: {
  comment: GroupComment
  all: GroupComment[]
  reactionTypes: ReactionType[]
  highlightedId: number | null
  onNavigate: (id: number) => void
  depth?: number
}) {
  const name = comment.author?.name ?? "익명"
  const replies = all.filter((item) => item.parentId === comment.id)
  // 답글이면 부모 댓글 작성자를 본문 앞 @이름 칩으로 붙인다(평탄화돼도 누구 답글인지 보이게).
  const parent = comment.parentId !== null ? all.find((item) => item.id === comment.parentId) : null
  const parentName = parent ? (parent.author?.name ?? "익명") : null
  const [reaction, setReaction] = useState<ReactionType | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [replying, setReplying] = useState(false)

  return (
    <li>
      <div className="flex gap-2">
        <Avatar>
          <AvatarFallback>{name.charAt(0)}</AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-1 items-start gap-1">
          <div className="min-w-0">
            <div
              id={`comment-${comment.id}`}
              className={cn(
                "bg-muted w-fit rounded-2xl px-3 py-2 transition-shadow",
                highlightedId === comment.id && "ring-2 ring-blue-400"
              )}
            >
              <p className="text-xs font-semibold">{name}</p>
              <p className="text-sm">
                {parentName ? (
                  <button
                    type="button"
                    className="mr-1 font-medium text-blue-600 hover:underline dark:text-blue-400"
                    onClick={() => comment.parentId !== null && onNavigate(comment.parentId)}
                  >
                    @{parentName}
                  </button>
                ) : null}
                {comment.content}
              </p>
            </div>
            <div className="text-muted-foreground mt-1 ml-3 flex items-center gap-3 text-xs">
              {/* 반응: 클릭하면 위로 quick reaction 피커, 이미 눌렀으면 클릭으로 해제 */}
              <div className="relative">
                {pickerOpen ? (
                  <>
                    <button
                      type="button"
                      aria-label="반응 선택 닫기"
                      className="fixed inset-0 z-40 cursor-default"
                      onClick={() => setPickerOpen(false)}
                    />
                    <div className="bg-popover absolute bottom-full left-0 z-50 mb-1 rounded-full border p-1 shadow-md">
                      <QuickReactionList
                        reactionTypes={reactionTypes}
                        onSelect={(picked) => {
                          setReaction(picked)
                          setPickerOpen(false)
                        }}
                      />
                    </div>
                  </>
                ) : null}
                <button
                  type="button"
                  aria-label="반응"
                  className="hover:text-foreground flex items-center"
                  onClick={() => (reaction ? setReaction(null) : setPickerOpen(true))}
                >
                  {reaction ? (
                    <span className="text-sm leading-none">{getReactionGlyph(reaction)}</span>
                  ) : (
                    <SmilePlusIcon className="size-4" aria-hidden="true" />
                  )}
                </button>
              </div>
              <button
                type="button"
                className="font-medium hover:underline"
                onClick={() => setReplying((value) => !value)}
              >
                답글
              </button>
              <RelativeTime value={comment.createdAt} />
            </div>
          </div>

          {comment.isMine ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  className="text-muted-foreground ml-auto shrink-0"
                  aria-label="댓글 옵션"
                >
                  <MoreHorizontalIcon className="size-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>수정</DropdownMenuItem>
                <DropdownMenuItem variant="destructive">삭제</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>

      {replies.length > 0 || replying ? (
        <ul className={cn("mt-3 flex flex-col gap-3", depth === 0 && "pl-10")}>
          {replies.map((reply) => (
            <GroupCommentItem
              key={reply.id}
              comment={reply}
              all={all}
              reactionTypes={reactionTypes}
              highlightedId={highlightedId}
              onNavigate={onNavigate}
              depth={depth + 1}
            />
          ))}
          {replying ? (
            <li>
              <GroupCommentComposer
                autoFocus
                className=""
                placeholder={`${name}님에게 답글 남기기…`}
                onSubmit={() => setReplying(false)}
              />
            </li>
          ) : null}
        </ul>
      ) : null}
    </li>
  )
}
