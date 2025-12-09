import type { AgentSkill } from "@a2a-js/sdk"
import { tool } from "ai"
import { z } from "zod"

// Default maximum results to return
const DEFAULT_MAX_RESULTS = 50

// Timeout for ripgrep command (30 seconds)
const TIMEOUT_MS = 30000

interface GrepMatch {
  file_path: string
  line_number: number
  line_content: string
}

/**
 * Parse ripgrep output in standard format (file:line:content)
 */
function parseRipgrepOutput(output: string, basePath: string): GrepMatch[] {
  const matches: GrepMatch[] = []
  const lines = output.split("\n")

  for (const line of lines) {
    if (!line.trim()) continue

    // Format: file_path:line_number:line_content
    // Need to handle colons in file paths and content carefully
    const firstColonIndex = line.indexOf(":")
    if (firstColonIndex === -1) continue

    const secondColonIndex = line.indexOf(":", firstColonIndex + 1)
    if (secondColonIndex === -1) continue

    const filePath = line.slice(0, firstColonIndex)
    const lineNumberStr = line.slice(firstColonIndex + 1, secondColonIndex)
    const lineContent = line.slice(secondColonIndex + 1)

    const lineNumber = parseInt(lineNumberStr, 10)
    if (isNaN(lineNumber)) continue

    // Convert relative path to absolute if needed
    const fullPath = filePath.startsWith("/")
      ? filePath
      : `${basePath}/${filePath}`

    matches.push({
      file_path: fullPath,
      line_number: lineNumber,
      line_content: lineContent,
    })
  }

  return matches
}

/**
 * Build ripgrep command arguments
 */
function buildRipgrepArgs(
  pattern: string,
  path: string,
  glob?: string,
  maxResults?: number,
): string[] {
  const args: string[] = [
    "-n", // Show line numbers
    "--sortr=modified", // Sort by modification time (most recent first)
    "-e",
    pattern, // Pattern to search
  ]

  // Add glob filter if provided
  if (glob) {
    args.push("--glob", glob)
  }

  // Add max count if provided
  if (maxResults) {
    args.push("--max-count", maxResults.toString())
  }

  // Add search path
  args.push(path)

  return args
}

export const grepFilesTool = tool({
  description:
    "Search files for a regex pattern using ripgrep. Returns matching lines with file paths and line numbers, sorted by file modification time (most recent first).",
  inputSchema: z.object({
    pattern: z.string().describe(
      "Regular expression pattern to search for",
    ),
    path: z.string().optional().describe(
      "Directory or file path to search. Defaults to current working directory",
    ),
    glob: z.string().optional().describe(
      "Glob pattern to filter files (e.g., '*.ts', '**/*.json', '!*.test.ts')",
    ),
    max_results: z.number().int().min(1).max(500).optional().describe(
      `Maximum number of matching lines to return. Defaults to ${DEFAULT_MAX_RESULTS}`,
    ),
  }),
  execute: async ({ pattern, path, glob, max_results = DEFAULT_MAX_RESULTS }: {
    pattern: string
    path?: string
    glob?: string
    max_results?: number
  }) => {
    const searchPath = path || Deno.cwd()

    console.info("🔍 Searching files:", {
      pattern,
      path: searchPath,
      glob,
      max_results,
    })

    try {
      // Build ripgrep arguments
      const args = buildRipgrepArgs(pattern, searchPath, glob, max_results)

      // Create and run the ripgrep command
      const command = new Deno.Command("rg", {
        args,
        stdout: "piped",
        stderr: "piped",
      })

      // Run with timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error("Search timed out after 30 seconds")),
          TIMEOUT_MS,
        )
      })

      const execPromise = command.output()
      const output = await Promise.race([execPromise, timeoutPromise])

      // Decode output
      const stdout = new TextDecoder().decode(output.stdout)
      const stderr = new TextDecoder().decode(output.stderr)

      // Exit code 1 means no matches (not an error)
      // Exit code 2+ means actual error
      if (output.code > 1) {
        console.error("❌ Ripgrep error:", { stderr, exitCode: output.code })
        return {
          success: false,
          pattern,
          path: searchPath,
          error: stderr || `ripgrep exited with code ${output.code}`,
        }
      }

      // Parse the output
      const matches = parseRipgrepOutput(stdout, searchPath)

      // Limit results (in case max-count wasn't effective)
      const limitedMatches = matches.slice(0, max_results)
      const truncated = matches.length > max_results

      console.info("✅ Search completed:", {
        pattern,
        path: searchPath,
        total_matches: limitedMatches.length,
        truncated,
      })

      return {
        success: true,
        pattern,
        path: searchPath,
        matches: limitedMatches,
        total_matches: limitedMatches.length,
        method_used: "ripgrep" as const,
        truncated,
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)

      // Check if ripgrep is not installed
      if (message.includes("ENOENT") || message.includes("not found")) {
        console.error("❌ Ripgrep not found")
        return {
          success: false,
          pattern,
          path: searchPath,
          error:
            "ripgrep (rg) is not installed. Please install it to use file search.",
        }
      }

      console.error("❌ Search error:", {
        pattern,
        path: searchPath,
        error: message,
      })
      return {
        success: false,
        pattern,
        path: searchPath,
        error: `Search failed: ${message}`,
      }
    }
  },
})

export const grepFilesSkill: AgentSkill = {
  id: "grep_files",
  name: "File Search",
  description:
    "Search files for regex patterns using ripgrep. Returns matching lines with file paths and line numbers, sorted by modification time.",
  tags: ["file", "search", "grep", "regex", "find"],
  inputModes: ["text/plain"],
  outputModes: ["application/json"],
}
