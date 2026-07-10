import { useEffect, useRef, useState, type SyntheticEvent } from "react"
import { PauseIcon, PlayIcon } from "lucide-react"

import { claimMediaPlayback, releaseMediaPlayback } from "~/components/media/media-playback"
import { cn } from "~/lib/utils"

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00"
  }

  const total = Math.floor(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const remainingSeconds = total % 60
  const paddedSeconds = String(remainingSeconds).padStart(2, "0")

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${paddedSeconds}`
  }

  return `${minutes}:${paddedSeconds}`
}

/**
 * Inline audio player. Only one player on the page plays at a time. Pass
 * `durationSeconds` when it is already known so the total time renders before
 * metadata arrives and the layout does not shift.
 */
export function AudioPlayer({
  src,
  name,
  durationSeconds,
  className,
}: {
  src: string
  name: string
  durationSeconds?: number
  className?: string
}) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [loadedDuration, setLoadedDuration] = useState<number | null>(null)

  const duration = loadedDuration ?? durationSeconds ?? 0
  const isSeekable = duration > 0
  const progress = isSeekable ? Math.min(currentTime / duration, 1) * 100 : 0

  useEffect(
    () => () => {
      const audio = audioRef.current

      if (audio) {
        audio.pause()
        releaseMediaPlayback(audio)
      }
    },
    []
  )

  const togglePlayback = () => {
    const audio = audioRef.current

    if (!audio) {
      return
    }

    if (audio.paused) {
      void audio.play().catch(() => setIsPlaying(false))
      return
    }

    audio.pause()
  }

  const handlePlay = (event: SyntheticEvent<HTMLAudioElement>) => {
    claimMediaPlayback(event.currentTarget)
    setIsPlaying(true)
  }

  const handleLoadedMetadata = (event: SyntheticEvent<HTMLAudioElement>) => {
    const value = event.currentTarget.duration

    // Streamed audio of unknown length reports Infinity; keep the hint instead.
    if (Number.isFinite(value) && value > 0) {
      setLoadedDuration(value)
    }
  }

  const seek = (value: number) => {
    const audio = audioRef.current

    if (audio) {
      audio.currentTime = value
    }

    setCurrentTime(value)
  }

  return (
    <div
      className={cn(
        "bg-muted text-foreground flex w-64 max-w-full items-center gap-3 rounded-2xl px-3 py-2",
        className
      )}
    >
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onPlay={handlePlay}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false)
          setCurrentTime(0)
        }}
      />

      <button
        type="button"
        aria-label={isPlaying ? `${name} 일시정지` : `${name} 재생`}
        onClick={togglePlayback}
        className="bg-background focus-visible:ring-ring flex size-9 shrink-0 items-center justify-center rounded-full border transition hover:opacity-80 focus-visible:ring-2 focus-visible:outline-none"
      >
        {isPlaying ? <PauseIcon className="size-4" /> : <PlayIcon className="size-4" />}
      </button>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px]">{name}</p>

        <input
          type="range"
          min={0}
          max={isSeekable ? duration : 1}
          step={0.01}
          value={isSeekable ? Math.min(currentTime, duration) : 0}
          disabled={!isSeekable}
          aria-label={`${name} 재생 위치`}
          aria-valuetext={`${formatTime(currentTime)} / ${formatTime(duration)}`}
          onChange={(event) => seek(Number(event.currentTarget.value))}
          style={{
            backgroundImage: `linear-gradient(to right, currentColor ${progress}%, transparent ${progress}%)`,
          }}
          className={cn(
            "mt-1.5 h-1 w-full appearance-none rounded-full bg-current/20 disabled:opacity-50",
            "[&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-current",
            "[&::-moz-range-thumb]:size-3 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-current",
            isSeekable && "cursor-pointer"
          )}
        />

        <div className="text-muted-foreground mt-1 flex justify-between text-[11px] tabular-nums">
          <span>{formatTime(currentTime)}</span>
          <span>{isSeekable ? formatTime(duration) : "--:--"}</span>
        </div>
      </div>
    </div>
  )
}
