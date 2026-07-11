import { ImagePlusIcon } from "lucide-react"

// 파일을 드래그 중일 때 모달 위에 덮이는 안내 오버레이. pointer-events-none이라 드래그·드롭
// 이벤트는 아래 드롭 존으로 그대로 통과한다.
export function GroupDropOverlay() {
  return (
    <div className="bg-background/85 pointer-events-none absolute inset-0 z-50 flex items-center justify-center p-3">
      <div className="border-primary text-primary flex h-full w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed">
        <ImagePlusIcon className="size-8" aria-hidden="true" />
        <p className="text-sm font-medium">여기에 놓아 첨부하기</p>
      </div>
    </div>
  )
}
