// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { createMemoryRouter, RouterProvider } from "react-router"
import { describe, expect, it } from "vitest"

import ProfileEditPage from "./edit"
import ProfilePage from "./profile"
import { mockProfile } from "~/lib/profile/mock-data"

// 진짜 중첩으로 띄운다. 편집이 본문 위에 뜨는 모달이라는 것이 이 화면의 구조인데, 모달을 혼자
// 렌더하면 useOutletContext가 죽는다.
function renderProfileAt(path: string, entries: string[] = [path]) {
  const router = createMemoryRouter(
    [
      {
        path: "/profile/:profileId",
        Component: ProfilePage,
        children: [{ path: "edit", Component: ProfileEditPage }],
      },
    ],
    { initialEntries: entries }
  )

  return render(<RouterProvider router={router} />)
}

const mine = `/profile/${mockProfile.id}`
const someoneElse = `/profile/${mockProfile.id + 1}`

// 데이터가 목인 동안 목 값을 다시 읽는 테스트는 쓰지 않는다 -- 로더가 붙는 날 통째로 버려진다.
// 남는 건 데이터와 무관하게 참이어야 하는 두 가지다.

// 하나: 같은 화면이 내 프로필과 남의 프로필을 모두 그리므로, 편집 컨트롤이 본인에게만 보여야 한다.
// 이 분기가 무너지면 남의 프로필에서 편집 버튼이 열린다.
describe("profile ownership", () => {
  it("shows editing controls on my profile and hides them on someone else's", () => {
    const { unmount } = renderProfileAt(mine)
    expect(screen.getByRole("link", { name: "프로필 편집" })).toHaveAttribute(
      "href",
      `${mine}/edit`
    )
    expect(screen.getByRole("button", { name: "프로필 사진 변경" })).toBeInTheDocument()
    unmount()

    renderProfileAt(someoneElse)
    expect(screen.queryByRole("link", { name: "프로필 편집" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "프로필 사진 변경" })).not.toBeInTheDocument()
  })
})

// 둘: 편집 폼의 칸 목록은 profiles의 update 컬럼 grant와 같아야 한다. 서버가 받아주지 않는 칸을
// 그려두면 저장이 붙는 날 조용히 사라지고, 빠진 칸은 영영 못 고치는 값이 된다.
describe("profile edit fields", () => {
  it("matches the update column grant", () => {
    renderProfileAt(`${mine}/edit`)

    for (const label of ["이름", "소개", "생일", "전화번호", "기수", "반", "방"]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument()
    }
    for (const label of ["성별", "계열", "부서"]) {
      expect(screen.getByRole("combobox", { name: label })).toBeInTheDocument()
    }

    // 학번은 심사에서 신원을 대조한 값이고 unique라 grant에 없다 -- 열어두면 남의 학번을
    // 선점할 수 있다. "전공"은 스키마에 컬럼조차 없던 칸이다.
    for (const label of ["학번", "전공", "이메일"]) {
      expect(screen.queryByLabelText(label)).not.toBeInTheDocument()
    }
  })
})

// 셋: 나가기 확인창을 거쳐 닫아도 페이지가 다시 클릭 가능해야 한다.
//
// 실제로 났던 버그다. 확인창을 별도의 Radix AlertDialog로 띄우면 모달 layer가 둘이 되는데,
// 라우트 이동으로 둘이 한꺼번에 사라지면 body의 `pointer-events: none`이 복구되지 않는다.
// 화면은 멀쩡해 보이고 모달도 정상적으로 닫히는데 아무것도 클릭되지 않는다 -- 눈으로는
// 절대 못 잡고, 잡아도 원인이 안 보이는 종류의 실패라서 테스트로 못 박아 둔다.
describe("discard confirmation", () => {
  it("unlocks the page after leaving through the confirmation", async () => {
    // 편집 모달을 히스토리 위에 얹는다. close()가 navigate(-1)이라 돌아갈 자리가 필요하다.
    renderProfileAt("/profile/1/edit", ["/profile/1", "/profile/1/edit"])

    fireEvent.change(screen.getByLabelText("이름"), { target: { value: "고친 이름" } })
    fireEvent.click(screen.getByRole("button", { name: "닫기" }))

    fireEvent.click(await screen.findByRole("button", { name: "나가기" }))

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "프로필 편집" })).not.toBeInTheDocument()
    })
    expect(document.body.style.pointerEvents).not.toBe("none")
  })

  it("keeps the form when 계속 편집 is chosen", async () => {
    renderProfileAt("/profile/1/edit", ["/profile/1", "/profile/1/edit"])

    fireEvent.change(screen.getByLabelText("이름"), { target: { value: "고친 이름" } })
    fireEvent.click(screen.getByRole("button", { name: "닫기" }))
    fireEvent.click(await screen.findByRole("button", { name: "계속 편집" }))

    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    })
    // 고치던 값이 그대로 살아 있어야 한다 -- 확인창을 띄운 이유가 그것이다.
    expect(screen.getByLabelText("이름")).toHaveValue("고친 이름")
  })
})
