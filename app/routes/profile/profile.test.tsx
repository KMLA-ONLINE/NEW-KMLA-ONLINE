// @vitest-environment jsdom
import type { ReactNode } from "react"
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { describe, expect, it } from "vitest"

import ProfileEditPage from "./edit"
import ProfilePage from "./profile"

function renderWithRouter(ui: ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

// 프로필 데이터가 아직 mock인 동안에는 고정 문구 전체를 검증하지 않는다. 실제 데이터가
// 연결되면 그때 loader와 저장 흐름을 대상으로 행동 테스트를 추가한다.
describe("profile mock routes", () => {
  it("shows the profile's navigable, accessible shell", () => {
    renderWithRouter(<ProfilePage />)

    expect(screen.getByRole("heading", { name: /김민족/ })).toBeInTheDocument()
    expect(screen.getByRole("tablist", { name: "프로필 섹션" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "정보", selected: true })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "프로필 편집" })).toHaveAttribute(
      "href",
      "/profile/edit"
    )
  })

  it("exposes the editable profile controls", () => {
    renderWithRouter(<ProfileEditPage />)

    expect(screen.getByRole("heading", { name: "프로필 편집" })).toBeInTheDocument()
    expect(screen.getByLabelText("전공")).toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: "성별" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "저장" })).toBeInTheDocument()
  })
})
