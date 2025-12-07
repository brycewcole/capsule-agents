import type { AgentSkill } from "@a2a-js/sdk"
import { tool } from "ai"
import { z } from "zod"

// Default maximum lines to read
const DEFAULT_LIMIT = 2000

// Maximum length for a single line before truncation
const MAX_LINE_LENGTH = 2000

/**
 * Format a line number in cat -n style (right-aligned, 6 chars, tab-separated)
 */
function formatLineNumber(lineNum: number, content: string): string {
  const truncatedContent = content.length > MAX_LINE_LENGTH
    ? content.slice(0, MAX_LINE_LENGTH) + "..."
    : content
  return `${lineNum.toString().padStart(6, " ")}\t${truncatedContent}`
}

/**
 * Handle Deno errors and return user-friendly messages
 */
function handleDenoError(error: unknown, filePath: string): string {
  if (error instanceof Deno.errors.NotFound) {
    return `File not found: ${filePath}`
  }
  if (error instanceof Deno.errors.PermissionDenied) {
    return `Permission denied: ${filePath}`
  }
  if (error instanceof Deno.errors.IsADirectory) {
    return `Path is a directory, not a file: ${filePath}`
  }
  return `Failed to read file: ${
    error instanceof Error ? error.message : String(error)
  }`
}

export const readFileTool = tool({
  description:
    "Read file contents with line numbers and optional pagination. Returns lines in cat -n format (1-indexed line numbers). Use offset and limit for large files.",
  inputSchema: z.object({
    file_path: z.string().describe(
      "Absolute path to the file to read",
    ),
    offset: z.number().int().min(0).optional().describe(
      "Line number to start reading from (0-indexed). Defaults to 0",
    ),
    limit: z.number().int().min(1).optional().describe(
      `Maximum number of lines to read. Defaults to ${DEFAULT_LIMIT}`,
    ),
  }),
  execute: async ({ file_path, offset = 0, limit = DEFAULT_LIMIT }: {
    file_path: string
    offset?: number
    limit?: number
  }) => {
    console.info("📖 Reading file:", { file_path, offset, limit })

    try {
      // Read the entire file content
      const content = await Deno.readTextFile(file_path)

      // Split into lines (handle both \n and \r\n)
      const allLines = content.split(/\r?\n/)
      const totalLines = allLines.length

      // Handle edge case: empty file
      if (totalLines === 0 || (totalLines === 1 && allLines[0] === "")) {
        return {
          success: true,
          file_path,
          content: "",
          total_lines: 0,
          lines_read: 0,
          offset: 0,
          truncated: false,
        }
      }

      // Apply offset and limit
      const startLine = Math.min(offset, totalLines)
      const endLine = Math.min(startLine + limit, totalLines)
      const selectedLines = allLines.slice(startLine, endLine)

      // Format lines with line numbers (1-indexed for display)
      const formattedLines = selectedLines.map((line, index) =>
        formatLineNumber(startLine + index + 1, line)
      )

      const linesRead = selectedLines.length
      const truncated = endLine < totalLines

      // Build result content
      const resultContent = formattedLines.join("\n")

      // Add truncation message if applicable
      const truncationMessage = truncated
        ? `File has more content. Use offset: ${endLine} to read the next section.`
        : undefined

      console.info("✅ File read completed:", {
        file_path,
        total_lines: totalLines,
        lines_read: linesRead,
        truncated,
      })

      return {
        success: true,
        file_path,
        content: resultContent,
        total_lines: totalLines,
        lines_read: linesRead,
        offset: startLine,
        truncated,
        truncation_message: truncationMessage,
      }
    } catch (error: unknown) {
      const errorMessage = handleDenoError(error, file_path)
      console.error("❌ File read error:", { file_path, error: errorMessage })

      return {
        success: false,
        file_path,
        error: errorMessage,
      }
    }
  },
})

export const readFileSkill: AgentSkill = {
  id: "read_file",
  name: "File Reading",
  description:
    "Read file contents with line numbers and optional pagination for large files. Supports reading specific sections using offset and limit parameters.",
  tags: ["file", "read", "filesystem", "content"],
  inputModes: ["text/plain"],
  outputModes: ["text/plain", "application/json"],
}
