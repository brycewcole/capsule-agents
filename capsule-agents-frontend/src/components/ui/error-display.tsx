import { AlertCircle, AlertTriangle, Info, RefreshCw, X } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx"
import { Button } from "@/components/ui/button.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import { cn } from "@/lib/utils.ts"

// Error types matching backend JSON-RPC errors
export interface JSONRPCError {
  code: number
  message: string
  data?: unknown
  user_message?: string
  recovery_action?: string
}

export interface ErrorDisplayProps {
  error: JSONRPCError | Error | string
  title?: string
  onRetry?: () => void
  onDismiss?: () => void
  className?: string
  variant?: "destructive" | "warning" | "info"
}

export function ErrorDisplay({
  error,
  title,
  onRetry,
  onDismiss,
  className,
  variant = "destructive",
}: ErrorDisplayProps) {
  const getErrorDetails = () => {
    if (typeof error === "string") {
      return {
        message: error,
        userMessage: error,
        recoveryAction: undefined,
        code: undefined,
      }
    }

    if (error instanceof Error) {
      return {
        message: error.message,
        userMessage: error.message,
        recoveryAction: undefined,
        code: undefined,
      }
    }

    // JSONRPCError
    return {
      message: error.message,
      userMessage: error.user_message || error.message,
      recoveryAction: error.recovery_action,
      code: error.code,
    }
  }

  const { userMessage, recoveryAction, code } = getErrorDetails()

  const getIcon = () => {
    switch (variant) {
      case "warning":
        return <AlertTriangle className="h-4 w-4" />
      case "info":
        return <Info className="h-4 w-4" />
      default:
        return <AlertCircle className="h-4 w-4" />
    }
  }

  const getAlertVariant = () => {
    switch (variant) {
      case "warning":
        return "default"
      case "info":
        return "default"
      default:
        return "destructive"
    }
  }

  return (
    <Alert variant={getAlertVariant()} className={cn("relative", className)}>
      {getIcon()}
      <AlertTitle className="flex items-center justify-between">
        {title || "Error"}
        {onDismiss && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onDismiss}
            className="h-6 w-6 p-0"
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </AlertTitle>
      <AlertDescription className="mt-2">
        <p className="text-sm">{userMessage}</p>
        {code && (
          <p className="text-xs text-muted-foreground mt-2">
            <strong>Error Code:</strong> {code}
          </p>
        )}
        {recoveryAction && (
          <p className="text-xs text-muted-foreground mt-2">
            💡 <strong>Suggested Action:</strong> {recoveryAction}
          </p>
        )}

        {onRetry && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            className="mt-3"
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Try Again
          </Button>
        )}
      </AlertDescription>
    </Alert>
  )
}

// Compact error display for inline use
export function InlineErrorDisplay({
  error,
  onRetry,
  className,
}: {
  error: JSONRPCError | Error | string
  onRetry?: () => void
  className?: string
}) {
  const getErrorMessage = () => {
    if (typeof error === "string") return error
    if (error instanceof Error) return error.message
    return error.user_message || error.message
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2 text-sm text-destructive",
        className,
      )}
    >
      <AlertCircle className="h-4 w-4" />
      <span>{getErrorMessage()}</span>
      {onRetry && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onRetry}
          className="h-6 px-2"
        >
          <RefreshCw className="h-3 w-3" />
        </Button>
      )}
    </div>
  )
}

// Error card for prominent display
export function ErrorCard({
  error,
  title = "Something went wrong",
  onRetry,
  onDismiss,
  className,
}: ErrorDisplayProps) {
  const getErrorDetails = () => {
    if (typeof error === "string") {
      return {
        message: error,
        userMessage: error,
        recoveryAction: undefined,
        code: undefined,
      }
    }

    if (error instanceof Error) {
      return {
        message: error.message,
        userMessage: error.message,
        recoveryAction: undefined,
        code: undefined,
      }
    }

    return {
      message: error.message,
      userMessage: error.user_message || error.message,
      recoveryAction: error.recovery_action,
      code: error.code,
    }
  }

  const { userMessage, recoveryAction, code } = getErrorDetails()

  return (
    <Card className={cn("border-destructive", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-destructive">
          <AlertCircle className="h-5 w-5" />
          {title}
          {onDismiss && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDismiss}
              className="ml-auto h-6 w-6 p-0"
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <CardDescription className="text-foreground">
          {userMessage}
        </CardDescription>
        {code && (
          <p className="text-xs text-muted-foreground mt-2">
            <strong>Error Code:</strong> {code}
          </p>
        )}
        {recoveryAction && (
          <p className="text-sm text-muted-foreground mt-2">
            💡 <strong>Suggested Action:</strong> {recoveryAction}
          </p>
        )}

        {onRetry && (
          <Button
            variant="outline"
            onClick={onRetry}
            className="mt-3"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

// Error boundary fallback component
export function ErrorBoundaryFallback({
  error,
  resetErrorBoundary,
}: {
  error: Error
  resetErrorBoundary: () => void
}) {
  return (
    <div className="flex items-center justify-center min-h-[400px] p-4">
      <ErrorCard
        error={error}
        title="Application Error"
        onRetry={resetErrorBoundary}
        className="max-w-md"
      />
    </div>
  )
}
