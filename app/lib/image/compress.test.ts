// @vitest-environment jsdom
import { describe, expect, it } from "vitest"

import { compressImage } from "./compress"

// 실제 이미지 압축은 canvas/OffscreenCanvas가 필요해 jsdom에서 돌지 않는다(브라우저 통합 대상).
// 여기서는 라이브러리를 타지 않는 계약만 고정한다: 비이미지 첨부는 손대지 않고 그대로 통과한다.
describe("compressImage", () => {
  it.each([
    ["PDF", "report.pdf", "application/pdf"],
    ["MIME 없는 파일", "unknown.bin", ""],
  ])("%s는 원본을 그대로 반환한다", async (_label, name, type) => {
    const file = new File([new Uint8Array([1, 2, 3])], name, { type })

    expect(await compressImage(file, "post")).toBe(file)
  })
})
