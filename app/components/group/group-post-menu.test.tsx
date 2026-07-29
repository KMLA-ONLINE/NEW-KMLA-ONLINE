// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { describe, expect, it, vi } from "vitest"

import { GroupPostMenu } from "./group-post-menu"

function renderMenu(onReport = vi.fn()) {
  render(
    <MemoryRouter>
      <GroupPostMenu editTo="edit" postTitle="신고 테스트 게시물" onReport={onReport} />
    </MemoryRouter>
  )
  return onReport
}

describe("GroupPostMenu reports", () => {
  it("일반 멤버도 남의 게시물을 사유와 설명으로 신고한다", () => {
    const onReport = renderMenu()

    fireEvent.pointerDown(screen.getByRole("button", { name: "게시물 옵션" }), { button: 0 })
    fireEvent.click(screen.getByRole("menuitem", { name: "신고" }))

    expect(screen.getByRole("dialog", { name: "게시물 신고" })).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText("관리자가 확인해야 할 내용을 적어 주세요."), {
      target: { value: "  확인이 필요한 내용  " },
    })
    fireEvent.click(screen.getByRole("button", { name: "신고하기" }))

    expect(onReport).toHaveBeenCalledWith("spam", "확인이 필요한 내용")

    fireEvent.pointerDown(screen.getByRole("button", { name: "게시물 옵션" }), { button: 0 })
    expect(screen.getByRole("menuitem", { name: "신고 완료" })).toHaveAttribute("data-disabled")
  })

  it("작성자 본인에게는 신고 항목을 표시하지 않는다", () => {
    render(
      <MemoryRouter>
        <GroupPostMenu isMine editTo="edit" postTitle="내 게시물" />
      </MemoryRouter>
    )

    fireEvent.pointerDown(screen.getByRole("button", { name: "게시물 옵션" }), { button: 0 })
    expect(screen.queryByRole("menuitem", { name: "신고" })).not.toBeInTheDocument()
  })
})
