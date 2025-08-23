import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { XIcon } from "lucide-react"
import { cn } from "@/lib/utils.ts"

function Sheet(
  { ...props }: React.ComponentProps<typeof DialogPrimitive.Root>,
) {
  return <DialogPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetPortal(
  { ...props }: React.ComponentProps<typeof DialogPrimitive.Portal>,
) {
  return <DialogPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetClose(
  { ...props }: React.ComponentProps<typeof DialogPrimitive.Close>,
) {
  return <DialogPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetOverlay(
  { className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>,
) {
  return (
    <DialogPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        className,
      )}
      {...props}
    />
  )
}

function SheetContent(
  {
    className,
    children,
    side = "right",
    hideCloseButton,
    container,
    withOverlay = true,
    ...props
  }: React.ComponentProps<typeof DialogPrimitive.Content> & {
    side?: "right" | "left" | "top" | "bottom"
    hideCloseButton?: boolean
    container?: HTMLElement | null
    withOverlay?: boolean
  },
) {
  const sideClasses = {
    right:
      "inset-y-0 right-0 h-full w-[420px] max-w-[calc(100%-4rem)] border-l",
    left: "inset-y-0 left-0 h-full w-[420px] max-w-[calc(100%-4rem)] border-r",
    top: "inset-x-0 top-0 w-full max-h-[80vh] border-b",
    bottom: "inset-x-0 bottom-0 w-full max-h-[80vh] border-t",
  } as const

  const animationClasses = {
    right:
      "data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right",
    left:
      "data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left",
    top:
      "data-[state=open]:slide-in-from-top data-[state=closed]:slide-out-to-top",
    bottom:
      "data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom",
  } as const

  return (
    <SheetPortal container={container as Element | null}>
      {withOverlay && <SheetOverlay />}
      <DialogPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          "fixed z-50 bg-background p-0 shadow-lg outline-none data-[state=open]:animate-in data-[state=closed]:animate-out duration-200",
          sideClasses[side],
          animationClasses[side],
          className,
        )}
        {...props}
      >
        {children}
        {!hideCloseButton && (
          <SheetClose className="absolute right-4 top-4 rounded-xs opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
            <XIcon className="size-4" />
            <span className="sr-only">Close</span>
          </SheetClose>
        )}
      </DialogPrimitive.Content>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-2 p-4 border-b", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("flex items-center gap-2 p-4 border-t", className)}
      {...props}
    />
  )
}

function SheetTitle(
  { className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>,
) {
  return (
    <DialogPrimitive.Title
      data-slot="sheet-title"
      className={cn("text-base font-semibold", className)}
      {...props}
    />
  )
}

function SheetDescription(
  { className, ...props }: React.ComponentProps<
    typeof DialogPrimitive.Description
  >,
) {
  return (
    <DialogPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
}
