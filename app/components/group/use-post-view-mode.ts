import * as React from "react"

export type PostViewMode = "card" | "list"

const STORAGE_KEY = "kmla:post-view-mode"
const DEFAULT_MODE: PostViewMode = "card"
// Same-tab writes don't fire the native "storage" event, so we broadcast our own.
const CHANGE_EVENT = "kmla:post-view-mode-change"

function isPostViewMode(value: string | null): value is PostViewMode {
  return value === "card" || value === "list"
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange)
  window.addEventListener(CHANGE_EVENT, onChange)
  return () => {
    window.removeEventListener("storage", onChange)
    window.removeEventListener(CHANGE_EVENT, onChange)
  }
}

function getSnapshot(): PostViewMode {
  const stored = window.localStorage.getItem(STORAGE_KEY)
  return isPostViewMode(stored) ? stored : DEFAULT_MODE
}

function getServerSnapshot(): PostViewMode {
  return DEFAULT_MODE
}

// 페북식 카드가 기본, "list"는 제목만 훑고 눌러 들어가는 레딧식 목록. 어느 렌즈를
// 선호하는지는 화면 취향(브라우저별)이라 DB가 아니라 localStorage에 둔다.
// useSyncExternalStore가 SSR·첫 렌더를 DEFAULT_MODE로 두고 하이드레이션 때 저장값으로
// 교체 -- 로드 시 한 프레임 깜빡임은 이 취향을 백엔드에 안 두는 대가로 감수한다.
export function usePostViewMode() {
  const mode = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const setPostViewMode = React.useCallback((next: PostViewMode) => {
    window.localStorage.setItem(STORAGE_KEY, next)
    window.dispatchEvent(new Event(CHANGE_EVENT))
  }, [])

  return [mode, setPostViewMode] as const
}
