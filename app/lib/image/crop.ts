// 크롭은 압축 전 단계다. EXIF 방향을 미리보기와 같은 좌표계로 맞추고, WebP 재인코딩은 한 번만 한다.

export type CropRect = { x: number; y: number; width: number; height: number }

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

// -0 → +0. `-dx/dispScale`은 dx가 0일 때 -0을 낳는데, 수학적으론 0이어도 Object.is/직렬화에서
// 튀므로 눌러 둔다.
function normalizeZero(value: number): number {
  return value === 0 ? 0 : value
}

export function coverFit(params: {
  imageWidth: number
  imageHeight: number
  frameWidth: number
  frameHeight: number
  zoom: number
}): { baseScale: number; dispScale: number; maxOffsetX: number; maxOffsetY: number } {
  const { imageWidth, imageHeight, frameWidth, frameHeight, zoom } = params
  const baseScale = Math.max(frameWidth / imageWidth, frameHeight / imageHeight)
  const dispScale = baseScale * zoom
  return {
    baseScale,
    dispScale,
    maxOffsetX: Math.max(0, (imageWidth * dispScale - frameWidth) / 2),
    maxOffsetY: Math.max(0, (imageHeight * dispScale - frameHeight) / 2),
  }
}

export function coverCropRect(params: {
  imageWidth: number
  imageHeight: number
  frameWidth: number
  frameHeight: number
  zoom: number
  offsetX: number
  offsetY: number
}): CropRect {
  const { imageWidth, imageHeight, frameWidth, frameHeight, offsetX, offsetY } = params
  const { dispScale, maxOffsetX, maxOffsetY } = coverFit(params)

  const ox = clamp(offsetX, -maxOffsetX, maxOffsetX)
  const oy = clamp(offsetY, -maxOffsetY, maxOffsetY)

  const dx = frameWidth / 2 - (imageWidth * dispScale) / 2 + ox
  const dy = frameHeight / 2 - (imageHeight * dispScale) / 2 + oy

  return {
    x: normalizeZero(-dx / dispScale),
    y: normalizeZero(-dy / dispScale),
    width: frameWidth / dispScale,
    height: frameHeight / dispScale,
  }
}

export function fitOutputSize(
  rect: Pick<CropRect, "width" | "height">,
  maxEdge: number
): { width: number; height: number } {
  const longer = Math.max(rect.width, rect.height)
  const scale = longer > maxEdge ? maxEdge / longer : 1
  return {
    width: Math.max(1, Math.round(rect.width * scale)),
    height: Math.max(1, Math.round(rect.height * scale)),
  }
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("canvas.toBlob returned null"))),
      "image/png"
    )
  })
}

export async function cropImage(
  file: File,
  rect: CropRect,
  output: { width: number; height: number }
): Promise<File> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" })
  try {
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(output.width))
    canvas.height = Math.max(1, Math.round(output.height))

    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("2d context unavailable")
    ctx.imageSmoothingQuality = "high"
    ctx.drawImage(
      bitmap,
      rect.x,
      rect.y,
      rect.width,
      rect.height,
      0,
      0,
      canvas.width,
      canvas.height
    )

    const blob = await canvasToBlob(canvas)
    const base = file.name.replace(/\.[^./\\]+$/, "") || "image"
    return new File([blob], `${base}.png`, { type: "image/png" })
  } finally {
    bitmap.close()
  }
}
