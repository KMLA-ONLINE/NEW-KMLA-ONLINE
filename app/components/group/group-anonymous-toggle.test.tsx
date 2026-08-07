// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { GroupAnonymousToggle } from "./group-anonymous-toggle"
import { TooltipProvider } from "~/components/ui/tooltip"

function renderToggle({ anonymous, onToggle }: { anonymous: boolean; onToggle: () => void }) {
  return render(
    <TooltipProvider>
      <GroupAnonymousToggle anonymous={anonymous} onToggle={onToggle} />
    </TooltipProvider>
  )
}

describe("GroupAnonymousToggle", () => {
  it("실명에서 익명으로 바꾸기 전에 확인한다", () => {
    const onToggle = vi.fn()
    renderToggle({ anonymous: false, onToggle })

    fireEvent.click(screen.getByRole("button", { name: "실명으로 작성 중. 눌러서 익명으로" }))

    expect(onToggle).not.toHaveBeenCalled()
    expect(screen.getByRole("dialog", { name: "익명으로 작성할까요?" })).toBeInTheDocument()
    expect(screen.getByText("작성 후에는 실명과 익명 여부를 변경할 수 없습니다.")).toBeVisible()

    fireEvent.click(screen.getByRole("button", { name: "익명으로 변경" }))
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it("익명에서 실명으로는 확인 없이 바로 바꾼다", () => {
    const onToggle = vi.fn()
    renderToggle({ anonymous: true, onToggle })

    fireEvent.click(screen.getByRole("button", { name: "익명으로 작성 중. 눌러서 실명으로" }))

    expect(onToggle).toHaveBeenCalledOnce()
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })
})
