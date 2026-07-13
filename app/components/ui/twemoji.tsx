import twemoji from "@twemoji/api"

/**
 * 사용자 텍스트를 HTML로 주입하기 전에 이스케이프한다. twemoji.parse는 입력을 HTML로 보고
 * 이모지만 <img>로 바꾸므로, 이스케이프하지 않으면 사용자가 친 `<script>` 같은 것이 그대로
 * 실행된다. 이모지 유니코드는 이스케이프 대상이 아니라 그대로 남아 parse가 잡는다.
 */
function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

/**
 * 텍스트 안의 이모지를 Twemoji SVG(jsDelivr CDN)로 바꾼 HTML 문자열을 만든다. base 기본값이
 * 이미 jsDelivr이라 URL을 따로 주지 않는다. parse(string)은 순수 문자열 치환이라 서버와
 * 클라이언트가 같은 HTML을 내므로 SSR 하이드레이션이 어긋나지 않는다.
 */
export function toTwemojiHtml(text: string): string {
  return twemoji.parse(escapeHtml(text), { folder: "svg", ext: ".svg" })
}

type TwemojiProps = {
  /** 이모지가 섞인 평문. HTML이 아니다 -- 안에서 이스케이프한다. */
  text: string
} & Omit<React.HTMLAttributes<HTMLSpanElement>, "children" | "dangerouslySetInnerHTML">

/**
 * 텍스트 안의 모든 이모지를 플랫폼 무관하게 통일된 Twemoji 이미지로 그린다. Windows·macOS·
 * Android가 같은 👍를 다르게 그리는 문제를 없앤다. 반응 아이콘부터 메시지·글·댓글 본문까지,
 * 이모지가 나오는 곳은 이걸 통과한다.
 *
 * 기존 렌더가 쓰던 span 속성(className, aria-hidden, title 등)을 그대로 받아, `<span>{text}</span>`를
 * `<Twemoji text={text} />`로 바꾸기만 하면 된다. `<img class="emoji">`의 크기·정렬은 app.css가 잡는다.
 */
export function Twemoji({ text, ...props }: TwemojiProps) {
  return <span {...props} dangerouslySetInnerHTML={{ __html: toTwemojiHtml(text) }} />
}
