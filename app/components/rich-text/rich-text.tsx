import { renderBlock, renderInline } from "~/lib/rich-text/render"
import { cn } from "~/lib/utils"

type RichTextProps = {
  text: string
  mode: "inline" | "block"
} & Omit<React.HTMLAttributes<HTMLElement>, "children" | "dangerouslySetInnerHTML">

export function RichText({ text, mode, className, ...props }: RichTextProps) {
  if (mode === "inline") {
    return (
      <span
        {...props}
        className={className}
        dangerouslySetInnerHTML={{ __html: renderInline(text) }}
      />
    )
  }

  return (
    <div
      {...props}
      className={cn(
        "leading-6 whitespace-pre-wrap [&>*+*]:mt-2",
        "[&_h3]:text-lg [&_h3]:font-bold [&_h4]:text-base [&_h4]:font-semibold",
        "[&_em]:italic [&_strong]:font-semibold",
        className
      )}
      dangerouslySetInnerHTML={{ __html: renderBlock(text) }}
    />
  )
}
