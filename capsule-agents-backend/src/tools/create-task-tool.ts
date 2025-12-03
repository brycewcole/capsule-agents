import { tool } from "ai"
import { z } from "zod"

export const createTaskToolSchema = z.object({})

export type CreateTaskInput = z.infer<typeof createTaskToolSchema>

export const createTaskTool = tool({
  description:
    "Create a task for complex requests that require tool execution, research, or multi-step processing. Use this when the request cannot be answered with a simple, direct response.",
  inputSchema: createTaskToolSchema,
  execute: () => ({
    signal: "create_task",
  }),
})
