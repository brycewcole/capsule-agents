import { tool } from "ai"
import { z } from "zod"
import { ensureDir } from "@std/fs"
import { join, resolve } from "@std/path"
import type { AgentSkill } from "@a2a-js/sdk"
import * as log from "https://deno.land/std@0.203.0/log/mod.ts"

// Use relative path that works both in Docker (/app/agent-workspace) and locally
const AGENT_WORKSPACE = "./agent-workspace"

export const fileAccessTool = tool({
  description: "Access files in the agent workspace.",
  inputSchema: z.object({
    operation: z.enum(["read", "write", "list"]).describe(
      "The file operation to perform.",
    ),
    path: z.string().describe("The path to the file or directory."),
    content: z.string().optional().describe(
      "The content to write to the file.",
    ),
  }),
  execute: async ({ operation, path: relativePath, content }: {
    operation: "read" | "write" | "list"
    path: string
    content?: string
  }) => {
    // Resolve to absolute paths for security check
    const workspaceAbsolute = resolve(AGENT_WORKSPACE)
    const requestedPath = resolve(join(AGENT_WORKSPACE, relativePath))

    // Basic security check to prevent path traversal
    if (!requestedPath.startsWith(workspaceAbsolute)) {
      return { error: "Invalid path - path traversal detected" }
    }

    const absolutePath = requestedPath

    try {
      // Ensure workspace directory exists
      await ensureDir(AGENT_WORKSPACE)

      switch (operation) {
        case "read": {
          return { content: await Deno.readTextFile(absolutePath) }
        }
        case "write": {
          if (content === undefined) {
            return { error: "Content is required for write operation" }
          }

          log.info("📝 File write operation:", {
            requestedPath: relativePath,
            absolutePath,
            workspaceDir: AGENT_WORKSPACE,
            contentLength: content.length,
          })

          // Ensure parent directory exists
          const parentDir = resolve(absolutePath, "..")
          await ensureDir(parentDir)

          // Write the file
          await Deno.writeTextFile(absolutePath, content)

          log.info("✅ File written successfully:", absolutePath)
          return {
            success: true,
            path: absolutePath,
            message: `File written to ${relativePath}`,
          }
        }
        case "list": {
          const files: string[] = []
          for await (const entry of Deno.readDir(absolutePath)) {
            files.push(entry.name)
          }
          return { files }
        }
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error"
      log.error("🚨 File access error:", {
        operation,
        requestedPath: relativePath,
        absolutePath: requestedPath,
        error: message,
        errorType: error instanceof Error
          ? error.constructor.name
          : typeof error,
      })
      return { error: `File ${operation} failed: ${message}` }
    }
  },
})

export const fileAccessSkill: AgentSkill = {
  id: "file-access",
  name: "File Access",
  description:
    "Access files in the agent workspace for reading, writing, and listing operations",
  tags: ["filesystem", "io", "files", "workspace"],
  examples: [
    "Read file contents",
    "Write data to file",
    "List directory contents",
    "Create new files and directories",
  ],
  inputModes: ["text/plain"],
  outputModes: ["text/plain", "application/json"],
}
