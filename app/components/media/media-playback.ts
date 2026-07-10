/**
 * Whichever `<audio>` or `<video>` is playing, page-wide. Only ever assigned
 * from a `play` event handler, so it stays null on the server and never leaks
 * between requests, and callers get exclusive playback without wiring up a
 * provider around every list of media.
 */
let activeMedia: HTMLMediaElement | null = null

/** Pauses whatever else was playing. Call from the element's `play` handler. */
export function claimMediaPlayback(element: HTMLMediaElement) {
  if (activeMedia && activeMedia !== element) {
    activeMedia.pause()
  }

  activeMedia = element
}

/** Call when the element goes away, so a detached node is never paused later. */
export function releaseMediaPlayback(element: HTMLMediaElement | null) {
  if (element && activeMedia === element) {
    activeMedia = null
  }
}
