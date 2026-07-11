import { MoreHorizontalIcon, SmilePlusIcon } from "lucide-react"
import { useState } from "react"

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

// 평면 댓글 목록을 parentId로 스레드화해 렌더한다. 대댓글은 부모 아래로 들여쓰며,
// 임의 깊이를 재귀로 처리한다(comments.parent_id).
export function GroupCommentList({
  comments,
  reactionTypes,
}: {
  comments: GroupComment[]
  reactionTypes: ReactionType[]
}) {
  const roots = comments.filter((comment) => comment.parentId === null)

  return (
    <ul className="flex flex-col gap-3">
      {roots.map((comment) => (
        <GroupCommentItem
          key={comment.id}
          comment={comment}
          all={comments}
          reactionTypes={reactionTypes}
        />
      ))}
    </ul>
  )
}

function GroupCommentItem({
  comment,
  all,
  reactionTypes,
}: {
  comment: GroupComment
  all: GroupComment[]
  reactionTypes: ReactionType[]
}) {
  const name = comment.author?.name ?? "익명"
  const replies = all.filter((item) => item.parentId === comment.id)
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
            <div className="bg-muted w-fit rounded-2xl px-3 py-2">
              <p className="text-xs font-semibold">{name}</p>
              <p className="text-sm">{comment.content}</p>
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
        <ul className="mt-3 flex flex-col gap-3 pl-10">
          {replies.map((reply) => (
            <GroupCommentItem
              key={reply.id}
              comment={reply}
              all={all}
              reactionTypes={reactionTypes}
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
