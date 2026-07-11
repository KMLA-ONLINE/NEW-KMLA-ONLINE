import { useEffect, useRef } from "react"

import { claimMediaPlayback, releaseMediaPlayback } from "~/components/media/media-playback"
import { cn } from "~/lib/utils"

/**
 * Inline video. Only one player on the page plays at a time, and an audio
 * player counts as one.
 *
 * Deliberately native controls: fullscreen, picture-in-picture, scrubbing,
 * keyboard and captions all come for free, and a hand-rolled set would be worse
 * on every platform. Sizing is the caller's job, exactly as it is for an `img`.
 */
export function VideoPlayer({
  src,
  name,
  poster,
  className,
}: {
  src: string
  name: string
  poster?: string
  className?: string
}) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(
    () => () => {
      const video = videoRef.current

      if (video) {
        video.pause()
        releaseMediaPlayback(video)
      }
    },
    []
  )

  return (
    <video
      ref={videoRef}
      src={src}
      poster={poster}
      aria-label={name}
      controls
      playsInline
      // Enough to paint a first frame and know the duration, without pulling
      // down a whole clip nobody pressed play on.
      preload="metadata"
      onPlay={(event) => claimMediaPlayback(event.currentTarget)}
      className={cn("size-full bg-black object-contain", className)}
    />
  )
}
