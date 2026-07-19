import { useCallback, useRef } from "react"
import { useBlocker, type BlockerFunction } from "react-router"

// X·Esc·바깥 클릭으로 close()를 부르는 것도, 브라우저 뒤로가기도, 결국 이 라우트를 벗어나는
// navigate()다(close()는 navigate(-1)/navigate(fallback)일 뿐이다). useBlocker가 그 navigate()
// 자체를 가로채므로, 세 가지 진입 경로를 따로 처리할 필요 없이 "폼이 dirty한데 벗어나려는 모든
// 시도"가 한 곳(blocker.state === "blocked")으로 모인다 -- X/Esc/바깥 클릭은 그냥 close()를
// 그대로 부르면 된다.
//
// 예외는 "게시/저장" 버튼: 성공적으로 끝내고 나가는 길이라 절대 막으면 안 된다. allowNextClose()를
// 부른 뒤 close()를 호출하면 그 한 번의 navigate만 블로커를 통과한다.
//
// hard reload·탭 닫기는 react-router가 다루는 영역 밖이라(브라우저 native beforeunload 몫)
// 여기서 못 막는다 -- useBlocker 자체의 한계다.
export function useCloseConfirmation(getIsDirty: () => boolean) {
  const skipNextBlockRef = useRef(false)

  const blocker = useBlocker(
    useCallback<BlockerFunction>(
      ({ currentLocation, nextLocation }) => {
        if (skipNextBlockRef.current) {
          skipNextBlockRef.current = false
          return false
        }

        return currentLocation.pathname !== nextLocation.pathname && getIsDirty()
      },
      [getIsDirty]
    )
  )

  const allowNextClose = useCallback(() => {
    skipNextBlockRef.current = true
  }, [])

  const confirmDiscard = useCallback(() => {
    if (blocker.state === "blocked") {
      blocker.proceed()
    }
  }, [blocker])

  const cancelDiscard = useCallback(() => {
    if (blocker.state === "blocked") {
      blocker.reset()
    }
  }, [blocker])

  return {
    isConfirmingDiscard: blocker.state === "blocked",
    allowNextClose,
    confirmDiscard,
    cancelDiscard,
  }
}
