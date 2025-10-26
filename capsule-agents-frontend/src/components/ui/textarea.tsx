import * as React from "react"

import { cn } from "@/lib/utils.ts"

interface TextareaProps extends React.ComponentProps<"textarea"> {
  autoResize?: boolean
  maxRows?: number
  minRows?: number
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, autoResize = false, maxRows = 10, minRows = 1, ...props }, ref) => {
    const textareaRef = React.useRef<HTMLTextAreaElement | null>(null)

    const adjustHeight = React.useCallback(() => {
      const textarea = textareaRef.current
      if (!textarea || !autoResize) return

      // Reset height to get proper scrollHeight
      textarea.style.height = "auto"

      // Calculate new height based on content
      const lineHeight = parseInt(getComputedStyle(textarea).lineHeight) || 20
      const paddingTop = parseInt(getComputedStyle(textarea).paddingTop) || 0
      const paddingBottom = parseInt(getComputedStyle(textarea).paddingBottom) || 0
      const minHeight = lineHeight * minRows + paddingTop + paddingBottom
      const maxHeight = lineHeight * maxRows + paddingTop + paddingBottom
      const newHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight)

      textarea.style.height = `${newHeight}px`
    }, [autoResize, maxRows, minRows])

    React.useEffect(() => {
      adjustHeight()
    }, [props.value, adjustHeight])

    const handleRef = React.useCallback(
      (node: HTMLTextAreaElement | null) => {
        textareaRef.current = node
        if (typeof ref === "function") {
          ref(node)
        } else if (ref) {
          ref.current = node
        }
        if (node) {
          adjustHeight()
        }
      },
      [ref, adjustHeight],
    )

    return (
      <textarea
        data-slot="textarea"
        className={cn(
          "border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 flex w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          autoResize ? "resize-none overflow-hidden" : "field-sizing-content min-h-16",
          className,
        )}
        ref={handleRef}
        rows={autoResize ? minRows : undefined}
        {...props}
      />
    )
  },
)

Textarea.displayName = "Textarea"

export { Textarea }
