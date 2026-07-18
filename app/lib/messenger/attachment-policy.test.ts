// @vitest-environment jsdom
import { describe, expect, it } from "vitest"

import { validateAttachments, type AttachmentPolicy } from "./attachment-policy"

const POLICY: AttachmentPolicy = {
  maxPerMessage: 3,
  maxBytesByType: { "application/pdf": 100, "video/mp4": 200 },
}

function file(name: string, type: string, size: number): File {
  return new File([new Uint8Array(size)], name, { type })
}

describe("validateAttachments", () => {
  it("registry에 없는 비이미지 타입은 거절한다", () => {
    const exe = file("app.exe", "application/x-msdownload", 10)
    const { accepted, rejected } = validateAttachments([exe], POLICY)
    expect(accepted).toEqual([])
    expect(rejected).toEqual([{ file: exe, reason: "unsupported-type" }])
  })

  it("타입 상한을 넘는 비이미지는 거절한다", () => {
    const big = file("clip.mp4", "video/mp4", 201)
    const { rejected } = validateAttachments([big], POLICY)
    expect(rejected).toEqual([{ file: big, reason: "too-large", maxBytes: 200 }])
  })

  it("상한 이하 비이미지는 통과시킨다", () => {
    const ok = file("doc.pdf", "application/pdf", 100)
    const { accepted } = validateAttachments([ok], POLICY)
    expect(accepted).toEqual([ok])
  })

  it("이미지는 타입/크기를 보지 않고 통과시킨다(압축이 처리)", () => {
    // registry에 없고 상한도 없는 큰 이미지 -- 그래도 통과해야 한다.
    const huge = file("photo.heic", "image/heic", 10_000)
    const { accepted, rejected } = validateAttachments([huge], POLICY)
    expect(accepted).toEqual([huge])
    expect(rejected).toEqual([])
  })

  it("maxPerMessage를 넘는 이미지는 초과분만 too-many로 거절한다", () => {
    const images = Array.from({ length: 4 }, (_, i) => file(`p${i}.jpg`, "image/jpeg", 10))
    const { accepted, rejected } = validateAttachments(images, POLICY)
    expect(accepted).toEqual(images.slice(0, 3))
    expect(rejected).toEqual([{ file: images[3], reason: "too-many", max: 3 }])
  })

  it("개수 상한은 이미지에만 걸린다 -- 비이미지 여럿은 각자 판정된다", () => {
    const pdfs = Array.from({ length: 5 }, (_, i) => file(`d${i}.pdf`, "application/pdf", 10))
    const { accepted } = validateAttachments(pdfs, POLICY)
    expect(accepted).toEqual(pdfs)
  })
})
