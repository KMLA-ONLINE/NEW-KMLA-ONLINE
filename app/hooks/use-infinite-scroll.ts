import { useEffect, useRef } from "react"

// 리스트 맨 아래 sentinel이 뷰포트에 들어오면 onLoadMore를 자동으로 부른다(무한 스크롤).
// enabled가 false면(더 불러올 게 없으면) 관찰하지 않는다. 반환한 ref를 sentinel 요소에 단다.
// rootMargin으로 바닥에 닿기 조금 전에 미리 불러 스크롤이 끊기지 않게 한다.
export function useInfiniteScroll<T extends HTMLElement = HTMLDivElement>(
  onLoadMore: () => void,
  enabled: boolean
) {
  const sentinelRef = useRef<T>(null)
  const onLoadMoreRef = useRef(onLoadMore)

  // 최신 콜백을 ref에 담아 둔다(렌더 단계 쓰기 없이 -- observer를 매 렌더 재생성하지 않으려고).
  useEffect(() => {
    onLoadMoreRef.current = onLoadMore
  })

  useEffect(() => {
    if (!enabled) return
    const node = sentinelRef.current
    if (!node) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onLoadMoreRef.current()
      },
      { rootMargin: "200px" }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [enabled])

  return sentinelRef
}
