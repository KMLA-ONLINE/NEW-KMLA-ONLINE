import { ImageIcon } from "lucide-react"

import { cn } from "~/lib/utils"
import type { ImageAttachment } from "~/lib/messenger/types"

function MockImage({ title, subtitle, className }: ImageAttachment & { className?: string }) {
  return (
    <div
      role="img"
      aria-label={`${title}${subtitle ? `: ${subtitle}` : ""}`}
      className={cn("bg-muted w-72 max-w-full overflow-hidden rounded-3xl border", className)}
    >
      <div className="grid h-44 grid-cols-[1.3fr_0.7fr] gap-1 p-1">
        <div className="bg-primary/20 flex items-center justify-center rounded-2xl">
          <ImageIcon className="text-primary" />
        </div>
        <div className="grid gap-1">
          <div className="bg-background rounded-2xl" />
          <div className="bg-primary/15 rounded-2xl" />
        </div>
      </div>
      <div className="bg-background/90 border-t px-4 py-3">
        <p className="text-primary text-sm font-medium">{title}</p>
        {subtitle ? <p className="text-muted-foreground text-xs">{subtitle}</p> : null}
      </div>
    </div>
  )
}

export function MessageImage({ image, className }: { image: ImageAttachment; className?: string }) {
  if (!image.src) {
    return <MockImage {...image} className={className} />
  }

  return (
    <figure
      className={cn(
        "bg-muted w-72 max-w-[14rem] overflow-hidden rounded-3xl border sm:max-w-[16rem]",
        className
      )}
    >
      <img src={image.src} alt={image.title} className="max-h-72 w-full object-cover" />
      <figcaption className="bg-background/90 border-t px-4 py-3">
        <p className="text-sm font-medium">{image.title}</p>
        {image.subtitle ? <p className="text-muted-foreground text-xs">{image.subtitle}</p> : null}
      </figcaption>
    </figure>
  )
}
