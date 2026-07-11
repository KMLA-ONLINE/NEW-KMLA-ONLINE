import type { GroupPostImage } from "~/lib/group/types"
import { cn } from "~/lib/utils"

// 페북식 콜라주: 1장 와이드, 2장 2열, 3~4장 2x2, 5장+는 마지막 타일에 +N.
// 뷰어 연결은 다음 단계 -- 지금은 표시만.
function containerClass(count: number) {
  if (count === 1) return "aspect-video"
  if (count === 2) return "grid aspect-[2/1] grid-cols-2 gap-1"
  if (count < 5) return "grid aspect-[4/3] grid-cols-2 grid-rows-2 gap-1"
  return "grid aspect-[4/3] grid-cols-6 grid-rows-2 gap-1"
}

function tileClass(count: number, index: number) {
  if (count === 3 && index === 0) return "row-span-2"
  if (count >= 5) return index < 2 ? "col-span-3" : "col-span-2"
  return ""
}

export function GroupPostImageGrid({
  images,
  className,
}: {
  images: GroupPostImage[]
  className?: string
}) {
  if (images.length === 0) return null

  const visible = images.slice(0, 5)
  const overflow = images.length - visible.length

  return (
    <div className={cn("bg-muted overflow-hidden", containerClass(visible.length), className)}>
      {visible.map((image, index) => {
        const showOverflow = overflow > 0 && index === visible.length - 1
        return (
          <div
            key={`${image.src}-${index}`}
            className={cn(
              "relative h-full w-full overflow-hidden",
              tileClass(visible.length, index)
            )}
          >
            <img src={image.src} alt={image.alt} className="h-full w-full object-cover" />
            {showOverflow ? (
              <span className="absolute inset-0 flex items-center justify-center bg-black/60 text-lg font-semibold text-white">
                +{overflow}
              </span>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
