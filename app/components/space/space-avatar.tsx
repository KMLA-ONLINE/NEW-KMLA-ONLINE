import type { SpaceSummary } from "~/lib/space/types"
import { cn } from "~/lib/utils"

// 그룹 아이콘(spaces.image_url). 없으면 이니셜 -- 아직 이미지를 올릴 통로가 UI에 붙기 전이라
// 대부분 이 폴백이다. 크기는 호출부가 정한다(행은 작게, 카드는 크게).
export function SpaceAvatar({
  space,
  className,
}: {
  space: Pick<SpaceSummary, "name" | "imageUrl">
  className?: string
}) {
  return (
    <div
      className={cn(
        "bg-muted flex shrink-0 items-center justify-center overflow-hidden rounded-xl border font-semibold",
        className
      )}
    >
      {space.imageUrl ? (
        // 이름이 바로 옆에 있으니 장식이다 -- 스크린리더가 같은 말을 두 번 읽지 않게 alt는 비운다.
        <img src={space.imageUrl} alt="" className="size-full object-cover" />
      ) : (
        space.name.charAt(0)
      )}
    </div>
  )
}
