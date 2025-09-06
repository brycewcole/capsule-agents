import type { AgentSkill } from "@a2a-js/sdk"
import { tool } from "ai"
import { z } from "zod"

const memoryStore: Record<string, string> = {}

export const memoryTool = tool({
  description: "Store and retrieve information in memory.",
  inputSchema: z.object({
    operation: z.enum(["set", "get"]).describe(
      "The memory operation to perform.",
    ),
    key: z.string().describe("The key to store or retrieve."),
    value: z.string().optional().describe("The value to store."),
  }),
  execute: ({ operation, key, value }) => {
    switch (operation) {
      case "set":
        if (value === undefined) {
          return { error: "Value is required for set operation" }
        }
        memoryStore[key] = value
        return { success: true }
      case "get":
        return { value: memoryStore[key] }
    }
  },
})

export const memorySkill: AgentSkill = {
  id: "memory",
  name: "Memory Storage",
  description:
    "Store and retrieve information in memory for persistence across conversations",
  tags: ["memory", "persistence", "storage", "data"],
  examples: [
    "Store important information",
    "Retrieve past conversations",
    "Remember user preferences",
    "Cache frequently used data",
    "Maintain context between sessions",
  ],
  inputModes: ["text/plain"],
  outputModes: ["text/plain", "application/json"],
}
