import { describe, expect, it } from "vitest"

import { compressImage } from "./compress"

// 실제 이미지 압축은 canvas/OffscreenCanvas가 필요해 jsdom에서 돌지 않는다(브라우저 통합 대상).
// 여기서는 라이브러리를 타지 않는 계약만 고정한다: 비이미지 첨부는 손대지 않고 그대로 통과한다.
describe("compressImage", () => {
  it("이미지가 아닌 파일은 원본을 그대로 반환한다", async () => {
    const pdf = new File([new Uint8Array([1, 2, 3])], "report.pdf", { type: "application/pdf" })
    const result = await compressImage(pdf, "post")
    expect(result).toBe(pdf)
  })

  it("타입이 없는 파일도 통과시킨다", async () => {
    const blob = new File([new Uint8Array([0])], "unknown.bin", { type: "" })
    const result = await compressImage(blob, "message")
    expect(result).toBe(blob)
  })
})
