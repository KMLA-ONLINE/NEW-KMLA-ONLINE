import { CheckIcon, XIcon } from "lucide-react"
import { useState } from "react"

import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { useModalClose } from "~/hooks/use-modal-close"

// 단일 알림 설정 -- schema space_members.notification_setting(off/mentions/all)과 1:1.
// "mentions"는 나와 관련된 활동(내 글·댓글에 달린 반응 + 멘션)을 뜻하고, 기본값도 스키마와
// 같은 mentions다. 앱내/푸시 채널 분리는 컬럼 하나에 안 담겨 단일 단계로 합쳤다.
type NotificationSetting = "all" | "mentions" | "off"

const OPTIONS: { value: NotificationSetting; label: string; description: string }[] = [
  { value: "all", label: "전체", description: "이 그룹의 모든 새 게시물을 알립니다" },
  {
    value: "mentions",
    label: "내 게시물·댓글·멘션",
    description: "내 글·댓글에 달린 반응과 나를 멘션한 것만 알립니다",
  },
  { value: "off", label: "없음", description: "이 그룹의 알림을 받지 않습니다" },
]

// /groups/:pubId/noti. 데스크톱 모달 / 모바일 풀스크린(다른 그룹 모달과 같은 패턴).
// 선택은 즉시 반영(로컬 상태). 저장은 백엔드 붙일 때 space_members.notification_setting으로.
export default function GroupNotificationsPage() {
  const close = useModalClose()
  const [setting, setSetting] = useState<NotificationSetting>("mentions")

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[85svh] flex-col gap-0 overflow-hidden p-0 max-sm:top-0 max-sm:left-0 max-sm:h-svh max-sm:max-h-svh max-sm:max-w-full max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:border-0 sm:max-w-md"
      >
        <DialogHeader className="relative flex-row items-center justify-center border-b p-3">
          <DialogTitle className="text-base">알림 설정</DialogTitle>
          <DialogDescription className="sr-only">
            이 그룹의 알림 방식을 설정합니다.
          </DialogDescription>
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

        <div
          role="radiogroup"
          aria-label="알림"
          className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4"
        >
          {OPTIONS.map((option) => {
            const selected = option.value === setting
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setSetting(option.value)}
                className="hover:bg-muted flex items-center gap-3 rounded-lg p-3 text-left transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{option.label}</p>
                  <p className="text-muted-foreground text-xs">{option.description}</p>
                </div>
                {selected ? (
                  <CheckIcon className="text-primary size-5 shrink-0" aria-hidden="true" />
                ) : null}
              </button>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
