import { BoldIcon, EyeIcon, Heading1Icon, Heading2Icon, ItalicIcon, PencilIcon } from "lucide-react"
import { useState } from "react"

import { RichText } from "~/components/rich-text/rich-text"
import { Button } from "~/components/ui/button"
import { useMarkdownShortcuts } from "~/hooks/use-markdown-shortcuts"
import { cn } from "~/lib/utils"

export function GroupContentEditor({
  contentRef,
  defaultValue,
}: {
  contentRef: React.RefObject<HTMLTextAreaElement | null>
  defaultValue?: string
}) {
  const { onKeyDown, toggleHeading, wrap } = useMarkdownShortcuts(contentRef)
  const [isPreview, setIsPreview] = useState(false)
  const [previewText, setPreviewText] = useState("")

  const togglePreview = () => {
    if (!isPreview) setPreviewText(contentRef.current?.value ?? "")
    setIsPreview((on) => !on)
  }

  const keepSelection = (event: React.MouseEvent) => event.preventDefault()

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {isPreview ? (
        previewText.trim() ? (
          <RichText mode="block" text={previewText} className="min-h-40 flex-1 py-2 text-sm" />
        ) : (
          <p className="text-muted-foreground min-h-40 flex-1 py-2 text-sm">
            미리 볼 내용이 없습니다.
          </p>
        )
      ) : null}
      <textarea
        ref={contentRef}
        onKeyDown={onKeyDown}
        defaultValue={defaultValue}
        placeholder="내용을 입력하세요…"
        className={cn(
          "placeholder:text-muted-foreground min-h-40 flex-1 resize-none border-0 bg-transparent py-2 text-sm leading-6 outline-none",
          isPreview && "hidden"
        )}
      />

      <div className="text-muted-foreground flex items-center gap-0.5 border-t py-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="굵게 (Ctrl+B)"
          onMouseDown={keepSelection}
          onClick={() => wrap("**")}
          disabled={isPreview}
        >
          <BoldIcon />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="기울임 (Ctrl+I)"
          onMouseDown={keepSelection}
          onClick={() => wrap("*")}
          disabled={isPreview}
        >
          <ItalicIcon />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="큰 제목"
          onMouseDown={keepSelection}
          onClick={() => toggleHeading(1)}
          disabled={isPreview}
        >
          <Heading1Icon />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="작은 제목"
          onMouseDown={keepSelection}
          onClick={() => toggleHeading(2)}
          disabled={isPreview}
        >
          <Heading2Icon />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto"
          aria-pressed={isPreview}
          onClick={togglePreview}
        >
          {isPreview ? (
            <>
              <PencilIcon data-icon="inline-start" />
              편집
            </>
          ) : (
            <>
              <EyeIcon data-icon="inline-start" />
              미리보기
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
