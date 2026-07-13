/**
 * 복호화한 첨부를 브라우저에 넘기는 유일한 문.
 *
 * 여기가 함수인 이유는 하나다: **암호화된 첨부는 MIME을 강제하는 지점이 서버에서 이 줄로
 * 옮겨왔다.** 잃은 것은 없지만, 이걸 놓치면 그 자리에서 잃는다.
 *
 * 평문 첨부는 Storage가 `Content-Type: image/png` 헤더를 붙여서 내려주고 브라우저가 그
 * 헤더를 믿는다. 그래서 image/png로 신고된 SVG 바이트는 그림이 깨질 뿐 스크립트로 실행되지
 * 않는다 -- 우리가 바이트를 검사해서가 아니라, 브라우저가 헤더를 따르기 때문이다.
 *
 * 암호문에는 그 헤더가 없다. Storage가 보는 것은 `application/octet-stream`뿐이고, 실제
 * 타입은 우리가 Blob을 만들면서 직접 세운다. 그러니 여기서 바이트를 sniff하거나 octet-stream을
 * 쓰면 그 보호가 사라진다. 반대로 신고된 타입을 그대로 쓰면 평문 경로와 **정확히 같은** 보호가
 * 유지된다.
 *
 * 그 신고된 타입이 안전한 이유는 `message_attachments.content_type`이
 * `message_attachment_mime_types`에 FK로 묶여 있어서다 -- `image/svg+xml`은 애초에 그 레지스트리에
 * 없고(스크립트를 품을 수 있어 의도적으로 제외), `supabase/tests/09-storage.sql`이 계속 없는지
 * 지킨다. 즉 발신자가 아무 타입이나 신고할 수는 없다.
 *
 * 남는 구멍은 하나: 발신자가 PDF 바이트를 `image/png`라고 신고할 수 있다. 그러면 그림이
 * 깨진다. 그게 전부다.
 */

/** 호출자가 다 쓰고 `URL.revokeObjectURL`로 되돌려줘야 한다. */
export function decryptedAttachmentUrl(bytes: Uint8Array, declaredContentType: string): string {
  return URL.createObjectURL(
    // 절대 sniff하지 말 것. 위 주석 참고.
    new Blob([bytes as BlobPart], { type: declaredContentType })
  )
}
