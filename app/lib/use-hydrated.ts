import { useSyncExternalStore } from "react"

/**
 * 서버 렌더와 하이드레이션 중에는 false, 하이드레이션이 끝난 뒤에만 true.
 *
 * 비밀번호 폼의 제출 버튼을 이걸로 잠근다. login/signup은 폼을 SSR HTML에 바로 그리는데,
 * 하이드레이션 전에 폼이 제출되면(느린 망, 번들 지연, 비밀번호 관리자의 자동 제출, 또는 운영자가
 * 표적에게 JS를 일부러 늦추는 경우) 브라우저 기본 동작이 현재 URL로 GET을 쏴 **비밀번호가 쿼리
 * 파라미터로 우리 서버에 흘러간다** -- 접근 로그·Referer·히스토리에 남고, 거기서 encKey가 유도된다.
 * E2EE가 막으려는 바로 그 유출이다. onSubmit의 preventDefault는 하이드레이션 후에만 걸리므로,
 * 그 전까지 버튼을 꺼 네이티브 제출(클릭·Enter) 자체를 불가능하게 한다. JS가 아예 없으면 애초에
 * 로그인이 불가능하니(Argon2id·키 유도가 전부 클라이언트) 버튼이 꺼진 채 남는 것이 옳다.
 *
 * useEffect에서 setState하는 흔한 패턴 대신 useSyncExternalStore를 쓴다: 렌더 중 setState 경고를
 * 피하고, SSR과 하이드레이션에서 서버 스냅샷(false)을 정확히 매칭해 하이드레이션 불일치가 없다.
 */
const subscribe = () => () => {}

export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  )
}
