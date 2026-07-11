import type { Participant } from "~/lib/messenger/types"

export const CURRENT_USER: Participant = {
  id: "me",
  name: "You",
  initials: "ME",
}

export const DELETED_MESSAGE_LABEL = "삭제된 메시지입니다."

/** Search param holding the attachment id the fullscreen image viewer is showing. */
export const PHOTO_SEARCH_PARAM = "photo"

/** Marks a history entry the app pushed to open the image viewer, not one it was deep-linked to. */
export type PhotoViewerLocationState = { photoViewerPushed: true }

export const PHOTO_VIEWER_LOCATION_STATE: PhotoViewerLocationState = { photoViewerPushed: true }
