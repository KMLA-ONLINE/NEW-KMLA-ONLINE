import * as React from "react"
import { ImageThumb } from "../../atoms/ImageThumb"

export interface ImageGridItem {
  src?: string
  alt?: string
}

export interface ImageGridProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  images: ImageGridItem[]
  onImageClick?: (index: number) => void
}

const getGridClassName = (count: number) => {
  if (count === 1) {
    return "aspect-video overflow-hidden rounded-lg bg-[var(--color-surface-subtle)]"
  }

  if (count === 2) {
    return "grid aspect-[2/1] grid-cols-2 gap-1 overflow-hidden rounded-lg bg-[var(--color-surface-subtle)]"
  }

  if (count < 5) {
    return "grid aspect-[4/3] grid-cols-2 grid-rows-2 gap-1 overflow-hidden rounded-lg bg-[var(--color-surface-subtle)]"
  }

  return "grid aspect-[4/3] grid-cols-6 grid-rows-2 gap-1 overflow-hidden rounded-lg bg-[var(--color-surface-subtle)]"
}

const getTileClassName = (count: number, index: number) => {
  if (count === 3 && index === 0) {
    return "row-span-2"
  }

  if (count >= 5) {
    return index < 2 ? "col-span-3" : "col-span-2"
  }

  return ""
}

const ImageGrid = React.forwardRef<HTMLDivElement, ImageGridProps>(
  ({ images, onImageClick, className, ...props }, ref) => {
    const visibleImages = images.slice(0, 5)
    const overflowCount = Math.max(images.length - visibleImages.length, 0)

    if (visibleImages.length === 0) {
      return null
    }

    return (
      <div
        ref={ref}
        className={`${getGridClassName(visibleImages.length)} ${className ?? ""}`}
        {...props}
      >
        {visibleImages.map((image, index) => {
          const isLastVisible = index === visibleImages.length - 1
          const shouldShowOverflow = overflowCount > 0 && isLastVisible
          const tileClassName = `relative h-full w-full overflow-hidden bg-[var(--color-surface-subtle)] ${getTileClassName(visibleImages.length, index)}`
          const content = (
            <>
              <ImageThumb
                src={image.src}
                alt={image.alt}
                size="full"
                rounded="none"
                className="h-full w-full"
              />
              {shouldShowOverflow && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/60 text-xl font-semibold text-[var(--color-action-foreground)]">
                  +{overflowCount}장
                </span>
              )}
            </>
          )

          if (onImageClick) {
            return (
              <button
                key={`${image.src ?? "image"}-${index}`}
                type="button"
                className={`${tileClassName} focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface-base)] focus-visible:outline-none`}
                onClick={() => onImageClick(index)}
                aria-label={
                  shouldShowOverflow
                    ? `${image.alt ?? `이미지 ${index + 1}`} 외 ${overflowCount}장 더 보기`
                    : (image.alt ?? `이미지 ${index + 1}`)
                }
              >
                {content}
              </button>
            )
          }

          return (
            <div key={`${image.src ?? "image"}-${index}`} className={tileClassName}>
              {content}
            </div>
          )
        })}
      </div>
    )
  }
)
ImageGrid.displayName = "ImageGrid"

export { ImageGrid }
