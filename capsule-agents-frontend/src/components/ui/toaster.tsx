import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast.tsx"
import { useToast } from "@/hooks/use-toast.ts"
import type { ReactNode } from "react"

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }: {
        id: string
        title?: ReactNode
        description?: ReactNode
        action?: ReactNode
        [key: string]: unknown
      }, index: number) {
        return (
          <Toast key={id} {...props} className={index > 0 ? "mt-2" : ""}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}