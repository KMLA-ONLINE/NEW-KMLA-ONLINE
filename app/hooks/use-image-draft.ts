import { useEffect, useRef, useState } from "react"

// 로컬 미리보기 object URL은 교체·초기화·unmount 때 해제한다.
export function useImageDraft(initial: string | null, resetKey?: string | number) {
  const [url, setUrl] = useState(initial)
  const objectUrlRef = useRef(initial?.startsWith("blob:") ? initial : null)

  useEffect(
    () => () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    },
    []
  )

  useEffect(() => {
    setUrl((current) => {
      if (current === initial) return current
      if (current?.startsWith("blob:")) URL.revokeObjectURL(current)
      objectUrlRef.current = initial?.startsWith("blob:") ? initial : null
      return initial
    })
  }, [initial, resetKey])

  const replace = (next: string | null) =>
    setUrl((current) => {
      if (current?.startsWith("blob:")) URL.revokeObjectURL(current)
      objectUrlRef.current = next?.startsWith("blob:") ? next : null
      return next
    })

  return [url, replace] as const
}
