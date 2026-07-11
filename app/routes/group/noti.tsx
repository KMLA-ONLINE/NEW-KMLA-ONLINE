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

// 앱 내 알림은 schema notification_setting(off/mentions/all)과 대응한다. 푸시는 별도 채널이라
// (mentions/off) 지금 스키마의 단일 컬럼엔 다 담기지 않는다 -- 백엔드 붙일 때 정리할 부분.
type InAppSetting = "all" | "mentions" | "off"
type PushSetting = "mentions" | "off"

const IN_APP_OPTIONS: { value: InAppSetting; label: string; description: string }[] = [
  { value: "all", label: "전체 게시물", description: "새 게시물을 모두 알림으로 받습니다" },
  { value: "mentions", label: "@멘션만", description: "나를 멘션한 글·댓글만 알립니다" },
  { value: "off", label: "해제", description: "이 그룹의 앱 내 알림을 받지 않습니다" },
]

const PUSH_OPTIONS: { value: PushSetting; label: string; description: string }[] = [
  { value: "mentions", label: "@멘션", description: "나를 멘션할 때 푸시 알림을 받습니다" },
  { value: "off", label: "해제", description: "이 그룹의 푸시 알림을 받지 않습니다" },
]

// 선택 리스트(선택 항목에 체크). RadioGroup 의존성 없이 설정 화면에 흔한 패턴.
function NotificationOptions<T extends string>({
  title,
  options,
  value,
  onChange,
}: {
  title: string
  options: { value: T; label: string; description: string }[]
  value: T
  onChange: (next: T) => void
}) {
  return (
    <section role="radiogroup" aria-label={title}>
      <h2 className="text-muted-foreground mb-1 px-1 text-sm font-semibold">{title}</h2>
      <div className="flex flex-col">
        {options.map((option) => {
          const selected = option.value === value
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option.value)}
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
    </section>
  )
}

// /groups/:pubId/noti. 데스크톱 모달 / 모바일 풀스크린(다른 그룹 모달과 같은 패턴).
// 선택은 즉시 반영(로컬 상태). 저장은 백엔드 붙일 때 space_members.notification_setting으로.
export default function GroupNotificationsPage() {
  const close = useModalClose()
  const [inApp, setInApp] = useState<InAppSetting>("all")
  const [push, setPush] = useState<PushSetting>("mentions")

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

        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4">
          <NotificationOptions
            title="앱 내 알림"
            options={IN_APP_OPTIONS}
            value={inApp}
            onChange={setInApp}
          />
          <NotificationOptions
            title="푸시 알림"
            options={PUSH_OPTIONS}
            value={push}
            onChange={setPush}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
