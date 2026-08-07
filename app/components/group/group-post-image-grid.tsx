import { useCallback } from "react"
import { Link, useLocation, useNavigate, useSearchParams } from "react-router"

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

const GROUP_IMAGE_SEARCH_PARAM = "image"

type GroupImageViewerLocationState = { groupImageViewerPushed: true }

const GROUP_IMAGE_VIEWER_LOCATION_STATE: GroupImageViewerLocationState = {
  groupImageViewerPushed: true,
}

function imageViewerId(postPubId: string, index: number) {
  return `${postPubId}:${index}`
}

export function GroupPostImageGrid({
  images,
  postPubId,
  className,
}: {
  images: GroupPostImage[]
  postPubId: string
  className?: string
}) {
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  // 그리드는 미리보기(최대 5장)지만 뷰어에는 전체를 넘긴다. alt는 file_name이라 뷰어의
  // 이름·다운로드명으로도 그대로 쓴다. URL에는 postPubId까지 넣어 피드의 다른 글 그리드가
  // 같은 index를 자기 사진으로 오해하지 않게 한다.
  const viewerImages: ViewerImage[] = images.map((image, index) => ({
    id: imageViewerId(postPubId, index),
    src: image.src,
    name: image.alt,
  }))
  const requestedImageId = searchParams.get(GROUP_IMAGE_SEARCH_PARAM)
  const openImageId = viewerImages.some((image) => image.id === requestedImageId)
    ? requestedImageId
    : null
  const isPushedImageEntry = Boolean(
    (location.state as GroupImageViewerLocationState | null)?.groupImageViewerPushed
  )
  const closeViewer = useCallback(() => {
    if (isPushedImageEntry) {
      navigate(-1)
      return
    }

    setSearchParams(
      (previousSearchParams) => {
        const nextSearchParams = new URLSearchParams(previousSearchParams)
        nextSearchParams.delete(GROUP_IMAGE_SEARCH_PARAM)
        return nextSearchParams
      },
      { replace: true, preventScrollReset: true }
    )
  }, [isPushedImageEntry, navigate, setSearchParams])
  if (images.length === 0) return null

  const visible = images.slice(0, 5)
  const overflow = images.length - visible.length

  return (
    <>
      <div className={cn("bg-muted overflow-hidden", containerClass(visible.length), className)}>
        {visible.map((image, index) => {
          const showOverflow = overflow > 0 && index === visible.length - 1
          return (
            <Link
              key={`${image.src}-${index}`}
              to={{
                search: (() => {
                  const nextSearchParams = new URLSearchParams(searchParams)
                  nextSearchParams.set(GROUP_IMAGE_SEARCH_PARAM, imageViewerId(postPubId, index))
                  return `?${nextSearchParams}`
                })(),
              }}
              state={GROUP_IMAGE_VIEWER_LOCATION_STATE}
              preventScrollReset
              aria-label={image.alt}
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
            </Link>
          )
        })}
      </div>
      <ImageViewer images={viewerImages} openImageId={openImageId} onClose={closeViewer} />
    </>
  )
}
