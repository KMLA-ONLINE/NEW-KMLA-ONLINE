import { useCallback, useEffect, useRef, useState } from "react"

// 리스트 맨 아래 sentinel이 뷰포트에 들어오면 onLoadMore를 자동으로 부른다(무한 스크롤).
// enabled가 false면(더 불러올 게 없으면) 관찰하지 않는다. 반환한 콜백 ref를 sentinel 요소에
// 단다 -- 콜백 ref라 탭 전환처럼 노드가 나중에 붙거나 사라져도 관찰을 다시 건다. rootMargin
// 으로 바닥에 닿기 조금 전에 미리 불러 스크롤이 끊기지 않게 한다. 중간 스크롤 컨테이너의
// clip은 IntersectionObserver가 반영하므로 메신저 패널 내부 스크롤에서도 동작한다.
export function useInfiniteScroll(onLoadMore: () => void, enabled: boolean) {
  const onLoadMoreRef = useRef(onLoadMore)
  // 최신 콜백을 ref에 담아 둔다(렌더 단계 쓰기 없이 -- observer를 매 렌더 재생성하지 않으려고).
  useEffect(() => {
    onLoadMoreRef.current = onLoadMore
  })

  const [node, setNode] = useState<HTMLElement | null>(null)
  const sentinelRef = useCallback((element: HTMLElement | null) => {
    setNode(element)
  }, [])

  useEffect(() => {
    if (!enabled || !node) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onLoadMoreRef.current()
      },
      { rootMargin: "200px" }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [enabled, node])

  return sentinelRef
}
