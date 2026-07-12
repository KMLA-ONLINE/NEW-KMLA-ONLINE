import { useEffect, useRef, useState } from "react"

export type FileAttachment = { id: number; file: File; url: string | null }

// 새로 고른 파일을 관리한다. 이미지는 미리보기용 objectURL을 만들고, 삭제·언마운트 시 회수한다.
// 각 항목에 안정적 id를 부여해 리스트 key/삭제에 배열 index를 쓰지 않는다(삭제 시 오결합 방지).
export function useFileAttachments() {
  const [attachments, setAttachments] = useState<FileAttachment[]>([])
  const nextId = useRef(0)

  // 첨부 후 삭제 없이 모달을 닫는 흔한 경로에서 objectURL이 누수되지 않게, 언마운트 때 남은 걸
  // 회수한다. 최신 목록은 effect에서만 ref에 미러링(렌더 단계 ref 쓰기 회피)해 cleanup에서 읽는다.
  const latest = useRef(attachments)
  useEffect(() => {
    latest.current = attachments
  })
  useEffect(
    () => () => latest.current.forEach((item) => item.url && URL.revokeObjectURL(item.url)),
    []
  )

  const add = (list: FileList | null) => {
    if (!list) return
    const added = Array.from(list).map((file) => ({
      id: nextId.current++,
      file,
      url: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
    }))
    setAttachments((prev) => [...prev, ...added])
  }

  const remove = (id: number) => {
    setAttachments((prev) => {
      const target = prev.find((item) => item.id === id)
      if (target?.url) URL.revokeObjectURL(target.url)
      return prev.filter((item) => item.id !== id)
    })
  }

  return { attachments, add, remove }
}
