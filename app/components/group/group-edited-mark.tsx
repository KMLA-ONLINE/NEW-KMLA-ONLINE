import { formatAbsoluteTime } from "~/lib/time"

/**
 * "수정됨". `updated_at`이 null이 아니면 수정된 것이다 — 그 판단이 여기 한 곳에만 있도록 컴포넌트로 둔다.
 *
 * 서버가 찍는다(trg_mark_post_edited / trg_mark_comment_edited): 제목·본문·카테고리가 **실제로**
 * 바뀐 UPDATE에만 찍히고, 고정이나 삭제에는 안 찍힌다. 그래서 여기서 "고정된 글인데 수정됨으로
 * 보인다" 같은 걸 걸러낼 필요가 없다.
 *
 * 앞의 '·'를 컴포넌트가 들고 있는 이유: 안 찍힌 글에는 구분점도 없어야 하는데, 호출부에 두면
 * 매번 같은 조건을 두 번 쓰게 된다.
 */
export function GroupEditedMark({ at }: { at: string | null | undefined }) {
  if (!at) return null

  return (
    <>
      <span aria-hidden="true">·</span>
      <span title={`${formatAbsoluteTime(at)}에 수정됨`}>수정됨</span>
    </>
  )
}
