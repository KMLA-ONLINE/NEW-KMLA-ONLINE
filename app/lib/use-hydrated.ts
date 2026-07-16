import { useSyncExternalStore } from "react"

/**
 * 첫 렌더(빌드 프리렌더·하이드레이션)에는 false, 마운트가 끝난 뒤에만 true.
 *
 * 브라우저에만 있는 상태(localStorage의 테마 등)에 기대는 UI가 첫 렌더에 그것을 반영하면
 * 프리렌더된 root 셸의 마크업과 어긋난다. 그래서 마운트 전까지는 "아직 모른다"로 두는
 * 게이트로 쓴다 -- 지금 소비자는 ThemeSelect다.
 *
 * useEffect에서 setState하는 흔한 패턴 대신 useSyncExternalStore를 쓴다: 렌더 중 setState 경고를
 * 피하고, 프리렌더/하이드레이션에서 서버 스냅샷(false)을 정확히 매칭해 불일치가 없다.
 */
const subscribe = () => () => {}

export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  )
}
