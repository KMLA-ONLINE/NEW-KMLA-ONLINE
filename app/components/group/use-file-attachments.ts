import { useState } from "react"

export type FileAttachment = { file: File; url: string | null }

// 새로 고른 파일을 관리한다. 이미지는 미리보기용 objectURL을 만들고, 삭제할 때 회수한다.
// 닫지 않고 남긴 URL은 언마운트 때 회수하지 않지만(모달이라 드묾), 삭제 경로는 회수한다.
export function useFileAttachments() {
  const [attachments, setAttachments] = useState<FileAttachment[]>([])

  const add = (list: FileList | null) => {
    if (!list) return
    const added = Array.from(list).map((file) => ({
      file,
      url: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
    }))
    setAttachments((prev) => [...prev, ...added])
  }

  const remove = (index: number) => {
    setAttachments((prev) => {
      const target = prev[index]
      if (target?.url) URL.revokeObjectURL(target.url)
      return prev.filter((_, i) => i !== index)
    })
  }

  return { attachments, add, remove }
}
