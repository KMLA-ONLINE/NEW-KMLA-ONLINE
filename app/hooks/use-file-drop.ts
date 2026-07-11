import type { DragEvent } from "react"
import { useRef, useState } from "react"

// 파일을 끌어다 놓아 첨부하는 드롭 존을 만든다(데스크톱 전용 -- 모바일은 드래그가 없다).
// dragenter/leave가 자식 요소를 넘나들 때마다 발생해 깜빡이므로 depth 카운터로 감싼다.
// 파일 드래그일 때만 반응하고(텍스트 선택 드래그 무시), 드롭하면 onDrop에 FileList를 넘긴다.
export function useFileDrop(onDrop: (files: FileList | null) => void) {
  const [isDragging, setIsDragging] = useState(false)
  const depth = useRef(0)

  const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer.types).includes("Files")

  const reset = () => {
    depth.current = 0
    setIsDragging(false)
  }

  const dropHandlers = {
    onDragEnter: (event: DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      depth.current += 1
      setIsDragging(true)
    },
    onDragOver: (event: DragEvent) => {
      if (!hasFiles(event)) return
      // preventDefault가 없으면 브라우저가 드롭을 파일 열기로 가로챈다.
      event.preventDefault()
    },
    onDragLeave: (event: DragEvent) => {
      if (!hasFiles(event)) return
      depth.current -= 1
      if (depth.current <= 0) reset()
    },
    onDrop: (event: DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      reset()
      onDrop(event.dataTransfer.files)
    },
  }

  return { isDragging, dropHandlers }
}
