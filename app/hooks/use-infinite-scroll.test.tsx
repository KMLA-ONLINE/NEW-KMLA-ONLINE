// @vitest-environment jsdom
import { act, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useInfiniteScroll } from "./use-infinite-scroll"

let observerCallbacks: IntersectionObserverCallback[]

class MockIntersectionObserver implements IntersectionObserver {
  readonly root = null
  readonly rootMargin = "0px"
  readonly thresholds = [0]

  constructor(callback: IntersectionObserverCallback) {
    observerCallbacks.push(callback)
  }

  disconnect = vi.fn()
  observe = vi.fn()
  takeRecords = vi.fn(() => [])
  unobserve = vi.fn()
}

function Harness({
  onLoadMore,
  enabled = true,
  pending = false,
}: {
  onLoadMore: () => void
  enabled?: boolean
  pending?: boolean
}) {
  const sentinelRef = useInfiniteScroll(onLoadMore, { enabled, pending })
  return <div ref={sentinelRef} />
}

function notify(isIntersecting: boolean) {
  const callback = observerCallbacks.at(-1)
  if (!callback) throw new Error("observer was not created")
  act(() => {
    callback([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver)
  })
}

describe("useInfiniteScroll", () => {
  beforeEach(() => {
    observerCallbacks = []
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("같은 교차 상태에서는 한 번만 호출하고 벗어난 뒤 다시 호출한다", () => {
    const onLoadMore = vi.fn()
    render(<Harness onLoadMore={onLoadMore} />)

    notify(true)
    notify(true)
    expect(onLoadMore).toHaveBeenCalledOnce()

    notify(false)
    notify(true)
    expect(onLoadMore).toHaveBeenCalledTimes(2)
  })

  it("pending 동안 관찰하지 않고 완료되면 다시 관찰한다", () => {
    const onLoadMore = vi.fn()
    const view = render(<Harness onLoadMore={onLoadMore} pending />)
    expect(observerCallbacks).toHaveLength(0)

    view.rerender(<Harness onLoadMore={onLoadMore} pending={false} />)
    notify(true)
    expect(onLoadMore).toHaveBeenCalledOnce()
  })
})
