import type { AgentSkill } from "@a2a-js/sdk"
import { tool } from "ai"
import { z } from "zod"
import { dirname } from "@std/path"
import { ensureDir } from "@std/fs"

/**
 * Error types for edit operations
 */
type EditErrorType = "not_found" | "wrong_count" | "no_change" | "io_error"

/**
 * Perform safe literal string replacement without regex special character issues.
 * Uses indexOf + slice instead of String.replace to avoid $ sequence interpretation.
 */
function safeLiteralReplace(
  content: string,
  oldString: string,
  newString: string,
): { result: string; count: number } {
  let count = 0
  let result = content
  let index = 0

  while ((index = result.indexOf(oldString, index)) !== -1) {
    result = result.slice(0, index) + newString +
      result.slice(index + oldString.length)
    index += newString.length
    count++
  }

  return { result, count }
}

/**
 * Truncate a string for display in error messages
 */
function truncateForDisplay(str: string, maxLength: number = 50): string {
  if (str.length <= maxLength) return str
  return str.slice(0, maxLength) + "..."
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
  return `IO error: ${error instanceof Error ? error.message : String(error)}`
}

export const editFileTool = tool({
  description:
    "Edit a file by finding and replacing exact string matches. Can also create new files when old_string is empty and the file doesn't exist. Returns the number of replacements made.",
  inputSchema: z.object({
    file_path: z.string().describe(
      "Absolute path to the file to edit",
    ),
    old_string: z.string().describe(
      "The exact string to find and replace. If empty and file doesn't exist, creates a new file with new_string as content",
    ),
    new_string: z.string().describe(
      "The string to replace old_string with",
    ),
    expected_replacements: z.number().int().min(0).optional().describe(
      "Expected number of replacements. If provided, validates that exactly this many replacements are made. Useful for ensuring you're editing the right occurrences",
    ),
  }),
  execute: async (
    { file_path, old_string, new_string, expected_replacements }: {
      file_path: string
      old_string: string
      new_string: string
      expected_replacements?: number
    },
  ) => {
    console.info("✏️ Editing file:", {
      file_path,
      old_string_preview: truncateForDisplay(old_string),
      new_string_preview: truncateForDisplay(new_string),
      expected_replacements,
    })

    try {
      // Check if file exists
      let fileExists = true
      try {
        await Deno.stat(file_path)
      } catch (e) {
        if (e instanceof Deno.errors.NotFound) {
          fileExists = false
        } else {
          throw e
        }
      }

      // Handle new file creation: empty old_string + file doesn't exist
      if (!fileExists && old_string === "") {
        // Ensure parent directory exists
        const dir = dirname(file_path)
        await ensureDir(dir)

        // Create the new file
        await Deno.writeTextFile(file_path, new_string)

        console.info("✅ Created new file:", { file_path })

        return {
          success: true,
          file_path,
          operation: "create" as const,
          replacements_made: 0,
        }
      }

      // If file doesn't exist and old_string is not empty, that's an error
      if (!fileExists) {
        console.error("❌ Cannot edit non-existent file:", { file_path })
        return {
          success: false,
          file_path,
          operation: "edit" as const,
          error:
            `File not found: ${file_path}. To create a new file, use empty old_string.`,
          error_type: "not_found" as EditErrorType,
        }
      }

      // Read existing file content
      const content = await Deno.readTextFile(file_path)

      // Check for no-change scenario (old_string === new_string)
      if (old_string === new_string) {
        console.error("❌ No change: old_string equals new_string")
        return {
          success: false,
          file_path,
          operation: "edit" as const,
          error: "No changes made: old_string equals new_string",
          error_type: "no_change" as EditErrorType,
        }
      }

      // Perform the replacement
      const { result, count } = safeLiteralReplace(
        content,
        old_string,
        new_string,
      )

      // Check if string was found
      if (count === 0) {
        console.error("❌ String not found in file:", {
          file_path,
          old_string_preview: truncateForDisplay(old_string),
        })
        return {
          success: false,
          file_path,
          operation: "edit" as const,
          error: `String not found in file: "${
            truncateForDisplay(old_string)
          }"`,
          error_type: "not_found" as EditErrorType,
        }
      }

      // Validate expected_replacements if provided
      if (
        expected_replacements !== undefined && count !== expected_replacements
      ) {
        console.error("❌ Wrong replacement count:", {
          file_path,
          expected: expected_replacements,
          actual: count,
        })
        return {
          success: false,
          file_path,
          operation: "edit" as const,
          error:
            `Expected ${expected_replacements} replacement(s), found ${count} occurrence(s)`,
          error_type: "wrong_count" as EditErrorType,
          replacements_found: count,
        }
      }

      // Write the updated content
      await Deno.writeTextFile(file_path, result)

      console.info("✅ File edited successfully:", {
        file_path,
        replacements_made: count,
      })

      return {
        success: true,
        file_path,
        operation: "edit" as const,
        replacements_made: count,
      }
    } catch (error: unknown) {
      const errorMessage = handleDenoError(error, file_path)
      console.error("❌ Edit error:", { file_path, error: errorMessage })

      return {
        success: false,
        file_path,
        operation: "edit" as const,
        error: errorMessage,
        error_type: "io_error" as EditErrorType,
      }
    }
  },
})

export const editFileSkill: AgentSkill = {
  id: "edit_file",
  name: "File Editing",
  description:
    "Edit files by finding and replacing exact string matches. Can create new files when the target doesn't exist. Validates replacement counts for safety.",
  tags: ["file", "edit", "write", "filesystem", "modify"],
  inputModes: ["text/plain"],
  outputModes: ["application/json"],
}
