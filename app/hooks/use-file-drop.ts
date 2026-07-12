import type { DragEvent } from "react"
import { useEffect, useRef, useState } from "react"

// 파일을 끌어다 놓아 첨부하는 드롭 존을 만든다(데스크톱 전용 -- 모바일은 드래그가 없다).
// dragenter/leave가 자식 요소를 넘나들 때마다 발생해 깜빡이므로 depth 카운터로 감싼다.
// 드롭하면 onDrop에 FileList를 넘긴다.
export function useFileDrop(onDrop: (files: FileList | null) => void) {
  const [isDragging, setIsDragging] = useState(false)
  const depth = useRef(0)
  // 페이지 내부 요소(예: 채팅 속 이미지)를 드래그하면 브라우저가 그 이미지를 dataTransfer의
  // "Files"로도 실어 보내, 파일 존재 여부만으로는 외부 파일 드롭과 구분되지 않는다. 우리
  // 문서에서 시작된 드래그(internal)는 dragstart가 뜨므로 그 동안엔 드롭 존을 끈다.
  // 외부 OS 파일 드래그는 문서에서 dragstart를 쏘지 않는다.
  const internalDrag = useRef(false)

  useEffect(() => {
    const onDragStart = () => {
      internalDrag.current = true
    }
    const onDragEnd = () => {
      internalDrag.current = false
    }
    document.addEventListener("dragstart", onDragStart, true)
    document.addEventListener("dragend", onDragEnd, true)
    return () => {
      document.removeEventListener("dragstart", onDragStart, true)
      document.removeEventListener("dragend", onDragEnd, true)
    }
  }, [])

  // 외부에서 끌어온 파일 드래그일 때만 참(내부 요소 드래그·텍스트 선택 드래그는 무시).
  const isExternalFileDrag = (event: DragEvent) =>
    !internalDrag.current && Array.from(event.dataTransfer.types).includes("Files")

  const reset = () => {
    depth.current = 0
    setIsDragging(false)
  }

  const dropHandlers = {
    onDragEnter: (event: DragEvent) => {
      if (!isExternalFileDrag(event)) return
      event.preventDefault()
      depth.current += 1
      setIsDragging(true)
    },
    onDragOver: (event: DragEvent) => {
      if (!isExternalFileDrag(event)) return
      // preventDefault가 없으면 브라우저가 드롭을 파일 열기로 가로챈다.
      event.preventDefault()
    },
    onDragLeave: (event: DragEvent) => {
      if (!isExternalFileDrag(event)) return
      depth.current -= 1
      if (depth.current <= 0) reset()
    },
    onDrop: (event: DragEvent) => {
      if (!isExternalFileDrag(event)) return
      event.preventDefault()
      reset()
      onDrop(event.dataTransfer.files)
    },
  }

  return { isDragging, dropHandlers }
}
