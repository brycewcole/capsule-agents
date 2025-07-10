import * as React from "react"
import { toast } from "@/hooks/use-toast"

// Error types matching backend JSON-RPC errors
export interface JSONRPCError {
  code: number
  message: string
  data?: any
  user_message?: string
  recovery_action?: string
}

export interface APIError {
  error: JSONRPCError
}

// Check if an error is a JSON-RPC error
export function isJSONRPCError(error: unknown): error is JSONRPCError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "message" in error &&
    typeof (error as any).code === "number" &&
    typeof (error as any).message === "string"
  )
}

// Check if an error is an API error response
export function isAPIError(error: unknown): error is APIError {
  return (
    typeof error === "object" &&
    error !== null &&
    "error" in error &&
    isJSONRPCError((error as any).error)
  )
}

// Extract error message from various error types
export function getErrorMessage(error: unknown): string {
  if (typeof error === "string") {
    return error
  }

  if (error instanceof Error) {
    return error.message
  }

  if (isJSONRPCError(error)) {
    return error.user_message || error.message
  }

  if (isAPIError(error)) {
    return error.error.user_message || error.error.message
  }

  return "An unknown error occurred"
}

// Extract recovery action from error
export function getRecoveryAction(error: unknown): string | undefined {
  if (isJSONRPCError(error)) {
    return error.recovery_action
  }

  if (isAPIError(error)) {
    return error.error.recovery_action
  }

  return undefined
}

// Get error code from error
export function getErrorCode(error: unknown): number | undefined {
  if (isJSONRPCError(error)) {
    return error.code
  }

  if (isAPIError(error)) {
    return error.error.code
  }

  return undefined
}

// Show error toast with appropriate styling
export function showErrorToast(error: unknown, options?: {
  title?: string
  action?: React.ReactElement
}) {
  const message = getErrorMessage(error)
  const recoveryAction = getRecoveryAction(error)
  const code = getErrorCode(error)
  
  // Build clean description
  let description = message
  
  // Add error code if available
  if (code) {
    description += `\n\nError Code: ${code}`
  }
  
  // Add recovery action if available
  if (recoveryAction) {
    description += `\n\n💡 ${recoveryAction}`
  }

  toast({
    title: options?.title || "Error",
    description,
    variant: "default",
    action: options?.action as any,
  })
}

// Show success toast
export function showSuccessToast(message: string, options?: {
  title?: string
  action?: React.ReactElement
}) {
  toast({
    title: options?.title || "Success",
    description: message,
    variant: "default",
    action: options?.action as any,
  })
}

// Show warning toast
export function showWarningToast(message: string, options?: {
  title?: string
  action?: React.ReactElement
}) {
  toast({
    title: options?.title || "Warning",
    description: message,
    variant: "default",
    action: options?.action as any,
  })
}

// Show info toast
export function showInfoToast(message: string, options?: {
  title?: string
  action?: React.ReactElement
}) {
  toast({
    title: options?.title || "Info",
    description: message,
    variant: "default",
    action: options?.action as any,
  })
}

// Determine if error is recoverable
export function isRecoverableError(error: unknown): boolean {
  const code = getErrorCode(error)

  if (!code) return false

  // These errors are typically recoverable
  const recoverableErrors = [
    -32008, // Rate limit exceeded
    -32009, // Service unavailable
    -32014, // Request timeout
    -32015, // Network error
    -32010, // Invalid session (can re-authenticate)
    -32013, // Validation failed (can fix input)
    -32016, // MCP server error (server might come back up)
    -32018, // MCP configuration error (can be fixed)
    -32019, // A2A agent error (agent might come back up)
    -32020, // A2A agent not found (might be temporary)
  ]

  return recoverableErrors.includes(code)
}

// Determine if error requires authentication
export function requiresAuth(error: unknown): boolean {
  const code = getErrorCode(error)
  return code === -32006 || code === -32010 // Authentication required or invalid session
}

// Determine if error is a permission issue
export function isPermissionError(error: unknown): boolean {
  const code = getErrorCode(error)
  return code === -32007 // Authorization error
}

// Determine if error is MCP-related
export function isMCPError(error: unknown): boolean {
  const code = getErrorCode(error)
  return code === -32016 || code === -32017 || code === -32018 // MCP errors
}

// Determine if error is A2A agent-related
export function isA2AError(error: unknown): boolean {
  const code = getErrorCode(error)
  return code === -32019 || code === -32020 // A2A agent errors
}

// Get MCP-specific error guidance
export function getMCPErrorGuidance(error: unknown): string | undefined {
  const code = getErrorCode(error)
  
  switch (code) {
    case -32016:
      return "Check if the MCP server is running and the URL is correct"
    case -32017:
      return "Verify the tool exists and has proper permissions"
    case -32018:
      return "Review MCP server configuration and restart if needed"
    default:
      return undefined
  }
}

// Create a user-friendly error message based on error code
export function createUserFriendlyErrorMessage(error: unknown): string {
  const code = getErrorCode(error)
  const baseMessage = getErrorMessage(error)

  if (!code) return baseMessage

  // Add context based on error code
  const contextMap: Record<number, string> = {
    [-32006]: "Please log in to continue.",
    [-32007]: "You don't have permission to perform this action.",
    [-32008]: "Too many requests. Please wait a moment and try again.",
    [-32009]: "The service is temporarily unavailable. Please try again later.",
    [-32010]: "Your session has expired. Please log in again.",
    [-32013]: "Please check your input and try again.",
    [-32014]: "The request timed out. Please try again.",
    [-32015]: "Connection failed. Please check your internet connection.",
    [-32016]: "MCP server is not running or unreachable. Start the MCP server and try again.",
    [-32017]: "The requested tool operation failed. Check tool configuration.",
    [-32018]: "MCP server configuration is invalid. Check settings and server URL.",
    [-32019]: "A2A agent is not reachable. Check the agent URL and network connection.",
    [-32020]: "A2A agent endpoint not found (404). Verify the URL and agent deployment.",
  }

  const context = contextMap[code]
  return context ? `${baseMessage} ${context}` : baseMessage
}

// Error boundary helper
export class ErrorBoundary extends Error {
  public originalError?: unknown

  constructor(message: string, originalError?: unknown) {
    super(message)
    this.name = "ErrorBoundary"
    this.originalError = originalError
  }
}