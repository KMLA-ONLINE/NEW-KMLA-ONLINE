import type { ComponentType, CSSProperties } from "react"
import { FileIcon, ImageIcon, VideoIcon } from "lucide-react"

import { AudioPlayer } from "~/components/media/audio-player"
import { VideoPlayer } from "~/components/media/video-player"
import { PhotoLink } from "~/components/messenger/photo-link"
import {
  MESSAGE_IMAGE_BOUNDS,
  formatFileSize,
  getAttachmentKind,
  getBoundedImageSize,
  getBoundedVideoBox,
} from "~/lib/messenger/utils"
import { cn } from "~/lib/utils"
import type { MessageAttachment } from "~/lib/messenger/types"

const DEFAULT_IMAGE_SIZE = getBoundedImageSize(4, 3)
const IMAGE_GRID_SIZE = MESSAGE_IMAGE_BOUNDS.maxWidth
const IMAGE_GRID_MAX_TILES = 4
const MEDIA_BOX_CLASS = "bg-muted max-w-full overflow-hidden rounded-3xl border"

// A preferred width + the photo's aspect ratio (not a fixed height): with
// max-w-full the box shrinks to the bubble column on narrow screens and its
// height follows the ratio, so nothing distorts or over-crops. object-cover
// still crops the extreme ratios that getBoundedImageSize clamped.
function getImageBoxStyle(attachment: MessageAttachment): CSSProperties {
  const { width, height } =
    attachment.width && attachment.height
      ? getBoundedImageSize(attachment.width, attachment.height)
      : DEFAULT_IMAGE_SIZE
  return { width, aspectRatio: `${width} / ${height}` }
}

/** A width and a ratio, so a narrowed bubble shortens the clip instead of letterboxing it. */
function getVideoBoxStyle(attachment: MessageAttachment): CSSProperties {
  return getBoundedVideoBox(attachment.width, attachment.height)
}

function getImageGridTileSpanClassName(tileCount: number, index: number) {
  if (tileCount === 2) {
    return "row-span-2"
  }

  if (tileCount === 3 && index === 0) {
    return "row-span-2"
  }

  return ""
}

function MediaPlaceholder({
  name,
  icon: Icon = ImageIcon,
  className,
  style,
}: {
  name: string
  icon?: ComponentType<{ className?: string }>
  className?: string
  style?: CSSProperties
}) {
  return (
    <div
      role="img"
      aria-label={name}
      style={style}
      className={cn("flex items-center justify-center", className)}
    >
      <Icon className="text-primary" />
    </div>
  )
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
        "bg-muted text-foreground flex w-44 max-w-full cursor-pointer items-center gap-2 rounded-2xl px-2 py-2 sm:w-52",
        className
      )}
    >
      <span className="bg-background flex size-7 shrink-0 items-center justify-center rounded-lg border">
        <FileIcon className="text-muted-foreground size-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px]">{attachment.name}</span>
        <span className="text-muted-foreground mt-0.5 block truncate text-xs">{fileSize}</span>
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
  const boxStyle = getImageBoxStyle(attachment)
  const boxClassName = cn(MEDIA_BOX_CLASS, className)

  if (!attachment.src) {
    return <MediaPlaceholder name={attachment.name} style={boxStyle} className={boxClassName} />
  }

  return (
    <figure style={boxStyle} className={boxClassName}>
      <PhotoLink attachmentId={attachment.id} className="block size-full">
        <img src={attachment.src} alt={attachment.name} className="size-full object-cover" />
      </PhotoLink>
    </figure>
  )
}

function MessageVideo({
  attachment,
  className,
}: {
  attachment: MessageAttachment
  className?: string
}) {
  const boxStyle = getVideoBoxStyle(attachment)

  if (!attachment.src) {
    return (
      <MediaPlaceholder
        name={attachment.name}
        icon={VideoIcon}
        style={boxStyle}
        className={cn(MEDIA_BOX_CLASS, className)}
      />
    )
  }

  return (
    <figure style={boxStyle} className={cn(MEDIA_BOX_CLASS, "bg-black", className)}>
      <VideoPlayer src={attachment.src} name={attachment.name} />
    </figure>
  )
}

function MessageImageGrid({ attachments }: { attachments: MessageAttachment[] }) {
  const visibleAttachments = attachments.slice(0, IMAGE_GRID_MAX_TILES)
  const remainder = attachments.length - visibleAttachments.length

  return (
    <div
      style={{ width: IMAGE_GRID_SIZE, aspectRatio: "1 / 1" }}
      className="grid max-w-full grid-cols-2 grid-rows-2 gap-1 overflow-hidden rounded-3xl border"
    >
      {visibleAttachments.map((attachment, index) => {
        const isLastTile = index === visibleAttachments.length - 1
        const showOverflow = isLastTile && remainder > 0
        // pointer-events-none so the badge does not swallow the tile's link.
        const overflowBadge = showOverflow ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/50">
            <span className="text-lg font-semibold text-white">+{remainder}</span>
          </div>
        ) : null

        return (
          <div
            key={attachment.id}
            className={cn(
              "bg-muted relative overflow-hidden",
              getImageGridTileSpanClassName(visibleAttachments.length, index)
            )}
          >
            {attachment.src ? (
              <PhotoLink attachmentId={attachment.id} className="block size-full">
                <img
                  src={attachment.src}
                  alt={attachment.name}
                  className="size-full object-cover"
                />
              </PhotoLink>
            ) : (
              <MediaPlaceholder name={attachment.name} className="size-full" />
            )}
            {overflowBadge}
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
  const images = attachments.filter((attachment) => getAttachmentKind(attachment) === "image")
  const [firstImage] = images

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {images.length > 1 ? (
        <MessageImageGrid attachments={images} />
      ) : firstImage ? (
        <MessageImage attachment={firstImage} />
      ) : null}

      {attachments.map((attachment) => {
        const kind = getAttachmentKind(attachment)

        if (kind === "image") {
          return null
        }

        if (kind === "video") {
          return <MessageVideo key={attachment.id} attachment={attachment} />
        }

        // Audio with no source is just a file we happen to be unable to play.
        if (kind === "audio" && attachment.src) {
          return (
            <AudioPlayer
              key={attachment.id}
              src={attachment.src}
              name={attachment.name}
              durationSeconds={attachment.durationSeconds}
            />
          )
        }

        return <FilePreview key={attachment.id} attachment={attachment} />
      })}
    </div>
  )
}
