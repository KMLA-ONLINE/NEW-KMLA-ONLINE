import type { ReactNode } from "react"
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { describe, expect, it } from "vitest"

import ProfilePage from "./profile"
import ProfileEditPage from "./edit"

function renderWithRouter(ui: ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

describe("ProfilePage", () => {
  it("renders the profile identity and primary actions", () => {
    renderWithRouter(<ProfilePage />)

    expect(screen.getByRole("heading", { name: /김민족/ })).toBeInTheDocument()
    expect(screen.getAllByText("30기")[0]).toBeInTheDocument()
    expect(screen.getAllByText("소개글입니다. 소개글입니다. 소개글입니다.")[0]).toBeInTheDocument()
    expect(screen.getByText(/10학년\s+국제반\s+\|\s+1반/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "배경 사진 변경" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "프로필 편집" })).toHaveAttribute(
      "href",
      "/profile/edit"
    )
    expect(screen.getByRole("button", { name: "메시지" })).toBeInTheDocument()
  })

  it("renders profile tabs with information selected by default", () => {
    renderWithRouter(<ProfilePage />)

    expect(screen.getByRole("tablist", { name: "프로필 섹션" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "정보", selected: true })).toBeInTheDocument()

    for (const tab of ["그룹", "게시물", "활동"]) {
      expect(screen.getByRole("tab", { name: tab, selected: false })).toBeInTheDocument()
    }
  })

  it("renders the redesigned information tab content", () => {
    renderWithRouter(<ProfilePage />)

    expect(screen.getByRole("heading", { name: "정보" })).toBeInTheDocument()
    expect(screen.getByText("전공")).toBeInTheDocument()
    expect(screen.getByText("생명공학, 유전공학")).toBeInTheDocument()
    expect(screen.getByText("학번")).toBeInTheDocument()
    expect(screen.getByText("251000")).toBeInTheDocument()
    expect(screen.getByText("전화번호")).toBeInTheDocument()
    expect(screen.getByText("010-0000-0000")).toBeInTheDocument()
    expect(screen.getByText("이메일")).toBeInTheDocument()
    expect(screen.getByText("minjok.kim@kmlaonline.kr")).toBeInTheDocument()
    expect(screen.getByText("방")).toBeInTheDocument()
    expect(screen.getByText("305호 좌방")).toBeInTheDocument()
    expect(screen.getByText("부서")).toBeInTheDocument()
    expect(screen.getByText("과학기술부")).toBeInTheDocument()
    expect(screen.getByText("생일")).toBeInTheDocument()
    expect(screen.getByText("2009-03-01")).toBeInTheDocument()
    expect(screen.getByText("성별")).toBeInTheDocument()
    expect(screen.getByText("남자")).toBeInTheDocument()
    expect(screen.queryByText("이름")).not.toBeInTheDocument()
    expect(screen.queryByText("기수")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "더보기" })).not.toBeInTheDocument()
  })

  it("does not render removed activity or group content", () => {
    renderWithRouter(<ProfilePage />)

    expect(screen.queryByRole("heading", { name: "활동" })).not.toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "그룹" })).not.toBeInTheDocument()
    expect(screen.queryByText("최근 활동은 아직 없습니다.")).not.toBeInTheDocument()
    expect(screen.queryByText("생명과학 연구회")).not.toBeInTheDocument()
  })
})

describe("ProfileEditPage", () => {
  it("renders static mock profile edit fields", () => {
    renderWithRouter(<ProfileEditPage />)

    expect(screen.getByRole("heading", { name: "프로필 편집" })).toBeInTheDocument()
    expect(screen.getByLabelText("전공")).toHaveValue("생명공학, 유전공학")
    expect(screen.getByLabelText("학번")).toHaveValue("251000")
    expect(screen.getByLabelText("전화번호")).toHaveValue("010-0000-0000")
    expect(screen.getByLabelText("이메일")).toHaveValue("minjok.kim@kmlaonline.kr")
    expect(screen.getByLabelText("방")).toHaveValue("305")
    expect(screen.getByRole("group", { name: "방 방향" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "좌방", pressed: true })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "우방", pressed: false })).toBeInTheDocument()
    expect(screen.getByLabelText("부서")).toHaveValue("과학기술부")
    expect(screen.getByLabelText("생일")).toHaveValue("2009-03-01")
    expect(screen.getByRole("combobox", { name: "성별" })).toBeInTheDocument()
    expect(screen.queryByLabelText("이름")).not.toBeInTheDocument()
    expect(screen.queryByLabelText("소개")).not.toBeInTheDocument()
    expect(screen.queryByLabelText("학년")).not.toBeInTheDocument()
    expect(screen.queryByRole("combobox", { name: "계열" })).not.toBeInTheDocument()
    expect(screen.queryByLabelText("행정반")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "저장" })).toBeInTheDocument()
  })
})
