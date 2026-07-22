import { useEffect, useRef, useState } from "react"

export function useImageCrop(opts: { onCropped: (file: File) => void }) {
  const [pending, setPending] = useState<{ file: File; url: string } | null>(null)
  const pendingRef = useRef<typeof pending>(null)

  const revokePending = () => {
    if (pendingRef.current) URL.revokeObjectURL(pendingRef.current.url)
    pendingRef.current = null
  }

  useEffect(() => () => revokePending(), [])

  const clear = () => {
    revokePending()
    setPending(null)
  }

  return {
    start: (file: File) => {
      revokePending()
      const next = { file, url: URL.createObjectURL(file) }
      pendingRef.current = next
      setPending(next)
    },
    cropperProps: pending
      ? {
          file: pending.file,
          previewUrl: pending.url,
          onCancel: clear,
          onComplete: (cropped: File) => {
            clear()
            opts.onCropped(cropped)
          },
        }
      : null,
  }
}
