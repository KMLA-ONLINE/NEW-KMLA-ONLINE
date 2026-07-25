import { useCallback, useEffect, useRef, useState } from "react"

// 리스트 맨 아래 sentinel이 뷰포트에 들어오면 onLoadMore를 자동으로 부른다(무한 스크롤).
// enabled가 false거나 비동기 페이지를 요청 중이면 관찰하지 않는다. pending이 false로 돌아오면
// observer를 다시 연결하므로, 응답이 짧아 sentinel이 계속 보이는 경우 다음 페이지도 이어서 부른다.
// 반환한 콜백 ref를 sentinel 요소에 단다 -- 콜백 ref라 탭 전환처럼 노드가 나중에 붙거나 사라져도
// 관찰을 다시 건다. rootMargin으로 바닥에 닿기 조금 전에 미리 불러 스크롤이 끊기지 않게 한다.
// 중간 스크롤 컨테이너의 clip은 IntersectionObserver가 반영하므로 패널 내부에서도 동작한다.
export function useInfiniteScroll(
  onLoadMore: () => void,
  { enabled, pending = false }: { enabled: boolean; pending?: boolean }
) {
  const onLoadMoreRef = useRef(onLoadMore)
  const triggeredRef = useRef(false)
  // 최신 콜백을 ref에 담아 둔다(렌더 단계 쓰기 없이 -- observer를 매 렌더 재생성하지 않으려고).
  useEffect(() => {
    onLoadMoreRef.current = onLoadMore
  })

  const [node, setNode] = useState<HTMLElement | null>(null)
  const sentinelRef = useCallback((element: HTMLElement | null) => {
    setNode(element)
  }, [])

  useEffect(() => {
    if (!enabled || pending || !node) return
    triggeredRef.current = false
    const observer = new IntersectionObserver(
      (entries) => {
        const isIntersecting = entries.some((entry) => entry.isIntersecting)
        if (!isIntersecting) {
          triggeredRef.current = false
          return
        }
        // pending 상태가 렌더에 반영되기 전에 observer가 다시 전달돼도 요청은 한 번만 시작한다.
        if (triggeredRef.current) return
        triggeredRef.current = true
        onLoadMoreRef.current()
      },
      { rootMargin: "200px" }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [enabled, node, pending])

  return sentinelRef
}
