// @vitest-environment jsdom
import { createRef } from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { GroupContentEditor } from "./group-content-editor"

describe("GroupContentEditor", () => {
  it("엔터가 포함된 현재 textarea 값을 미리보기에 반영한다", () => {
    const contentRef = createRef<HTMLTextAreaElement>()
    const { container } = render(<GroupContentEditor contentRef={contentRef} />)
    const textarea = screen.getByPlaceholderText("내용을 입력하세요…")

    fireEvent.change(textarea, { target: { value: "첫 줄\n둘째 줄" } })
    fireEvent.click(screen.getByRole("button", { name: "미리보기" }))

    expect(container.querySelector("p")?.textContent).toBe("첫 줄\n둘째 줄")
  })
})
