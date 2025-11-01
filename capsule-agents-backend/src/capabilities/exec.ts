import type { AgentSkill } from "@a2a-js/sdk"
import { tool } from "ai"
import { z } from "zod"

// Default working directory for command execution
const DEFAULT_WORKING_DIR = "./agent-workspace"

// Default timeout in milliseconds (30 seconds)
const DEFAULT_TIMEOUT = 30000

export const execTool = tool({
  description:
    "Execute shell commands in the agent's container. Can run any command like ls, cat, grep, find, etc.",
  inputSchema: z.object({
    command: z.string().describe("The shell command to execute."),
    workingDirectory: z.string().optional().describe(
      "Optional working directory for command execution. Defaults to ./agent-workspace",
    ),
  }),
  execute: async ({ command, workingDirectory }: {
    command: string
    workingDirectory?: string
  }) => {
    const cwd = workingDirectory || DEFAULT_WORKING_DIR

    console.info("🚀 Executing command:", {
      command,
      cwd,
    })

    try {
      // Create the subprocess
      const proc = new Deno.Command("sh", {
        args: ["-c", command],
        cwd,
        stdout: "piped",
        stderr: "piped",
      })

      // Run with timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error("Command execution timed out")),
          DEFAULT_TIMEOUT,
        )
      })

      const execPromise = proc.output()
      const output = await Promise.race([execPromise, timeoutPromise])

      // Decode stdout and stderr
      const stdout = new TextDecoder().decode(output.stdout)
      const stderr = new TextDecoder().decode(output.stderr)
      const exitCode = output.code

      console.info("✅ Command completed:", {
        command,
        exitCode,
        stdoutLength: stdout.length,
        stderrLength: stderr.length,
      })

      // Return structured result
      return {
        success: exitCode === 0,
        exitCode,
        stdout,
        stderr,
        command,
        workingDirectory: cwd,
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error"
      console.error("🚨 Command execution error:", {
        command,
        cwd,
        error: message,
        errorType: error instanceof Error
          ? error.constructor.name
          : typeof error,
      })
      return {
        success: false,
        error: `Command execution failed: ${message}`,
        command,
        workingDirectory: cwd,
      }
    }
  },
})

export const execSkill: AgentSkill = {
  id: "exec",
  name: "Command Execution",
  description:
    "Execute shell commands in the agent's container environment for file manipulation, data processing, and system operations",
  tags: ["shell", "command", "exec", "cli", "bash"],
  inputModes: ["text/plain"],
  outputModes: ["text/plain", "application/json"],
}
