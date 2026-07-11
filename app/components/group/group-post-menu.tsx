import { MoreHorizontalIcon } from "lucide-react"
import { Link } from "react-router"

import { Button } from "~/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"

// 게시물 ⋯ 메뉴. 내 글이면 수정(수정 페이지 링크)/삭제, 남의 글이면 숨기기/신고.
// editTo는 호출부 라우트 기준 상대 경로다(피드에선 posts/:pubId/edit, 상세에선 edit).
export function GroupPostMenu({ isMine, editTo }: { isMine?: boolean; editTo: string }) {
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
          <>
            <DropdownMenuItem asChild>
              <Link to={editTo}>수정</Link>
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive">삭제</DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuItem>숨기기</DropdownMenuItem>
            <DropdownMenuItem variant="destructive">신고하기</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
