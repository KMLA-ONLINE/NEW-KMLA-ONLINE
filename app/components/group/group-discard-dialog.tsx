import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"

// 작성/수정 모달(new·edit)에서 쓰던 내용을 버리고 나가려 할 때 한 번 되묻는다.
// useCloseConfirmation이 navigate를 가로채 blocked 상태로 만들면 이 다이얼로그가 뜬다.
//
// 이건 작성 모달 위에 겹쳐 뜨는 두 번째 Dialog다. Radix가 레이어를 스택으로 관리하므로
// Esc·바깥 클릭은 맨 위(이 확인창)에만 가고, 아래 작성 모달은 열린 채로 남는다 -- 그래서
// onOpenChange의 close는 "계속 작성"(cancel)과 같은 뜻이 된다. 취소가 안전한 쪽이라
// X·Esc·바깥 클릭이 전부 거기로 떨어지는 게 맞다.
export function GroupDiscardDialog({
  open,
  onCancel,
  onDiscard,
  title = "저장하지 않고 나갈까요?",
  description = "작성 중인 내용은 저장되지 않고 사라져요.",
  discardLabel = "나가기",
}: {
  open: boolean
  onCancel: () => void
  onDiscard: () => void
  title?: string
  description?: string
  discardLabel?: string
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            계속 작성
          </Button>
          <Button type="button" variant="destructive" onClick={onDiscard}>
            {discardLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
