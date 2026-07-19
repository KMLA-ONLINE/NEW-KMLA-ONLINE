import { MoreHorizontalIcon } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog"
import { Button } from "~/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"

// 삭제·익명 제한은 되돌리기 어렵거나(삭제) 애먼 사람을 처벌할 수 있어서(익명 제한) 드롭다운에서
// 바로 실행하지 않고 확인 모달을 한 번 거친다. group-member-list.tsx의 소유권 이양 확인과 같은 패턴.
type ConfirmAction = "delete" | "suspend-anonymity" | null

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
  isAnonymitySuspended,
  canManage,
  canCurate,
  editTo,
}: {
  isMine?: boolean
  isPinned?: boolean
  /** 익명 글인지(author가 null). 익명 제한 항목은 익명 글에만 뜬다. */
  isAnonymous?: boolean
  /**
   * 이 글의 작성자가 지금 익명 정지 중인지(get_post/list_space_posts/list_feed_posts의
   * is_author_anonymity_suspended). "익명 제한 취소"는 이 값이 true일 때만 뜬다 -- 정지 중이
   * 아닌 글에 취소 버튼을 띄우면 눌러도 아무 일도 안 나는 죽은 버튼이 된다.
   */
  isAnonymitySuspended?: boolean
  /** owner/admin (can_manage_space). 남의 글 삭제·익명 제한. */
  canManage?: boolean
  /** owner/admin/manager (can_curate_space). 남의 글도 고정할 수 있다. */
  canCurate?: boolean
  editTo: string
}) {
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null)

  if (!isMine && !canCurate) return null

  return (
    <>
      {/* 삭제·익명 제한 AlertDialog와 수정 라우트 Dialog를 여는 메뉴라 non-modal이다. 메뉴와
          뒤이어 열리는 모달이 body의 pointer-events 잠금을 겹쳐 쥐면, 둘이 함께 닫힐 때 잠금이
          풀리지 않아 페이지 전체가 클릭 불가가 된다. */}
      <DropdownMenu modal={false}>
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
          {canCurate ? (
            <DropdownMenuItem>{isPinned ? "고정 해제" : "고정"}</DropdownMenuItem>
          ) : null}

          {/* 매니저는 남의 글을 못 지운다(soft_delete_post는 작성자 또는 can_manage_space). 그래서
            내 글이 아닌데 canManage도 아니면 -- 즉 매니저가 남의 글을 볼 때 -- 삭제는 안 띄운다. */}
          {isMine || canManage ? (
            <>
              {isMine && canCurate ? <DropdownMenuSeparator /> : null}
              {/* TODO(backend): 확인 후 action에서 soft_delete_post(id) RPC. 작성자 또는 관리자를 함수가
                직접 검사하고, 첨부 blob은 삭제 큐로 넘어간다. */}
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirmAction("delete")}>
                삭제
              </DropdownMenuItem>
            </>
          ) : null}

          {/* 익명 악용 대응. 관리자는 이 글의 작성자가 누구인지 끝내 알 수 없고, 그 사람의 익명 권한만
            뺏는다. 밴이 아닌 이유: 밴은 목록을 관리자가 봐야 하고, 그러면 새로 뜬 한 명이 곧 작성자라
            익명이 깨진다. 익명 정지는 스스로 만료돼서 관리자가 볼 이유가 없다.
            형량은 서버가 정한다(1→2→4→8일…) -- 초범인지 상습범인지 관리자는 모르니 고를 수가 없다. */}
          {canManage && isAnonymous ? (
            <>
              <DropdownMenuSeparator />
              {/* TODO(backend): 확인 후 suspend_post_author_anonymity(id). 응답의 suspended_days로
      "N일간 익명 작성을 제한했습니다" 토스트를 띄운다. */}
              <DropdownMenuItem onSelect={() => setConfirmAction("suspend-anonymity")}>
                익명 작성 제한
              </DropdownMenuItem>
              {isAnonymitySuspended ? <DropdownMenuItem>익명 제한 취소</DropdownMenuItem> : null}
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* 백엔드 미연동: 확인해도 모달만 닫힌다. 실제 RPC는 위 TODO(backend) 참고. */}
      <AlertDialog
        open={confirmAction !== null}
        onOpenChange={(open) => !open && setConfirmAction(null)}
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction === "delete" ? "게시물을 삭제할까요?" : "익명 작성을 제한할까요?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction === "delete"
                ? "삭제된 게시물은 복구할 수 없습니다."
                : "작성자는 익명으로 남습니다. 이 그룹에서 일정 기간 익명으로 글을 쓸 수 없게 됩니다."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmAction(null)}>취소</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => setConfirmAction(null)}>
              {confirmAction === "delete" ? "삭제" : "제한"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
