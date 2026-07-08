import { FileIcon, ImageIcon } from "lucide-react"

import {
  formatFileSize,
  getBoundedImageSize,
  getFileTypeLabel,
  isImageAttachment,
} from "~/lib/messenger/utils"
import { cn } from "~/lib/utils"
import type { MessageAttachment } from "~/lib/messenger/types"

const DEFAULT_IMAGE_SIZE = getBoundedImageSize(4, 3)
const IMAGE_GRID_SIZE = 224 // px, matches MESSAGE_IMAGE_BOUNDS.maxWidth
const IMAGE_GRID_MAX_TILES = 4

function getImageGridTileSpanClassName(tileCount: number, index: number) {
  if (tileCount === 2) {
    return "row-span-2"
  }

  if (tileCount === 3 && index === 0) {
    return "row-span-2"
  }

  return ""
}

function FilePreview({
  attachment,
  className,
}: {
  attachment: MessageAttachment
  className?: string
}) {
  const fileSize = formatFileSize(attachment.sizeBytes)

  return (
    <div
      className={cn(
        "bg-muted text-foreground flex w-44 max-w-full items-center gap-2 rounded-2xl border px-2 py-2 sm:w-52",
        className
      )}
    >
      <span className="bg-background flex size-7 shrink-0 items-center justify-center rounded-lg border">
        <FileIcon className="text-muted-foreground size-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">{attachment.name}</span>
        <span className="text-muted-foreground mt-0.5 block truncate text-xs">
          {[getFileTypeLabel(attachment), fileSize].filter(Boolean).join(" · ")}
        </span>
      </span>
    </div>
  )
}

function MessageImage({
  attachment,
  className,
}: {
  attachment: MessageAttachment
  className?: string
}) {
  const size =
    attachment.width && attachment.height
      ? getBoundedImageSize(attachment.width, attachment.height)
      : DEFAULT_IMAGE_SIZE

  if (!attachment.src) {
    return (
      <div
        role="img"
        aria-label={attachment.name}
        style={{ width: size.width, height: size.height }}
        className={cn("bg-muted max-w-full overflow-hidden rounded-3xl border", className)}
      >
        <div className="grid h-full grid-cols-[1.3fr_0.7fr] gap-1 p-1">
          <div className="bg-primary/20 flex items-center justify-center rounded-2xl">
            <ImageIcon className="text-primary" />
          </div>
          <div className="grid gap-1">
            <div className="bg-background rounded-2xl" />
            <div className="bg-primary/15 rounded-2xl" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <figure
      style={{ width: size.width, height: size.height }}
      className={cn("bg-muted max-w-full overflow-hidden rounded-3xl border", className)}
    >
      <img src={attachment.src} alt={attachment.name} className="size-full object-cover" />
    </figure>
  )
}

function MessageImageGrid({ attachments }: { attachments: MessageAttachment[] }) {
  const visibleAttachments = attachments.slice(0, IMAGE_GRID_MAX_TILES)
  const remainder = attachments.length - visibleAttachments.length

  return (
    <div
      style={{ width: IMAGE_GRID_SIZE, height: IMAGE_GRID_SIZE }}
      className="grid max-w-full grid-cols-2 grid-rows-2 gap-1 overflow-hidden rounded-3xl border"
    >
      {visibleAttachments.map((attachment, index) => {
        const isLastTile = index === visibleAttachments.length - 1
        const showOverflow = isLastTile && remainder > 0

        return (
          <div
            key={attachment.id ?? `${attachment.name}-${index}`}
            className={cn(
              "bg-muted relative overflow-hidden",
              getImageGridTileSpanClassName(visibleAttachments.length, index)
            )}
          >
            {attachment.src ? (
              <img src={attachment.src} alt={attachment.name} className="size-full object-cover" />
            ) : (
              <div className="flex size-full items-center justify-center">
                <ImageIcon className="text-primary" />
              </div>
            )}
            {showOverflow ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <span className="text-lg font-semibold text-white">+{remainder}</span>
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

export function MessageAttachmentGroup({
  attachments,
  className,
}: {
  attachments: MessageAttachment[]
  className?: string
}) {
  const images = attachments.filter((attachment) => isImageAttachment(attachment))
  const files = attachments.filter((attachment) => !isImageAttachment(attachment))
  const [firstImage] = images

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {images.length > 1 ? (
        <MessageImageGrid attachments={images} />
      ) : firstImage ? (
        <MessageImage attachment={firstImage} />
      ) : null}
      {files.map((attachment, index) => (
        <FilePreview key={attachment.id ?? `${attachment.name}-${index}`} attachment={attachment} />
      ))}
    </div>
  )
}
