import { ArrowLeftIcon, FileIcon, ImageIcon } from "lucide-react"

import { Button } from "~/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs"
import { formatFileSize, getFileTypeLabel, isImageAttachment } from "~/lib/messenger/utils"
import { cn } from "~/lib/utils"
import type { MessageAttachment, Room } from "~/lib/messenger/types"

function EmptyState({ label }: { label: string }) {
  return (
    <div className="text-muted-foreground rounded-3xl border border-dashed p-6 text-center text-sm">
      {label}
    </div>
  )
}

function FileRow({ attachment }: { attachment: MessageAttachment }) {
  const fileSize = formatFileSize(attachment.sizeBytes)

  return (
    <div className="bg-muted/50 flex items-center gap-3 rounded-2xl border p-3">
      <span className="bg-background flex size-9 shrink-0 items-center justify-center rounded-xl border">
        <FileIcon className="text-muted-foreground size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{attachment.name}</p>
        <p className="text-muted-foreground mt-0.5 truncate text-xs">
          {[getFileTypeLabel(attachment), fileSize].filter(Boolean).join(" · ")}
        </p>
      </div>
    </div>
  )
}

export function SharedMediaPane({
  room,
  compact = false,
  onBack,
}: {
  room: Room
  compact?: boolean
  onBack: () => void
}) {
  const attachments = room.messages.flatMap((message) => message.attachments ?? [])
  const images = attachments.filter((attachment) => isImageAttachment(attachment))
  const files = attachments.filter((attachment) => !isImageAttachment(attachment))

  return (
    <aside
      className={cn("bg-card flex h-full min-h-0 flex-col overflow-hidden", !compact && "border-l")}
    >
      <header className="flex shrink-0 items-center gap-2 border-b px-4 py-3">
        <Button variant="ghost" size="icon-sm" aria-label="정보로 돌아가기" onClick={onBack}>
          <ArrowLeftIcon />
        </Button>
        <p className="text-sm font-semibold">공유된 미디어</p>
      </header>

      <Tabs defaultValue="images" className="flex min-h-0 flex-1 flex-col gap-0">
        <div className="messenger-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <TabsContent value="images">
            {images.length > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {images.map((attachment, index) =>
                  attachment.src ? (
                    <img
                      key={attachment.id ?? `${attachment.name}-${index}`}
                      src={attachment.src}
                      alt={attachment.name}
                      className="aspect-square rounded-2xl object-cover"
                    />
                  ) : (
                    <div
                      key={attachment.id ?? `${attachment.name}-${index}`}
                      className="bg-muted flex aspect-square items-center justify-center rounded-2xl border"
                      aria-label={attachment.name}
                      role="img"
                    >
                      <ImageIcon className="text-primary" />
                    </div>
                  )
                )}
              </div>
            ) : (
              <EmptyState label="공유된 이미지가 없습니다." />
            )}
          </TabsContent>

          <TabsContent value="files">
            {files.length > 0 ? (
              <div className="flex flex-col gap-2">
                {files.map((attachment, index) => (
                  <FileRow
                    key={attachment.id ?? `${attachment.name}-${index}`}
                    attachment={attachment}
                  />
                ))}
              </div>
            ) : (
              <EmptyState label="공유된 파일이 없습니다." />
            )}
          </TabsContent>
        </div>

        <TabsList className="mx-4 mb-4 grid w-full grid-cols-2">
          <TabsTrigger value="images">이미지 {images.length}</TabsTrigger>
          <TabsTrigger value="files">파일 {files.length}</TabsTrigger>
        </TabsList>
      </Tabs>
    </aside>
  )
}
