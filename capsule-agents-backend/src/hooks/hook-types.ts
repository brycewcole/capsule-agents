import { z } from "zod"
import type * as A2A from "@a2a-js/sdk"

// Base schema for all hooks (common fields)
export const BaseHookSchema = z.object({
  type: z.string(),
  enabled: z.boolean().default(true),
})

// Discord-specific hook configuration
export const DiscordHookConfigSchema = BaseHookSchema.extend({
  type: z.literal("discord"),
  webhookUrl: z.string().url("Invalid Discord webhook URL"),
})

// Union type for all hook configurations (add new integrations here)
export const HookConfigSchema = z.discriminatedUnion("type", [
  DiscordHookConfigSchema,
])

// Array of hooks for agent/context/schedule configuration
export const HooksArraySchema = z.array(HookConfigSchema).default([])

// TypeScript types derived from schemas
export type BaseHookConfig = z.infer<typeof BaseHookSchema>
export type DiscordHookConfig = z.infer<typeof DiscordHookConfigSchema>
export type HookConfig = z.infer<typeof HookConfigSchema>

// Task completion payload passed to hooks
export interface TaskCompletionPayload {
  task: A2A.Task
  artifacts: A2A.Artifact[]
  contextId: string
  completedAt: string
  // Source of the task (regular, scheduled, etc.)
  source?: {
    type: "schedule" | "api" | "user"
    scheduleId?: string
    scheduleName?: string
  }
}

// Hook execution result for logging/debugging
export interface HookExecutionResult {
  hookType: string
  success: boolean
  error?: string
  executionTimeMs: number
}

// Interface that all hook implementations must follow (Strategy pattern)
export interface OutputHook {
  readonly type: string
  execute(payload: TaskCompletionPayload): Promise<HookExecutionResult>
}
