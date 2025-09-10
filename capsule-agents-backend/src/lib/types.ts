import { z } from "zod"

export const ToolCallDataSchema = z.object({
  type: z.literal("tool-call"),
  toolCallId: z.string(),
  toolName: z.string(),
  input: z.unknown(),
}).catchall(z.unknown())

export type ToolCallData = z.infer<typeof ToolCallDataSchema>

export const isToolCallData = (u: unknown): u is ToolCallData =>
  ToolCallDataSchema.safeParse(u).success

export const ToolResultDataSchema = z.object({
  type: z.literal("tool-result"),
  toolCallId: z.string(),
  toolName: z.string(),
  output: z.unknown(),
}).catchall(z.unknown())

export type ToolResultData = z.infer<typeof ToolResultDataSchema>

export const isToolResultData = (u: unknown): u is ToolResultData =>
  ToolResultDataSchema.safeParse(u).success
