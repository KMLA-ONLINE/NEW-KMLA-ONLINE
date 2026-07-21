import { useCallback } from "react"

type HeadingLevel = 1 | 2

type LineRange = {
  start: number
  end: number
}

type HeadingToggle = {
  replacement: string
  selectionStart: number
  selectionEnd: number
} & LineRange

function getSelectedLineRange(
  value: string,
  selectionStart: number,
  selectionEnd: number
): LineRange {
  const selectedEnd =
    selectionEnd > selectionStart && value[selectionEnd - 1] === "\n"
      ? selectionEnd - 1
      : selectionEnd
  const start = value.lastIndexOf("\n", Math.max(0, selectionStart - 1)) + 1
  const nextLineBreak = value.indexOf("\n", selectedEnd)

  return { start, end: nextLineBreak === -1 ? value.length : nextLineBreak }
}

function headingPrefix(line: string): string {
  return /^#{1,2}\s+/.exec(line)?.[0] ?? ""
}

function mapPosition(
  lines: string[],
  prefixes: string[],
  remove: boolean,
  markerLength: number,
  position: number
): number {
  let oldOffset = 0
  let newOffset = 0

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const lineEnd = oldOffset + line.length
    const newPrefixLength = remove ? 0 : markerLength

    if (position <= lineEnd) {
      const column = position - oldOffset
      return (
        newOffset +
        (column <= prefixes[index].length
          ? newPrefixLength
          : newPrefixLength + column - prefixes[index].length)
      )
    }

    oldOffset = lineEnd + 1
    newOffset += line.length - prefixes[index].length + newPrefixLength + 1
  }

  return newOffset
}

export function toggleHeadingText(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  level: HeadingLevel
): HeadingToggle {
  const range = getSelectedLineRange(value, selectionStart, selectionEnd)
  const lines = value.slice(range.start, range.end).split("\n")
  const prefixes = lines.map(headingPrefix)
  const marker = "#".repeat(level) + " "
  const remove = lines.every((line) => line.startsWith(marker))
  const replacement = lines
    .map((line, index) =>
      remove ? line.slice(prefixes[index].length) : marker + line.slice(prefixes[index].length)
    )
    .join("\n")

  return {
    ...range,
    replacement,
    selectionStart: mapPosition(
      lines,
      prefixes,
      remove,
      marker.length,
      selectionStart - range.start
    ),
    selectionEnd: mapPosition(lines, prefixes, remove, marker.length, selectionEnd - range.start),
  }
}

function toggleHeading(textarea: HTMLTextAreaElement, level: HeadingLevel) {
  const next = toggleHeadingText(
    textarea.value,
    textarea.selectionStart,
    textarea.selectionEnd,
    level
  )

  textarea.setSelectionRange(next.start, next.end)
  document.execCommand("insertText", false, next.replacement)
  textarea.setSelectionRange(next.start + next.selectionStart, next.start + next.selectionEnd)
}

function toggleWrap(textarea: HTMLTextAreaElement, marker: string) {
  const { selectionStart, selectionEnd, value } = textarea
  const selected = value.slice(selectionStart, selectionEnd)
  const before = value.slice(Math.max(0, selectionStart - marker.length), selectionStart)
  const after = value.slice(selectionEnd, selectionEnd + marker.length)

  if (before === marker && after === marker) {
    textarea.setSelectionRange(selectionStart - marker.length, selectionEnd + marker.length)
    document.execCommand("insertText", false, selected)
    textarea.setSelectionRange(selectionStart - marker.length, selectionEnd - marker.length)
    return
  }

  document.execCommand("insertText", false, `${marker}${selected}${marker}`)
  if (selectionStart === selectionEnd) {
    const caret = selectionStart + marker.length
    textarea.setSelectionRange(caret, caret)
  } else {
    textarea.setSelectionRange(selectionStart + marker.length, selectionEnd + marker.length)
  }
}

export function useMarkdownShortcuts(ref: React.RefObject<HTMLTextAreaElement | null>) {
  const wrap = useCallback(
    (marker: string) => {
      const textarea = ref.current
      if (!textarea) return
      textarea.focus()
      toggleWrap(textarea, marker)
    },
    [ref]
  )

  const onKeyDown = useCallback((event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return
    const key = event.key.toLowerCase()
    const marker = key === "b" ? "**" : key === "i" ? "*" : null
    if (!marker) return
    event.preventDefault()
    event.stopPropagation()
    toggleWrap(event.currentTarget, marker)
  }, [])

  const toggleHeadingAtSelection = useCallback(
    (level: HeadingLevel) => {
      const textarea = ref.current
      if (!textarea) return
      textarea.focus()
      toggleHeading(textarea, level)
    },
    [ref]
  )

  return { onKeyDown, toggleHeading: toggleHeadingAtSelection, wrap }
}
