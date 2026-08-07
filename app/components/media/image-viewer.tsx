import {
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type PointerEvent as ReactPointerEvent,
} from "react"
import { ChevronLeftIcon, ChevronRightIcon, DownloadIcon, XIcon } from "lucide-react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { cn } from "~/lib/utils"

export type ViewerImage = {
  id: string
  src: string
  /** Used as the alt text, the header label and the download file name. */
  name: string
}

const CONTROL_CLASS =
  "flex size-10 shrink-0 items-center justify-center rounded-full text-white/80 transition hover:bg-white/15 hover:text-white focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-0"

const SLIDE_TRANSITION = "transform 200ms cubic-bezier(0.22, 0.61, 0.36, 1)"
const SWIPE_MAX_TRIGGER_DISTANCE = 80
const SWIPE_TRIGGER_RATIO = 0.2
const SWIPE_RUBBER_BAND = 0.25
const DRAG_CLICK_TOLERANCE = 6

function ControlButton({ className, ...props }: ComponentProps<"button">) {
  return <button type="button" className={cn(CONTROL_CLASS, className)} {...props} />
}

function Slide({ image, onBackdropClick }: { image?: ViewerImage; onBackdropClick: () => void }) {
  return (
    <div
      className="flex h-full w-full shrink-0 items-center justify-center px-2 sm:px-4"
      onClick={onBackdropClick}
    >
      {image ? (
        <img
          src={image.src}
          alt={image.name}
          draggable={false}
          className="max-h-full max-w-full object-contain select-none"
          onClick={(event) => event.stopPropagation()}
        />
      ) : null}
    </div>
  )
}

function Filmstrip({
  images,
  activeIndex,
  onSelect,
}: {
  images: ViewerImage[]
  activeIndex: number
  onSelect: (index: number) => void
}) {
  const activeThumbnailRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    activeThumbnailRef.current?.scrollIntoView({ block: "nearest", inline: "center" })
  }, [activeIndex])

  return (
    <div className="shrink-0 scrollbar-none overflow-x-auto">
      <div className="mx-auto flex w-max gap-2 px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        {images.map((image, index) => {
          const isActive = index === activeIndex

          return (
            <button
              key={image.id}
              ref={isActive ? activeThumbnailRef : undefined}
              type="button"
              aria-label={image.name}
              aria-current={isActive}
              onClick={() => onSelect(index)}
              className={cn(
                "size-14 shrink-0 overflow-hidden rounded-lg ring-2 transition focus-visible:ring-white focus-visible:outline-none",
                isActive ? "opacity-100 ring-white" : "opacity-50 ring-transparent hover:opacity-90"
              )}
            >
              <img src={image.src} alt="" draggable={false} className="size-full object-cover" />
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Fullscreen image viewer.
 *
 * `openImageId` says whether the viewer is open, and which image it opened on.
 * It is deliberately not a controlled "current image": once open, the viewer
 * owns which slide is showing. Feeding every step back through the caller --
 * through a router, say -- puts an async round trip in the middle of a drag
 * gesture, and a late-arriving prop then fights the finger.
 *
 * So the caller only has to answer "opened, on what?" and handle `onClose`.
 */
export function ImageViewer({
  images,
  openImageId,
  onClose,
}: {
  images: ViewerImage[]
  openImageId: string | null
  onClose: () => void
}) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const dragStartRef = useRef<number | null>(null)
  const dragBaseRef = useRef(0)
  const hasDraggedRef = useRef(false)
  // pointermove is a continuous event, so its setState can still be pending
  // when pointerup arrives. The ref is what the release threshold reads.
  const offsetRef = useRef(0)

  const [storedIndex, setStoredIndex] = useState(0)
  const [offset, setOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [renderedOpenImageId, setRenderedOpenImageId] = useState<string | null>(null)

  // Desktop: arrow keys page through. A window listener rather than the
  // Content's onKeyDown, so it fires regardless of what holds focus -- including
  // when the viewer opens on top of another dialog and focus never lands here.
  useEffect(() => {
    if (openImageId === null) {
      return
    }

    const handleArrowKey = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
        return
      }

      event.preventDefault()
      offsetRef.current = 0
      setOffset(0)
      setStoredIndex((current) => {
        const clamped = Math.max(0, Math.min(current, images.length - 1))
        const next = event.key === "ArrowLeft" ? clamped - 1 : clamped + 1
        return Math.max(0, Math.min(next, images.length - 1))
      })
    }

    window.addEventListener("keydown", handleArrowKey)
    return () => window.removeEventListener("keydown", handleArrowKey)
  }, [openImageId, images.length])

  // A fresh open: jump to the image it was opened on. Nothing else moves the
  // index from the outside. `offsetRef` is left alone -- it only carries a value
  // between pointerdown and pointerup, and pointerdown seeds it.
  if (renderedOpenImageId !== openImageId) {
    setRenderedOpenImageId(openImageId)
    setStoredIndex(
      Math.max(
        0,
        images.findIndex((image) => image.id === openImageId)
      )
    )
    setOffset(0)
  }

  // Messages can gain or lose attachments while the viewer is open.
  const index = Math.max(0, Math.min(storedIndex, images.length - 1))
  const activeImage = images[index]

  if (!openImageId || !activeImage) {
    return null
  }

  const getViewportWidth = () => viewportRef.current?.clientWidth ?? 0

  const setDragOffset = (value: number) => {
    offsetRef.current = value
    setOffset(value)
  }

  const goTo = (nextIndex: number) => {
    setDragOffset(0)

    if (nextIndex >= 0 && nextIndex < images.length) {
      setStoredIndex(nextIndex)
    }
  }

  /**
   * Where the track actually sits right now, as an offset from the resting
   * place of the current index. Non-zero while a slide animation is still
   * running, and picking the drag up from there is what stops it jumping.
   */
  const readRenderedOffset = () => {
    const track = trackRef.current
    const viewportWidth = getViewportWidth()

    if (!track || viewportWidth === 0) {
      return 0
    }

    // DOMMatrix cannot parse the "none" an untransformed element resolves to,
    // and such an element is already at rest anyway.
    const renderedTransform = getComputedStyle(track).transform

    if (renderedTransform === "none") {
      return 0
    }

    const { m41: renderedTranslateX } = new DOMMatrix(renderedTransform)
    return renderedTranslateX + index * viewportWidth
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    // Never drag off a control, and never off a mouse: the arrows are the mouse
    // affordance. Touch pointers get implicit capture from the browser, so
    // setPointerCapture is not needed here -- and calling it would retarget the
    // follow-up click to this element, breaking tap-to-close and tap-on-arrow.
    if (event.pointerType === "mouse" || (event.target as HTMLElement).closest("button, a")) {
      return
    }

    const grabbedOffset = readRenderedOffset()

    dragStartRef.current = event.clientX
    dragBaseRef.current = grabbedOffset
    hasDraggedRef.current = false
    setDragOffset(grabbedOffset)
    setIsDragging(true)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dragStart = dragStartRef.current

    if (dragStart === null) {
      return
    }

    const distance = event.clientX - dragStart

    if (Math.abs(distance) > DRAG_CLICK_TOLERANCE) {
      hasDraggedRef.current = true
    }

    const viewportWidth = getViewportWidth()
    // Resting offsets of the first and the last slide, relative to this index.
    const firstSlideOffset = index * viewportWidth
    const lastSlideOffset = (index - (images.length - 1)) * viewportWidth
    const draggedOffset = dragBaseRef.current + distance

    if (draggedOffset > firstSlideOffset) {
      setDragOffset(firstSlideOffset + (draggedOffset - firstSlideOffset) * SWIPE_RUBBER_BAND)
      return
    }

    if (draggedOffset < lastSlideOffset) {
      setDragOffset(lastSlideOffset + (draggedOffset - lastSlideOffset) * SWIPE_RUBBER_BAND)
      return
    }

    setDragOffset(draggedOffset)
  }

  const handlePointerUp = () => {
    if (dragStartRef.current === null) {
      return
    }

    dragStartRef.current = null
    setIsDragging(false)

    const viewportWidth = getViewportWidth()

    if (viewportWidth === 0) {
      setDragOffset(0)
      return
    }

    const releasedOffset = offsetRef.current
    const draggedDistance = releasedOffset - dragBaseRef.current
    const triggerDistance = Math.min(
      SWIPE_MAX_TRIGGER_DISTANCE,
      viewportWidth * SWIPE_TRIGGER_RATIO
    )
    // Where the track sits, measured in slides. Snap to the nearest one, unless
    // the finger travelled far enough to mean the next one along.
    const position = index - releasedOffset / viewportWidth
    const target =
      Math.abs(draggedDistance) < triggerDistance
        ? Math.round(position)
        : draggedDistance < 0
          ? Math.ceil(position)
          : Math.floor(position)

    goTo(Math.min(images.length - 1, Math.max(0, target)))
  }

  // A swipe ends with a click on whatever was under the finger. Do not read it
  // as a tap on the backdrop.
  const handleBackdropClick = () => {
    if (hasDraggedRef.current) {
      hasDraggedRef.current = false
      return
    }

    onClose()
  }

  return (
    <DialogPrimitive.Root
      open={true}
      onOpenChange={(open) => {
        if (!open) {
          onClose()
        }
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="data-open:animate-in data-open:fade-in-0 fixed inset-0 z-50 bg-black/95 duration-150" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          // Don't auto-focus a control on open: it parks a focus ring on the
          // close/download button. Arrows run off a window listener and Esc off
          // Radix, so nothing here needs focus.
          onOpenAutoFocus={(event) => event.preventDefault()}
          className="data-open:animate-in data-open:fade-in-0 fixed inset-0 z-50 flex flex-col duration-150 focus:outline-none"
        >
          <DialogPrimitive.Title className="sr-only">{activeImage.name}</DialogPrimitive.Title>

          <header className="flex shrink-0 items-center gap-2 pt-[max(0.5rem,env(safe-area-inset-top))] pr-[max(0.5rem,env(safe-area-inset-right))] pb-2 pl-[max(0.5rem,env(safe-area-inset-left))] md:p-3">
            <div className="min-w-0 flex-1 px-2">
              <p className="truncate text-sm text-white">{activeImage.name}</p>
              {images.length > 1 ? (
                <p className="text-xs text-white/60">
                  {index + 1} / {images.length}
                </p>
              ) : null}
            </div>
            <a
              href={activeImage.src}
              download={activeImage.name}
              aria-label="다운로드"
              className={CONTROL_CLASS}
            >
              <DownloadIcon className="size-5" />
            </a>
            <DialogPrimitive.Close asChild>
              <ControlButton aria-label="닫기">
                <XIcon className="size-5" />
              </ControlButton>
            </DialogPrimitive.Close>
          </header>

          <div
            ref={viewportRef}
            className="relative min-h-0 flex-1 touch-pan-y overflow-hidden"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <div
              ref={trackRef}
              className="flex h-full w-full"
              style={{
                transform: `translateX(calc(${-index * 100}% + ${offset}px))`,
                transition: isDragging ? "none" : SLIDE_TRANSITION,
              }}
            >
              {images.map((image, slideIndex) => (
                <Slide
                  key={image.id}
                  // Decode the neighbours only. The empty slots keep the track's
                  // geometry, so the transform stays a plain multiple of 100%.
                  image={Math.abs(slideIndex - index) <= 1 ? image : undefined}
                  onBackdropClick={handleBackdropClick}
                />
              ))}
            </div>

            {/* Touch devices swipe instead, where arrows would only cover the image. */}
            <div className="absolute inset-y-0 left-2 hidden items-center sm:left-4 sm:flex">
              <ControlButton
                aria-label="이전 이미지"
                disabled={index === 0}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => goTo(index - 1)}
                className="bg-black/40 backdrop-blur-xs"
              >
                <ChevronLeftIcon className="size-6" />
              </ControlButton>
            </div>
            <div className="absolute inset-y-0 right-2 hidden items-center sm:right-4 sm:flex">
              <ControlButton
                aria-label="다음 이미지"
                disabled={index === images.length - 1}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => goTo(index + 1)}
                className="bg-black/40 backdrop-blur-xs"
              >
                <ChevronRightIcon className="size-6" />
              </ControlButton>
            </div>
          </div>

          {images.length > 1 ? (
            <Filmstrip images={images} activeIndex={index} onSelect={goTo} />
          ) : (
            // Reserve the filmstrip's height (size-14 thumb + py-3) even with one
            // image, so the image area doesn't stretch to fill the extra space.
            <div
              className="h-[calc(2.5rem+env(safe-area-inset-bottom))] shrink-0"
              aria-hidden="true"
            />
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
