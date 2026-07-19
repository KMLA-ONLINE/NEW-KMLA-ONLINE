import { Button } from "~/components/ui/button"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog"
import type { GroupSpace } from "~/lib/group/types"

// joinPolicy별로 "나가면 다시 어떻게 들어오는지"가 갈린다 -- 안내 없이 나가면 비공개 그룹은
// 초대를 다시 받아야 하는데, 그걸 모르고 눌렀다가 그룹에서 영영 밀려나는 사람이 생긴다.
const REJOIN_HINT: Record<GroupSpace["joinPolicy"], string> = {
  public: "언제든 다시 가입할 수 있어요.",
  request: "나가면 다시 가입 신청을 하고 승인을 받아야 재가입할 수 있어요.",
  invite_only: "나가면 다시 초대를 받아야만 재가입할 수 있어요.",
}

// leave_space(space_id) RPC는 owner가 부르면 'transfer ownership before leaving'로 거부한다
// (소유자 없는 그룹을 막기 위해). 그래서 owner는 나가기 확인 대신 이양부터 안내한다.
export function GroupLeaveDialog({
  group,
  open,
  onOpenChange,
}: {
  group: Pick<GroupSpace, "name" | "joinPolicy" | "viewerRole">
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const isOwner = group.viewerRole === "owner"

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isOwner ? "소유권을 먼저 넘겨야 해요" : `"${group.name}"에서 나가시겠어요?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isOwner
              ? "그룹장은 소유권을 다른 멤버에게 넘긴 뒤에야 그룹을 나갈 수 있어요. 멤버 목록에서 소유권을 이양해 주세요."
              : REJOIN_HINT[group.joinPolicy]}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {isOwner ? (
            <Button type="button" onClick={() => onOpenChange(false)}>
              확인
            </Button>
          ) : (
            <>
              <AlertDialogCancel onClick={() => onOpenChange(false)}>취소</AlertDialogCancel>
              {/* TODO(backend): 확인 시 leave_space(group.id) RPC. space_members 행을 지우고
                member_count를 줄인다. 성공하면 그룹 목록/피드로 리다이렉트해야 한다. */}
              <Button type="button" variant="destructive" onClick={() => onOpenChange(false)}>
                나가기
              </Button>
            </>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
