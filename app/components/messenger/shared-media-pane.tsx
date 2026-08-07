import { ArrowLeftIcon, FileIcon, ImageIcon, MusicIcon, VideoIcon } from "lucide-react"
import { useState } from "react"

import { PhotoLink } from "~/components/messenger/photo-link"
import { Button } from "~/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs"
import { useInfiniteScroll } from "~/hooks/use-infinite-scroll"
import {
  formatFileSize,
  getAttachmentKind,
  getFileTypeLabel,
  isImageAttachment,
} from "~/lib/messenger/utils"
import { cn } from "~/lib/utils"
import type { MessageAttachment, Room } from "~/lib/messenger/types"

const SHARED_MEDIA_PAGE_SIZE = 24

function EmptyState({ label }: { label: string }) {
  return (
    <div className="text-muted-foreground rounded-3xl border border-dashed p-6 text-center text-sm">
      {label}
    </div>
  )
}

const ROW_ICON_BY_KIND = {
  image: ImageIcon,
  audio: MusicIcon,
  video: VideoIcon,
  file: FileIcon,
}

function FileRow({ attachment }: { attachment: MessageAttachment }) {
  const fileSize = formatFileSize(attachment.sizeBytes)
  const RowIcon = ROW_ICON_BY_KIND[getAttachmentKind(attachment)]

  return (
    <div className="flex items-center gap-3 py-3">
      <span className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-xl">
        <RowIcon className="text-muted-foreground size-4" />
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

  // 공유 미디어도 한 번에 다 그리지 않고 스크롤하며 페이지 단위로 부른다(탭별로 따로).
  const [imagesVisible, setImagesVisible] = useState(SHARED_MEDIA_PAGE_SIZE)
  const [filesVisible, setFilesVisible] = useState(SHARED_MEDIA_PAGE_SIZE)
  const shownImages = images.slice(0, imagesVisible)
  const shownFiles = files.slice(0, filesVisible)
  const imagesHasMore = imagesVisible < images.length
  const filesHasMore = filesVisible < files.length
  const imagesSentinelRef = useInfiniteScroll(
    () => setImagesVisible((count) => count + SHARED_MEDIA_PAGE_SIZE),
    { enabled: imagesHasMore }
  )
  const filesSentinelRef = useInfiniteScroll(
    () => setFilesVisible((count) => count + SHARED_MEDIA_PAGE_SIZE),
    { enabled: filesHasMore }
  )

  return (
    <aside
      className={cn(
        "bg-card flex h-full min-h-0 min-w-0 flex-col overflow-hidden",
        !compact && "border-l"
      )}
    >
      <header className="flex shrink-0 items-center gap-2 border-b px-4 py-3">
        <Button variant="ghost" size="icon-sm" aria-label="정보로 돌아가기" onClick={onBack}>
          <ArrowLeftIcon />
        </Button>
        <p className="text-sm font-semibold">공유된 미디어</p>
      </header>

      <Tabs defaultValue="images" className="flex min-h-0 min-w-0 flex-1 flex-col gap-0">
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-4">
          <TabsContent value="images">
            {images.length > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {shownImages.map((attachment) =>
                  attachment.src ? (
                    <PhotoLink
                      key={attachment.id}
                      attachmentId={attachment.id}
                      className="block aspect-square overflow-hidden rounded-2xl"
                    >
                      <img
                        src={attachment.src}
                        alt={attachment.name}
                        className="size-full object-cover"
                      />
                    </PhotoLink>
                  ) : (
                    <div
                      key={attachment.id}
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
            {imagesHasMore ? (
              <div
                ref={imagesSentinelRef}
                className="text-muted-foreground py-3 text-center text-xs"
              >
                불러오는 중…
              </div>
            ) : null}
          </TabsContent>

          <TabsContent value="files">
            {files.length > 0 ? (
              <div className="flex flex-col divide-y">
                {shownFiles.map((attachment) => (
                  <FileRow key={attachment.id} attachment={attachment} />
                ))}
              </div>
            ) : (
              <EmptyState label="공유된 파일이 없습니다." />
            )}
            {filesHasMore ? (
              <div
                ref={filesSentinelRef}
                className="text-muted-foreground py-3 text-center text-xs"
              >
                불러오는 중…
              </div>
            ) : null}
          </TabsContent>
        </div>

        <div className="shrink-0 px-4 pt-1 pb-2">
          <TabsList className="grid w-full min-w-0 grid-cols-2">
            <TabsTrigger value="images" className="min-w-0">
              이미지 {images.length}
            </TabsTrigger>
            <TabsTrigger value="files" className="min-w-0">
              파일 {files.length}
            </TabsTrigger>
          </TabsList>
        </div>
      </Tabs>
    </aside>
  )
}
