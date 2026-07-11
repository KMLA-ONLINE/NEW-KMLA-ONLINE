import { RelativeTime } from "~/components/relative-time"
import { Avatar, AvatarFallback } from "~/components/ui/avatar"
import type { GroupComment } from "~/lib/group/types"

// 평면 댓글 목록을 parentId로 스레드화해 렌더한다. 대댓글은 부모 아래로 들여쓰며,
// 임의 깊이를 재귀로 처리한다(comments.parent_id).
export function GroupCommentList({ comments }: { comments: GroupComment[] }) {
  const roots = comments.filter((comment) => comment.parentId === null)

  return (
    <ul className="flex flex-col gap-3">
      {roots.map((comment) => (
        <GroupCommentItem key={comment.id} comment={comment} all={comments} />
      ))}
    </ul>
  )
}

function GroupCommentItem({ comment, all }: { comment: GroupComment; all: GroupComment[] }) {
  const name = comment.author?.name ?? "익명"
  const replies = all.filter((item) => item.parentId === comment.id)

  return (
    <li>
      <div className="flex gap-2">
        <Avatar>
          <AvatarFallback>{name.charAt(0)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="bg-muted w-fit rounded-2xl px-3 py-2">
            <p className="text-xs font-semibold">{name}</p>
            <p className="text-sm">{comment.content}</p>
          </div>
          <RelativeTime
            value={comment.createdAt}
            className="text-muted-foreground mt-1 ml-3 block text-xs"
          />
        </div>
      </div>
      {replies.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-3 pl-10">
          {replies.map((reply) => (
            <GroupCommentItem key={reply.id} comment={reply} all={all} />
          ))}
        </ul>
      ) : null}
    </li>
  )
}
