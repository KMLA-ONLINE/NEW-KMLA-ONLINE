import { useLayoutEffect, useRef, useState, type PointerEvent } from "react"
import { Loader2Icon, MinusIcon, PlusIcon, XIcon } from "lucide-react"

import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { coverCropRect, coverFit, cropImage, fitOutputSize } from "~/lib/image/crop"
import { cn } from "~/lib/utils"

const MAX_ZOOM = 4

export function ImageCropper({
  file,
  previewUrl,
  aspect,
  maxOutputEdge,
  round = false,
  title = "사진 편집",
  onCancel,
  onComplete,
}: {
  file: File
  previewUrl: string
  aspect: number
  maxOutputEdge: number
  round?: boolean
  title?: string
  onCancel: () => void
  onComplete: (cropped: File) => void
}) {
  const [image, setImage] = useState<{ width: number; height: number } | null>(null)
  const [frameElement, setFrameElement] = useState<HTMLDivElement | null>(null)
  const [frame, setFrame] = useState<{ width: number; height: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    baseX: number
    baseY: number
  } | null>(null)

  useLayoutEffect(() => {
    if (!frameElement) return
    const measure = () => {
      const { clientWidth: width, clientHeight: height } = frameElement
      if (width === 0 || height === 0) return
      setFrame((current) =>
        current?.width === width && current.height === height ? current : { width, height }
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(frameElement)
    return () => observer.disconnect()
  }, [frameElement])

  const ready = image !== null && frame !== null

  const applyTransform = (nextZoom: number, nextOffset: { x: number; y: number }) => {
    const z = Math.min(MAX_ZOOM, Math.max(1, nextZoom))
    if (!image || !frame) {
      setZoom(z)
      setOffset(nextOffset)
      return
    }
    const { maxOffsetX, maxOffsetY } = coverFit({
      imageWidth: image.width,
      imageHeight: image.height,
      frameWidth: frame.width,
      frameHeight: frame.height,
      zoom: z,
    })
    setZoom(z)
    setOffset({
      x: Math.min(maxOffsetX, Math.max(-maxOffsetX, nextOffset.x)),
      y: Math.min(maxOffsetY, Math.max(-maxOffsetY, nextOffset.y)),
    })
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (busy || !ready) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      baseX: offset.x,
      baseY: offset.y,
    }
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    applyTransform(zoom, {
      x: drag.baseX + (event.clientX - drag.startX),
      y: drag.baseY + (event.clientY - drag.startY),
    })
  }

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
  }

  const onApply = async () => {
    if (!image || !frame || busy) return
    setBusy(true)
    setError(false)
    try {
      const rect = coverCropRect({
        imageWidth: image.width,
        imageHeight: image.height,
        frameWidth: frame.width,
        frameHeight: frame.height,
        zoom,
        offsetX: offset.x,
        offsetY: offset.y,
      })
      const cropped = await cropImage(file, rect, fitOutputSize(rect, maxOutputEdge))
      onComplete(cropped)
    } catch (cause) {
      console.error("[ImageCropper] 크롭 실패", { name: file.name, type: file.type }, cause)
      setError(true)
      setBusy(false)
    }
  }

  const fit =
    image && frame
      ? coverFit({
          imageWidth: image.width,
          imageHeight: image.height,
          frameWidth: frame.width,
          frameHeight: frame.height,
          zoom,
        })
      : null

  const imageStyle =
    image && frame && fit
      ? {
          width: image.width * fit.dispScale,
          height: image.height * fit.dispScale,
          left: (frame.width - image.width * fit.dispScale) / 2 + offset.x,
          top: (frame.height - image.height * fit.dispScale) / 2 + offset.y,
        }
      : undefined

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onCancel()}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[90svh] flex-col gap-0 overflow-hidden p-0 max-sm:top-0 max-sm:left-0 max-sm:h-svh max-sm:max-h-svh max-sm:max-w-full max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:border-0 sm:max-w-lg"
      >
        <DialogHeader className="flex-row items-center gap-2 border-b p-3 text-left">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onCancel}
            disabled={busy}
            aria-label="취소"
          >
            <XIcon />
          </Button>
          <DialogTitle className="flex-1 text-base">{title}</DialogTitle>
          <DialogDescription className="sr-only">
            드래그로 위치를, 슬라이더로 확대를 맞춘 뒤 적용합니다.
          </DialogDescription>
          <Button size="sm" onClick={onApply} disabled={busy || !ready || error}>
            {busy ? <Loader2Icon className="size-4 animate-spin" aria-hidden="true" /> : null}
            적용
          </Button>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          <div className="bg-muted mx-auto w-full max-w-sm overflow-hidden rounded-lg">
            <div
              ref={setFrameElement}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              style={{ aspectRatio: String(aspect) }}
              className="relative w-full touch-none overflow-hidden select-none"
              role="group"
              aria-label="크롭 영역 — 드래그해 위치 조정"
            >
              <img
                src={previewUrl}
                alt=""
                draggable={false}
                onLoad={(event) => {
                  const { naturalWidth: width, naturalHeight: height } = event.currentTarget
                  if (width === 0 || height === 0) {
                    setError(true)
                    return
                  }
                  setImage({ width, height })
                }}
                onError={() => {
                  console.error("[ImageCropper] 미리보기 로드 실패", {
                    name: file.name,
                    type: file.type,
                    size: file.size,
                  })
                  setError(true)
                }}
                style={imageStyle}
                className={cn(
                  "pointer-events-none absolute max-w-none",
                  imageStyle ? "visible" : "invisible"
                )}
              />

              {!ready && !error ? (
                <div className="text-muted-foreground absolute inset-0 grid place-items-center text-sm">
                  <Loader2Icon className="size-5 animate-spin" aria-label="이미지 불러오는 중" />
                </div>
              ) : null}

              {round ? (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 rounded-full"
                  style={{ boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)" }}
                />
              ) : null}
            </div>
          </div>

          <div className="mx-auto flex w-full max-w-sm items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => applyTransform(zoom - 0.2, offset)}
              disabled={busy || !ready || zoom <= 1}
              aria-label="축소"
            >
              <MinusIcon className="size-4" aria-hidden="true" />
            </Button>
            <input
              type="range"
              min={1}
              max={MAX_ZOOM}
              step={0.01}
              value={zoom}
              onChange={(event) => applyTransform(Number(event.target.value), offset)}
              disabled={busy || !ready}
              aria-label="확대"
              className="accent-primary h-1 flex-1 cursor-pointer"
            />
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => applyTransform(zoom + 0.2, offset)}
              disabled={busy || !ready || zoom >= MAX_ZOOM}
              aria-label="확대"
            >
              <PlusIcon className="size-4" aria-hidden="true" />
            </Button>
          </div>

          {error ? (
            <p role="alert" className="text-destructive text-center text-xs">
              이미지를 처리하지 못했습니다. 다른 파일로 다시 시도해 주세요.
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
