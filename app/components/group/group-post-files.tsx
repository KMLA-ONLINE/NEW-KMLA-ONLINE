import { DownloadIcon, FileIcon, FileTextIcon } from "lucide-react"

import { formatFileSize } from "~/lib/group/format"
import type { GroupPostFile } from "~/lib/group/types"

function fileIcon(contentType: string) {
  if (contentType === "application/pdf" || contentType.startsWith("text/")) return FileTextIcon
  return FileIcon
}

// 이미지가 아닌 첨부를 다운로드 가능한 파일 칩 목록으로. 이미지는 GroupPostImageGrid가 맡는다.
export function GroupPostFiles({ files }: { files?: GroupPostFile[] }) {
  if (!files || files.length === 0) return null

  return (
    <ul className="flex flex-col gap-2">
      {files.map((file, index) => {
        const Icon = fileIcon(file.contentType)
        return (
          <li key={`${file.name}-${index}`}>
            <a
              href={file.url}
              download={file.name}
              className="hover:bg-muted flex items-center gap-3 rounded-lg border p-2 transition-colors"
            >
              <span className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-md">
                <Icon className="text-muted-foreground size-4.5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{file.name}</p>
                <p className="text-muted-foreground text-xs">{formatFileSize(file.sizeBytes)}</p>
              </div>
              <DownloadIcon className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
            </a>
          </li>
        )
      })}
    </ul>
  )
}
