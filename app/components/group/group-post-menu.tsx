import { MoreHorizontalIcon } from "lucide-react"
import { Link } from "react-router"

import { Button } from "~/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"

// 게시물 ⋯ 메뉴. 내 글이면 수정/삭제, 관리자(owner/admin)면 모더레이션(고정·삭제).
// 둘 다 아니면(일반 멤버가 남의 글을 볼 때) 아예 렌더하지 않는다 -- 숨기기/신고는 스키마에
// 대응 테이블이 없어(가짜 메뉴였음) 걷어냈다.
// editTo는 호출부 라우트 기준 상대 경로다(피드에선 posts/:pubId/edit, 상세에선 edit).
export function GroupPostMenu({
  isMine,
  isPinned,
  canManage,
  editTo,
}: {
  isMine?: boolean
  isPinned?: boolean
  /** owner/admin. 남의 글도 고정·삭제할 수 있다(can_manage_space). */
  canManage?: boolean
  editTo: string
}) {
  if (!isMine && !canManage) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          className="text-muted-foreground"
          aria-label="게시물 옵션"
        >
          <MoreHorizontalIcon className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {isMine ? (
          <DropdownMenuItem asChild>
            <Link to={editTo}>수정</Link>
          </DropdownMenuItem>
        ) : null}

        {/* TODO(backend): action에서 set_post_pinned(id, pinned) RPC를 부르면 된다. 관리자만 통과하고
            pinned_at/pinned_by는 서버가 찍는다(컬럼 grant로는 남의 글을 못 고정해서 RPC로 뒀다). */}
        {canManage ? <DropdownMenuItem>{isPinned ? "고정 해제" : "고정"}</DropdownMenuItem> : null}

        {isMine && canManage ? <DropdownMenuSeparator /> : null}
        {/* TODO(backend): action에서 soft_delete_post(id) RPC. 작성자 또는 관리자를 함수가 직접 검사하고,
            첨부 blob은 삭제 큐로 넘어간다. */}
        <DropdownMenuItem variant="destructive">삭제</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
