import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import ProfilePage from "./_app.profile"

describe("ProfilePage", () => {
  it("renders the profile identity and primary actions", () => {
    render(<ProfilePage />)

    expect(screen.getByRole("heading", { name: /김민족/ })).toBeInTheDocument()
    expect(screen.getByText("30기")).toBeInTheDocument()
    expect(screen.getByText("소개글입니다. 소개글입니다. 소개글입니다.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "프로필 편집" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "메시지" })).toBeInTheDocument()
  })

  it("renders the profile section tabs and personal information", () => {
    render(<ProfilePage />)

    for (const tab of ["정보", "그룹", "게시물", "활동"]) {
      expect(screen.getByRole("tab", { name: tab })).toBeInTheDocument()
    }

    expect(screen.getByRole("heading", { name: "정보" })).toBeInTheDocument()
    expect(screen.getByText("전공")).toBeInTheDocument()
    expect(screen.getByText("생명공학, 유전공학")).toBeInTheDocument()
    expect(screen.getByText("전화번호")).toBeInTheDocument()
    expect(screen.getByText("010-0000-0000")).toBeInTheDocument()
    expect(screen.getByText("행정반")).toBeInTheDocument()
    expect(screen.getByText("0반")).toBeInTheDocument()
    expect(screen.getByText("방")).toBeInTheDocument()
    expect(screen.getByText("000호 좌방")).toBeInTheDocument()
    expect(screen.getByText("부서")).toBeInTheDocument()
    expect(screen.getByText("과기부")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "더보기" })).toBeInTheDocument()
  })

  it("renders supporting profile cards for desktop layout", () => {
    render(<ProfilePage />)

    expect(screen.getByRole("heading", { name: "활동" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "그룹" })).toBeInTheDocument()
    expect(screen.getByText("최근 활동은 아직 없습니다.")).toBeInTheDocument()
    expect(screen.getByText("과학기술부")).toBeInTheDocument()
  })
})
