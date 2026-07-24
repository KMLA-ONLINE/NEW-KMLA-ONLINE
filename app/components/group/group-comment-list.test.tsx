// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { GroupCommentList } from "./group-comment-list"
import type { GroupComment } from "~/lib/group/types"

const COMMENTS: GroupComment[] = [
  {
    id: 1,
    parentId: null,
    author: null,
    anonymousLabel: "익명1",
    content: "최상위 댓글",
    createdAt: "2026-07-24T00:00:00.000Z",
  },
  {
    id: 2,
    parentId: 1,
    author: null,
    anonymousLabel: "익명2",
    content: "첫 번째 답글",
    createdAt: "2026-07-24T00:01:00.000Z",
  },
  {
    id: 3,
    parentId: 2,
    author: null,
    anonymousLabel: "익명1",
    content: "답글의 답글",
    createdAt: "2026-07-24T00:02:00.000Z",
  },
]

function renderComments() {
  return render(
    <GroupCommentList
      comments={COMMENTS}
      reactionTypes={[]}
      anonymityPolicy="disabled"
      canPostAnonymously={false}
      staffAttributionMode="none"
    />
  )
}

describe("GroupCommentList replies", () => {
  it("답글을 기본으로 숨기고 전체 하위 답글 수를 표시한다", () => {
    renderComments()

    expect(screen.getByText("최상위 댓글")).toBeInTheDocument()
    expect(screen.queryByText("첫 번째 답글")).not.toBeInTheDocument()
    expect(screen.queryByText("답글의 답글")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "답글 2개 보기" })).toHaveAttribute(
      "aria-expanded",
      "false"
    )
  })

  it("보기 버튼으로 전체 스레드를 펼치고 다시 숨긴다", () => {
    renderComments()

    fireEvent.click(screen.getByRole("button", { name: "답글 2개 보기" }))

    expect(screen.getByText("첫 번째 답글")).toBeInTheDocument()
    expect(screen.getByText("답글의 답글")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "답글 숨기기" }))

    expect(screen.queryByText("첫 번째 답글")).not.toBeInTheDocument()
    expect(screen.queryByText("답글의 답글")).not.toBeInTheDocument()
  })

  it("답글 작성을 시작하면 기존 답글을 자동으로 펼친다", () => {
    renderComments()

    fireEvent.click(screen.getByRole("button", { name: "답글" }))

    expect(screen.getByText("첫 번째 답글")).toBeInTheDocument()
    expect(screen.getByPlaceholderText("익명1님에게 답글 남기기…")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "답글 숨기기" })).toHaveAttribute(
      "aria-expanded",
      "true"
    )
  })

  it("중첩 답글 입력창을 선택한 댓글의 자식 답글보다 먼저 표시한다", () => {
    renderComments()
    fireEvent.click(screen.getByRole("button", { name: "답글 2개 보기" }))

    fireEvent.click(screen.getAllByRole("button", { name: "답글" })[1])

    const composer = screen.getByPlaceholderText("익명2님에게 답글 남기기…")
    const childReply = screen.getByText("답글의 답글")
    expect(
      composer.compareDocumentPosition(childReply) & Node.DOCUMENT_POSITION_FOLLOWING
    ).not.toBe(0)
  })
})
