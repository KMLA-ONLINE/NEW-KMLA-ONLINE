import { describe, expect, it } from "vitest"

import { toggleHeadingText } from "./use-markdown-shortcuts"

describe("toggleHeadingText", () => {
  it("현재 줄에 큰 제목을 넣고 다시 누르면 뺀다", () => {
    const added = toggleHeadingText("본문", 2, 2, 1)
    expect(added.replacement).toBe("# 본문")

    const removed = toggleHeadingText(added.replacement, 4, 4, 1)
    expect(removed.replacement).toBe("본문")
  })

  it("선택된 여러 줄에 작은 제목을 넣는다", () => {
    const text = "첫 줄\n둘째 줄"
    expect(toggleHeadingText(text, 0, text.length, 2).replacement).toBe("## 첫 줄\n## 둘째 줄")
  })

  it("선택이 줄바꿈에서 끝나면 다음 줄을 건드리지 않는다", () => {
    expect(toggleHeadingText("first\nsecond", 0, 6, 1).replacement).toBe("# first")
  })

  it("다른 레벨의 제목은 선택한 레벨로 바꾼다", () => {
    expect(toggleHeadingText("## 제목", 0, 5, 1).replacement).toBe("# 제목")
  })
})
