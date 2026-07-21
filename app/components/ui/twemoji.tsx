import twemoji from "@twemoji/api"

import { escapeHtml } from "~/lib/rich-text/escape"

/**
 * 텍스트 안의 이모지를 Twemoji SVG(jsDelivr CDN)로 바꾼 HTML 문자열을 만든다. base 기본값이
 * 이미 jsDelivr이라 URL을 따로 주지 않는다. parse(string)은 DOM 없이 도는 순수 문자열 치환이라
 * (이 앱은 ssr:false인 SPA라 어차피 브라우저에서만 돈다) 같은 입력이면 항상 같은 HTML을 낸다.
 */
export function toTwemojiHtml(text: string): string {
  return twemoji.parse(escapeHtml(text), { folder: "svg", ext: ".svg" })
}

type TwemojiProps = {
  text: string
} & Omit<React.HTMLAttributes<HTMLSpanElement>, "children" | "dangerouslySetInnerHTML">

export function Twemoji({ text, ...props }: TwemojiProps) {
  return <span {...props} dangerouslySetInnerHTML={{ __html: toTwemojiHtml(text) }} />
}
