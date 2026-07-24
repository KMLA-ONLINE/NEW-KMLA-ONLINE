// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import type { ComponentProps } from "react"
import { describe, expect, it, vi } from "vitest"

import { GroupCommentComposer } from "./group-comment-composer"
import { TooltipProvider } from "~/components/ui/tooltip"

function renderComposer(props: ComponentProps<typeof GroupCommentComposer>) {
  return render(
    <TooltipProvider>
      <GroupCommentComposer {...props} />
    </TooltipProvider>
  )
}

function writeAndSend() {
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "댓글" } })
  fireEvent.click(screen.getByRole("button", { name: "댓글 게시" }))
}

describe("GroupCommentComposer anonymity policy", () => {
  it("항상 익명 그룹에서는 익명 댓글로 제출한다", () => {
    const onSubmit = vi.fn()
    renderComposer({ anonymityPolicy: "required", onSubmit })

    writeAndSend()

    expect(onSubmit).toHaveBeenCalledWith("댓글", true)
  })

  it("실명 전용 그룹에서는 실명 댓글로 제출한다", () => {
    const onSubmit = vi.fn()
    renderComposer({ anonymityPolicy: "disabled", onSubmit })

    writeAndSend()

    expect(onSubmit).toHaveBeenCalledWith("댓글", false)
  })

  it("선택형 그룹에서는 사용자가 고른 익명 상태를 제출한다", () => {
    const onSubmit = vi.fn()
    renderComposer({ anonymityPolicy: "optional", onSubmit })

    fireEvent.click(screen.getByRole("button", { name: "실명으로 작성 중. 눌러서 익명으로" }))
    writeAndSend()

    expect(onSubmit).toHaveBeenCalledWith("댓글", true)
  })

  it("항상 익명 그룹에서 익명 작성이 제한되면 실명 우회를 막는다", () => {
    const onSubmit = vi.fn()
    renderComposer({ anonymityPolicy: "required", canPostAnonymously: false, onSubmit })

    const textbox = screen.getByRole("textbox")
    expect(textbox).toBeDisabled()
    expect(screen.getByRole("button", { name: "댓글 게시" })).toBeDisabled()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
