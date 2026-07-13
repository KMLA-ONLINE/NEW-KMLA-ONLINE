import { FileIcon, XIcon } from "lucide-react"

import { Button } from "~/components/ui/button"
import { formatFileSize } from "~/lib/group/format"
import { cn } from "~/lib/utils"

export type PreviewImage = { key: string; src: string; onRemove: () => void }
export type PreviewFile = { key: string; name: string; sizeBytes: number; onRemove: () => void }

// 작성/수정 화면의 첨부 미리보기. 이미지는 크게(1장이면 와이드, 여러 장이면 2열) 본문
// 아래에, 그 외 파일은 칩으로. 각 항목의 삭제는 호출부가 onRemove로 넘긴다.
export function GroupAttachmentPreview({
  images,
  files,
}: {
  images: PreviewImage[]
  files: PreviewFile[]
}) {
  if (images.length === 0 && files.length === 0) return null

  return (
    <div className="mt-3 flex flex-col gap-2">
      {images.length > 0 ? (
        <div className={cn("grid gap-2", images.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
          {images.map((image) => (
            <div
              key={image.key}
              className={cn(
                "relative overflow-hidden rounded-lg border",
                images.length === 1 ? "aspect-video" : "aspect-square"
              )}
            >
              <img src={image.src} alt="" className="size-full object-cover" />
              <button
                type="button"
                aria-label="이미지 삭제"
                onClick={image.onRemove}
                className="bg-foreground/60 text-background hover:bg-foreground/80 absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full transition-colors"
              >
                <XIcon className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {files.map((file) => (
        <div key={file.key} className="flex items-center gap-3 rounded-lg border p-2">
          <span className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-md">
            <FileIcon className="text-muted-foreground size-4.5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{file.name}</p>
            <p className="text-muted-foreground text-xs">{formatFileSize(file.sizeBytes)}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="첨부 삭제"
            onClick={file.onRemove}
          >
            <XIcon />
          </Button>
        </div>
      ))}
    </div>
  )
}
