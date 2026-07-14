import { useState } from "react"

import { ImageViewer, type ViewerImage } from "~/components/media/image-viewer"
import type { GroupPostImage } from "~/lib/group/types"
import { cn } from "~/lib/utils"

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
  const [openId, setOpenId] = useState<string | null>(null)

  if (images.length === 0) return null

  // 그리드는 미리보기(최대 5장)지만 뷰어에는 전체를 넘긴다. alt는 file_name이라 뷰어의
  // 이름·다운로드명으로도 그대로 쓴다.
  const viewerImages: ViewerImage[] = images.map((image, index) => ({
    id: String(index),
    src: image.src,
    name: image.alt,
  }))
  const visible = images.slice(0, 5)
  const overflow = images.length - visible.length

  return (
    <>
      <div className={cn("bg-muted overflow-hidden", containerClass(visible.length), className)}>
        {visible.map((image, index) => {
          const showOverflow = overflow > 0 && index === visible.length - 1
          return (
            <button
              key={`${image.src}-${index}`}
              type="button"
              aria-label={image.alt}
              onClick={() => setOpenId(String(index))}
              className={cn(
                "relative block h-full w-full cursor-pointer overflow-hidden",
                tileClass(visible.length, index)
              )}
            >
              <img src={image.src} alt={image.alt} className="h-full w-full object-cover" />
              {showOverflow ? (
                <span className="bg-foreground/60 text-background absolute inset-0 flex items-center justify-center text-lg font-semibold">
                  +{overflow}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
      <ImageViewer images={viewerImages} openImageId={openId} onClose={() => setOpenId(null)} />
    </>
  )
}
