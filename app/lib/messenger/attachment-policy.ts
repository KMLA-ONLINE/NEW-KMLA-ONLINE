import { getAttachmentKind } from "~/lib/messenger/utils"

// 첨부를 업로드/전송 전에 거르는 단일 진입점. compressImage와 짝이다 -- compressImage가 바이트를
// 줄인다면 여기서는 "애초에 보낼 수 있는가"를 본다.
//
// 정책은 하드코딩하지 않고 런타임에 DB에서 받는다: message_attachment_mime_types(content_type →
// max_bytes) + max_message_attachments()의 개수 상한. 백엔드가 그 registry를 클라이언트용으로
// 열어둔 이유가 이것이다(05-chat.sql의 "Readable by clients on purpose ... its size guard" 주석).
// 값을 여기 복사하면 백엔드와 어긋나므로, 정책을 인자로만 받는다.
export type AttachmentPolicy = {
  // 한 메시지가 담을 수 있는 첨부 수. 이미지는 여러 장이 한 메시지를 이루므로 이 상한이 걸리고,
  // 비이미지는 파일당 한 메시지라 실질적으로 걸리지 않는다.
  maxPerMessage: number
  // content_type → max_bytes. 여기 있는 타입만 허용된다.
  maxBytesByType: Record<string, number>
}

export type RejectedAttachment =
  | { file: File; reason: "unsupported-type" }
  | { file: File; reason: "too-large"; maxBytes: number }
  | { file: File; reason: "too-many"; max: number }

export type AttachmentValidation = { accepted: File[]; rejected: RejectedAttachment[] }

/**
 * 고른 파일들을 정책에 비춰 통과/거절로 가른다. 순수 함수 -- 업로드도 압축도 하지 않는다.
 *
 * 이미지와 비이미지를 다르게 본다:
 *   - 이미지: 타입/크기를 검사하지 않는다. 업로드 전 compressImage가 항상 허용 타입(webp)으로
 *     바꾸고 크기도 상한 아래로 맞추기 때문이다. 대신 개수(maxPerMessage)만 본다.
 *   - 비이미지: 압축하지 않으므로 타입이 registry에 있어야 하고, 원본 크기가 그 타입의 상한
 *     이하여야 한다.
 */
export function validateAttachments(files: File[], policy: AttachmentPolicy): AttachmentValidation {
  const accepted: File[] = []
  const rejected: RejectedAttachment[] = []
  let imageCount = 0

  for (const file of files) {
    const kind = getAttachmentKind({ contentType: file.type || undefined, name: file.name })

    if (kind === "image") {
      if (imageCount >= policy.maxPerMessage) {
        rejected.push({ file, reason: "too-many", max: policy.maxPerMessage })
        continue
      }
      imageCount += 1
      accepted.push(file)
      continue
    }

    const maxBytes = file.type ? policy.maxBytesByType[file.type] : undefined
    if (maxBytes === undefined) {
      rejected.push({ file, reason: "unsupported-type" })
      continue
    }
    if (file.size > maxBytes) {
      rejected.push({ file, reason: "too-large", maxBytes })
      continue
    }
    accepted.push(file)
  }

  return { accepted, rejected }
}
