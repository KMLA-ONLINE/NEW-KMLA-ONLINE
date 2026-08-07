// @vitest-environment jsdom
import imageCompression from "browser-image-compression"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { compressImage } from "./compress"

vi.mock("browser-image-compression", () => ({ default: vi.fn() }))

const compress = vi.mocked(imageCompression)

describe("compressImage", () => {
  beforeEach(() => {
    compress.mockReset()
  })

  it("비이미지는 압축 라이브러리를 호출하지 않고 원본을 반환한다", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "report.pdf", {
      type: "application/pdf",
    })

    expect(await compressImage(file, "post")).toBe(file)
    expect(compress).not.toHaveBeenCalled()
  })

  it("프리셋으로 압축한 작은 결과를 WebP File로 정규화한다", async () => {
    const file = new File([new Uint8Array(100)], "avatar.png", { type: "image/png" })
    compress.mockResolvedValue(new File([new Uint8Array(20)], "avatar.png", { type: "image/png" }))

    const result = await compressImage(file, "avatar")

    expect(compress).toHaveBeenCalledWith(file, {
      maxWidthOrHeight: 512,
      maxSizeMB: 0.3,
      initialQuality: 0.8,
      fileType: "image/webp",
      useWebWorker: true,
      preserveExif: false,
    })
    expect(result).not.toBe(file)
    expect(result.name).toBe("avatar.webp")
    expect(result.type).toBe("image/webp")
    expect(result.size).toBe(20)
  })

  it("압축 결과가 더 크거나 압축이 실패하면 원본을 반환한다", async () => {
    const file = new File([new Uint8Array(20)], "small.png", { type: "image/png" })
    compress.mockResolvedValueOnce(new File([new Uint8Array(20)], "small.webp"))
    expect(await compressImage(file, "message")).toBe(file)

    compress.mockRejectedValueOnce(new Error("canvas unavailable"))
    expect(await compressImage(file, "message")).toBe(file)
  })
})
