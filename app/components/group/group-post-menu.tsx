import { MoreHorizontalIcon } from "lucide-react"
import { Link } from "react-router"

import { Button } from "~/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"

// 게시물 ⋯ 메뉴. 권한이 **두 층**이라 항목마다 다른 걸 본다:
// - 수정: 작성자 본인만(posts_update가 author_id=current_profile_id())
// - 고정/해제: canCurate = owner/admin/**manager** (set_post_pinned → can_curate_space).
//   게시판을 정리하는 일이라 매니저도 한다.
// - 삭제: 작성자 본인 또는 canManage = owner/admin (soft_delete_post). 매니저는 남의 글을 못 지운다.
// - 익명 제한: canManage만. 사람을 다루는 일이다.
// 아무것도 못 하면(일반 멤버가 남의 글을 볼 때) 아예 렌더하지 않는다 -- 숨기기/신고는 스키마에
// 대응 테이블이 없어(가짜 메뉴였음) 걷어냈다.
// editTo는 호출부 라우트 기준 상대 경로다(피드에선 posts/:pubId/edit, 상세에선 edit).
export function GroupPostMenu({
  isMine,
  isPinned,
  isAnonymous,
  canManage,
  canCurate,
  editTo,
}: {
  isMine?: boolean
  isPinned?: boolean
  /** 익명 글인지(author가 null). 익명 제한 항목은 익명 글에만 뜬다. */
  isAnonymous?: boolean
  /** owner/admin (can_manage_space). 남의 글 삭제·익명 제한. */
  canManage?: boolean
  /** owner/admin/manager (can_curate_space). 남의 글도 고정할 수 있다. */
  canCurate?: boolean
  editTo: string
}) {
  if (!isMine && !canCurate) return null

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

        {/* TODO(backend): action에서 set_post_pinned(id, pinned) RPC. can_curate_space(매니저 포함)만
            통과하고 pinned_at/pinned_by는 서버가 찍는다(컬럼 grant로는 남의 글을 못 고정해서 RPC로 뒀다). */}
        {canCurate ? <DropdownMenuItem>{isPinned ? "고정 해제" : "고정"}</DropdownMenuItem> : null}

        {/* 매니저는 남의 글을 못 지운다(soft_delete_post는 작성자 또는 can_manage_space). 그래서
            내 글이 아닌데 canManage도 아니면 -- 즉 매니저가 남의 글을 볼 때 -- 삭제는 안 띄운다. */}
        {isMine || canManage ? (
          <>
            {isMine && canCurate ? <DropdownMenuSeparator /> : null}
            {/* TODO(backend): action에서 soft_delete_post(id) RPC. 작성자 또는 관리자를 함수가 직접
                검사하고, 첨부 blob은 삭제 큐로 넘어간다. */}
            <DropdownMenuItem variant="destructive">삭제</DropdownMenuItem>
          </>
        ) : null}

        {/* 익명 악용 대응. 관리자는 이 글의 작성자가 누구인지 끝내 알 수 없고, 그 사람의 익명 권한만
            뺏는다. 밴이 아닌 이유: 밴은 목록을 관리자가 봐야 하고, 그러면 새로 뜬 한 명이 곧 작성자라
            익명이 깨진다. 익명 정지는 스스로 만료돼서 관리자가 볼 이유가 없다.
            형량은 서버가 정한다(1→2→4→8일…) -- 초범인지 상습범인지 관리자는 모르니 고를 수가 없다. */}
        {canManage && isAnonymous ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
              작성자는 익명으로 남습니다
            </DropdownMenuLabel>
            {/* TODO(backend): suspend_post_author_anonymity(id). 응답의 suspended_days로
                "N일간 익명 작성을 제한했습니다" 토스트를 띄운다. */}
            <DropdownMenuItem>익명 작성 제한</DropdownMenuItem>
            {/* TODO(backend): undo_post_anonymity_suspension(id). 현재 정지를 풀고 누범 단계를 하나
                되돌린다("이번 건 없던 일로") -- 전과 말소가 아니라서 상습범이 초범으로 안 돌아간다.
                void다: 무엇을 취소했는지 알려주면 아무도 다치지 않는 공짜 probe가 되어 익명 글을
                작성자별로 묶을 수 있다(정지는 애먼 사람을 처벌하는 비용이 들지만 취소는 공짜다). */}
            <DropdownMenuItem>익명 제한 취소</DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
