import { FileIcon, ImageIcon } from "lucide-react"

import { isImageAttachment } from "~/lib/messenger/utils"
import { cn } from "~/lib/utils"
import type { MessageAttachment } from "~/lib/messenger/types"

function formatFileSize(sizeBytes: number | undefined) {
  if (sizeBytes === undefined) {
    return null
  }

  if (sizeBytes < 1024) {
    return `${sizeBytes} B`
  }

  if (sizeBytes < 1024 * 1024) {
    return `${Math.round(sizeBytes / 1024)} KB`
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`
}

function getFileTypeLabel(attachment: MessageAttachment) {
  if (attachment.contentType) {
    return attachment.contentType.split("/").pop()?.toUpperCase() ?? "FILE"
  }

  const extension = attachment.name.split(".").pop()
  return extension && extension !== attachment.name ? extension.toUpperCase() : "FILE"
}

function MockImage({
  attachment,
  className,
}: {
  attachment: MessageAttachment
  className?: string
}) {
  return (
    <div
      role="img"
      aria-label={attachment.name}
      className={cn("bg-muted w-72 max-w-full overflow-hidden rounded-3xl border", className)}
    >
      <div className="grid h-44 grid-cols-[1.3fr_0.7fr] gap-1 p-1">
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
        "bg-muted text-foreground flex w-56 max-w-full items-center gap-2.5 rounded-2xl border px-2.5 py-2.5 sm:w-60",
        className
      )}
    >
      <span className="bg-background flex size-8 shrink-0 items-center justify-center rounded-xl border">
        <FileIcon className="text-muted-foreground size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{attachment.name}</span>
        <span className="text-muted-foreground mt-0.5 block truncate text-xs">
          {[getFileTypeLabel(attachment), fileSize].filter(Boolean).join(" · ")}
        </span>
      </span>
    </div>
  )
}

export function MessageAttachmentPreview({
  attachment,
  className,
}: {
  attachment: MessageAttachment
  className?: string
}) {
  if (!isImageAttachment(attachment)) {
    return <FilePreview attachment={attachment} className={className} />
  }

  if (!attachment.src) {
    return <MockImage attachment={attachment} className={className} />
  }

  return (
    <figure
      className={cn("bg-muted w-72 max-w-[14rem] overflow-hidden rounded-3xl border", className)}
    >
      <img src={attachment.src} alt={attachment.name} className="max-h-72 w-full object-cover" />
    </figure>
  )
}
