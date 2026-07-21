import twemoji from "@twemoji/api"

import { escapeHtml } from "~/lib/rich-text/escape"

const SHIELD_STAR = String.fromCharCode(0, 1)
const SHIELD_BACKSLASH = String.fromCharCode(0, 2)
const BOLD_PATTERN = /\*\*(?=\S)(.+?)(?<=\S)\*\*/g
const ITALIC_PATTERN = /\*(?=\S)([^*]+?)(?<=\S)\*/g

type InlineFormatter = {
  bold: (content: string) => string
  italic: (content: string) => string
}

const HTML_INLINE_FORMATTER: InlineFormatter = {
  bold: (content) => `<strong>${content}</strong>`,
  italic: (content) => `<em>${content}</em>`,
}

const PLAIN_TEXT_INLINE_FORMATTER: InlineFormatter = {
  bold: (content) => content,
  italic: (content) => content,
}

function transformInline(text: string, formatter: InlineFormatter): string {
  const shielded = text.replaceAll("\\\\", SHIELD_BACKSLASH).replaceAll("\\*", SHIELD_STAR)

  return shielded
    .replace(BOLD_PATTERN, (_, content: string) => formatter.bold(content))
    .replace(ITALIC_PATTERN, (_, content: string) => formatter.italic(content))
    .replaceAll(SHIELD_STAR, "*")
    .replaceAll(SHIELD_BACKSLASH, "\\")
}

function headingLevel(line: string): 0 | 1 | 2 {
  if (/^##\s+\S/.test(line)) return 2
  if (/^#\s+\S/.test(line)) return 1
  return 0
}

function toTwemoji(html: string): string {
  return twemoji.parse(html, { folder: "svg", ext: ".svg" })
}

export function renderBlock(text: string): string {
  const lines = escapeHtml(text).split("\n")
  const blocks: string[] = []
  let paragraph: string[] = []

  const flushParagraph = () => {
    if (paragraph.length === 0) return
    blocks.push(`<p>${transformInline(paragraph.join("\n"), HTML_INLINE_FORMATTER)}</p>`)
    paragraph = []
  }

  for (const line of lines) {
    const level = headingLevel(line)
    if (level > 0) {
      flushParagraph()
      const content = transformInline(line.replace(/^#{1,2}\s+/, ""), HTML_INLINE_FORMATTER)
      blocks.push(`<h${level + 2}>${content}</h${level + 2}>`)
    } else {
      paragraph.push(line)
    }
  }
  flushParagraph()

  return toTwemoji(blocks.join(""))
}

export function renderInline(text: string): string {
  const compact = escapeHtml(text)
    .replace(/^#{1,2}\s+/gm, "")
    .replace(/\n{2,}/g, "\n")
  return toTwemoji(transformInline(compact, HTML_INLINE_FORMATTER))
}

export function toPlainTextPreview(text: string): string {
  return transformInline(text.replace(/^#{1,2}\s+/gm, ""), PLAIN_TEXT_INLINE_FORMATTER)
}
