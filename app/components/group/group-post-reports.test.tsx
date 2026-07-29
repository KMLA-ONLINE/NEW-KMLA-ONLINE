// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { describe, expect, it, vi } from "vitest"

import { GroupPostReports } from "./group-post-reports"
import type { GroupPostReport, GroupPostReportCase } from "~/lib/group/types"

const LONG_DETAILS = `긴 신고 설명입니다. ${"https://example.com/very-long-segment".repeat(20)}`
const REPORTS: GroupPostReport[] = Array.from({ length: 12 }, (_, index) => ({
  id: index + 1,
  reason: index === 0 ? "privacy" : "spam",
  details: index === 0 ? LONG_DETAILS : `신고 설명 ${index + 1}`,
  createdAt: new Date(Date.parse("2026-07-11T00:00:00.000Z") + index * 60_000).toISOString(),
}))

const REPORT_CASE: GroupPostReportCase = {
  postId: 10,
  pubId: "00000000-0000-4000-8000-000000000010",
  title: "신고된 게시물",
  content: "관리자가 확인할 본문",
  isAnonymous: false,
  authorAttribution: null,
  postCreatedAt: "2026-07-10T00:00:00.000Z",
  reportCount: 137,
  firstReportedAt: "2026-07-11T00:00:00.000Z",
  lastReportedAt: "2026-07-12T00:00:00.000Z",
  reasonCounts: { spam: 100, privacy: 37 },
}

function renderReports(onDismiss = vi.fn(), onRemove = vi.fn()) {
  render(
    <MemoryRouter>
      <GroupPostReports
        cases={[REPORT_CASE]}
        reportsByPostId={{ [REPORT_CASE.postId]: REPORTS }}
        onDismiss={onDismiss}
        onRemove={onRemove}
      />
    </MemoryRouter>
  )
  return { onDismiss, onRemove }
}

describe("GroupPostReports", () => {
  it("큰 신고 수는 99+로 줄이고 접근성 이름에는 정확한 수를 남긴다", () => {
    const { onDismiss } = renderReports()

    expect(screen.getByLabelText("신고 137건")).toHaveTextContent("99+건")
    expect(screen.getByLabelText("스팸 또는 광고 100건")).toHaveTextContent("스팸 또는 광고 99+")
    expect(screen.getByLabelText("개인정보 노출 37건")).toHaveTextContent("개인정보 노출 37")

    fireEvent.click(screen.getByRole("button", { name: "기각" }))
    expect(onDismiss).toHaveBeenCalledWith(REPORT_CASE)
  })

  it("개별 신고를 10건씩 펼치고 긴 설명을 3줄로 제한한다", () => {
    renderReports()

    expect(screen.queryByText(LONG_DETAILS)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "신고 내용 보기" }))

    expect(screen.getByText(LONG_DETAILS)).toHaveClass("line-clamp-3", "[overflow-wrap:anywhere]")
    expect(screen.getByText("신고 설명 10")).toBeInTheDocument()
    expect(screen.queryByText("신고 설명 11")).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "2건 더 보기" }))
    expect(screen.getByText("신고 설명 11")).toBeInTheDocument()
    expect(screen.getByText("신고 설명 12")).toBeInTheDocument()
  })

  it("확인 Dialog를 거쳐 게시물을 삭제 처리한다", () => {
    const { onRemove } = renderReports()

    fireEvent.click(screen.getByRole("button", { name: "게시물 삭제" }))
    expect(screen.getByRole("dialog", { name: "신고된 게시물을 삭제할까요?" })).toBeInTheDocument()
    expect(screen.getByText(/신고 137건이 모두/)).toBeInTheDocument()
    expect(onRemove).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "삭제" }))
    expect(onRemove).toHaveBeenCalledWith(REPORT_CASE)
  })

  it("사건 목록도 20건씩 추가한다", () => {
    const cases = Array.from({ length: 21 }, (_, index) => ({
      ...REPORT_CASE,
      postId: index + 1,
      pubId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      title: `신고된 게시물 ${index + 1}`,
    }))

    render(
      <MemoryRouter>
        <GroupPostReports
          cases={cases}
          reportsByPostId={{}}
          onDismiss={vi.fn()}
          onRemove={vi.fn()}
        />
      </MemoryRouter>
    )

    expect(screen.getByRole("link", { name: "신고된 게시물 20" })).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "신고된 게시물 21" })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "1건 더 보기" }))
    expect(screen.getByRole("link", { name: "신고된 게시물 21" })).toBeInTheDocument()
  })

  it("대기 사건이 없으면 완료 상태를 표시한다", () => {
    render(
      <GroupPostReports cases={[]} reportsByPostId={{}} onDismiss={vi.fn()} onRemove={vi.fn()} />
    )

    expect(screen.getByText("대기 중인 신고가 없습니다")).toBeInTheDocument()
  })
})
