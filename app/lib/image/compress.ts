import imageCompression from "browser-image-compression"

// 업로드 전 이미지 압축의 단일 진입점. 모든 업로드 경로(아바타/커버/스페이스/글/채팅)는
// 지점별로 압축을 흩뿌리지 말고 여기를 거친다 — 프리셋을 유틸이 소유해 호출부는 이름만 넘긴다.
//
// 정책 두 가지가 여기 박혀 있다:
//   1. 출력은 전부 WebP. 단, 압축 결과가 원본보다 크면 원본을 그대로 둔다(작은 파일은 재인코딩이
//      손해다). 이 경우에만 포맷 통일이 깨지는데, 이미 작은 파일이라 문제되지 않는다.
//   2. 이미지가 아닌 첨부(pdf/hwp/문서 등)는 손대지 않고 그대로 통과시킨다.

export type ImagePreset =
  | "avatar"
  | "profileCover"
  | "spaceImage"
  | "spaceCover"
  | "post"
  | "message"

// 지점마다 목표가 다르다: 아바타/스페이스 아이콘은 작게 떠서 512로 충분하고, 배너·피드 사진은
// 크게 보이므로 여유를 둔다. maxSizeMB는 상한 힌트 — 라이브러리가 품질을 낮춰 근사한다.
const PRESETS: Record<ImagePreset, { maxEdge: number; maxSizeMB: number; quality: number }> = {
  avatar: { maxEdge: 512, maxSizeMB: 0.3, quality: 0.8 },
  profileCover: { maxEdge: 1600, maxSizeMB: 0.6, quality: 0.8 },
  spaceImage: { maxEdge: 512, maxSizeMB: 0.3, quality: 0.8 },
  spaceCover: { maxEdge: 1600, maxSizeMB: 0.6, quality: 0.8 },
  post: { maxEdge: 2048, maxSizeMB: 1.5, quality: 0.8 },
  message: { maxEdge: 2048, maxSizeMB: 1.5, quality: 0.8 },
}

/**
 * 이미지면 WebP로 압축한 File을, 이미지가 아니면 원본 File을 그대로 반환한다.
 * 압축이 어떤 이유로든 실패하거나 원본보다 커지면 원본을 반환한다(업로드를 막지 않는다).
 */
export async function compressImage(file: File, preset: ImagePreset): Promise<File> {
  if (!file.type.startsWith("image/")) return file

  const { maxEdge, maxSizeMB, quality } = PRESETS[preset]

  try {
    const compressed = await imageCompression(file, {
      maxWidthOrHeight: maxEdge,
      maxSizeMB,
      initialQuality: quality,
      fileType: "image/webp",
      useWebWorker: true,
      // EXIF를 보존하지 않는다 — 재인코딩하며 방향은 이미 반영되고, 위치/기기 메타데이터는
      // 오히려 떨궈야 한다(프라이버시). 이 값은 라이브러리 기본이지만 의도를 명시해 둔다.
      preserveExif: false,
    })

    // 이미 최적화된 작은 이미지는 재인코딩이 되레 커질 수 있다 — 그럴 땐 원본을 쓴다.
    if (compressed.size >= file.size) return file
    return toWebpFile(compressed, file.name)
  } catch {
    // 압축 실패가 업로드 실패가 되면 안 된다. 원본으로 진행하고, 크기 상한은 버킷 정책이 막는다.
    return file
  }
}

// 라이브러리가 이름/타입을 원본대로 남길 수 있어, 확장자와 MIME을 webp로 맞춘 File로 다시 감싼다.
// (버킷 insert policy와 finalize RPC가 image/webp를 MIME으로 보므로 일관돼야 한다.)
function toWebpFile(blob: Blob, originalName: string): File {
  const base = originalName.replace(/\.[^./\\]+$/, "")
  return new File([blob], `${base}.webp`, { type: "image/webp" })
}
