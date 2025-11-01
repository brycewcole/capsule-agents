import { join, normalize, resolve } from "@std/path"
import { walk } from "@std/fs"
import { ensureDir } from "@std/fs"
import { getLogger } from "@std/log"

const logger = getLogger("workspace-service")

const WORKSPACE_DIR = Deno.env.get("WORKSPACE_DIR") || "/app/agent-workspace"

export interface WorkspaceFile {
  path: string
  name: string
  type: "file" | "directory"
  size?: number
}

/**
 * Validates that a path is safe and within the workspace directory
 */
function validatePath(filePath: string): string {
  const normalizedPath = normalize(filePath)
  const resolvedPath = resolve(WORKSPACE_DIR, normalizedPath)
  const workspaceResolved = resolve(WORKSPACE_DIR)

  if (!resolvedPath.startsWith(workspaceResolved)) {
    throw new Error("Path traversal detected - path must be within workspace")
  }

  return resolvedPath
}

/**
 * List all files in the workspace directory recursively
 */
export async function listWorkspaceFiles(): Promise<WorkspaceFile[]> {
  const files: WorkspaceFile[] = []

  try {
    logger.info(`Listing files in workspace directory: ${WORKSPACE_DIR}`)
    await ensureDir(WORKSPACE_DIR)

    // Check if directory exists and is readable
    try {
      const dirStat = await Deno.stat(WORKSPACE_DIR)
      logger.info(`Workspace directory exists: ${dirStat.isDirectory}`)
    } catch (statError) {
      logger.error(`Cannot stat workspace directory: ${statError}`)
      throw statError
    }

    for await (
      const entry of walk(WORKSPACE_DIR, {
        includeFiles: true,
        includeDirs: true,
      })
    ) {
      // Skip the root directory itself
      if (entry.path === WORKSPACE_DIR) continue

      const relativePath = entry.path.substring(WORKSPACE_DIR.length + 1)
      logger.info(
        `Found entry: ${relativePath} (${entry.isFile ? "file" : "directory"})`,
      )

      let size: number | undefined
      if (entry.isFile) {
        try {
          const stat = await Deno.stat(entry.path)
          size = stat.size
        } catch {
          size = undefined
        }
      }

      files.push({
        path: relativePath,
        name: entry.name,
        type: entry.isFile ? "file" : "directory",
        size,
      })
    }

    logger.info(`Total files found: ${files.length}`)

    return files.sort((a, b) => {
      // Sort directories first, then by path
      if (a.type !== b.type) {
        return a.type === "directory" ? -1 : 1
      }
      return a.path.localeCompare(b.path)
    })
  } catch (error) {
    logger.error(`Error listing workspace files: ${error}`)
    throw error
  }
}

/**
 * Upload a file to the workspace
 */
export async function uploadFile(
  relativePath: string,
  content: Uint8Array | string,
): Promise<void> {
  const fullPath = validatePath(relativePath)

  try {
    // Ensure parent directory exists
    const dir = join(fullPath, "..")
    await ensureDir(dir)

    // Write the file
    if (typeof content === "string") {
      await Deno.writeTextFile(fullPath, content)
    } else {
      await Deno.writeFile(fullPath, content)
    }

    logger.info(`Uploaded file: ${relativePath}`)
  } catch (error) {
    logger.error(`Error uploading file ${relativePath}: ${error}`)
    throw error
  }
}

/**
 * Read a file from the workspace
 */
export async function readFile(relativePath: string): Promise<Uint8Array> {
  const fullPath = validatePath(relativePath)

  try {
    const content = await Deno.readFile(fullPath)
    return content
  } catch (error) {
    logger.error(`Error reading file ${relativePath}: ${error}`)
    throw error
  }
}

/**
 * Delete a file or directory from the workspace
 */
export async function deleteFile(relativePath: string): Promise<void> {
  const fullPath = validatePath(relativePath)

  try {
    const stat = await Deno.stat(fullPath)

    if (stat.isDirectory) {
      await Deno.remove(fullPath, { recursive: true })
      logger.info(`Deleted directory: ${relativePath}`)
    } else {
      await Deno.remove(fullPath)
      logger.info(`Deleted file: ${relativePath}`)
    }
  } catch (error) {
    logger.error(`Error deleting ${relativePath}: ${error}`)
    throw error
  }
}

/**
 * Copy workspace files from config to the workspace directory
 * This is called during startup to populate the workspace with files specified in config
 */
export async function copyConfigFilesToWorkspace(
  files: string[],
  configDir: string,
): Promise<void> {
  logger.info(`Copying ${files.length} workspace files from config`)

  for (const file of files) {
    try {
      const sourcePath = resolve(configDir, file)

      // Check if source exists
      const stat = await Deno.stat(sourcePath)

      if (stat.isFile) {
        // Copy single file
        const content = await Deno.readFile(sourcePath)
        const fileName = file.split("/").pop() || file
        await uploadFile(fileName, content)
        logger.info(`Copied file: ${file} -> ${fileName}`)
      } else if (stat.isDirectory) {
        // Copy directory recursively
        await copyDirectory(sourcePath, WORKSPACE_DIR, file)
      }
    } catch (error) {
      logger.error(`Error copying workspace file ${file}: ${error}`)
      // Continue with other files even if one fails
    }
  }
}

/**
 * Helper function to recursively copy a directory
 */
async function copyDirectory(
  sourceDir: string,
  destBase: string,
  relativeName: string,
): Promise<void> {
  for await (
    const entry of walk(sourceDir, { includeFiles: true, includeDirs: false })
  ) {
    const relativePath = entry.path.substring(sourceDir.length)
    const destPath = join(destBase, relativeName, relativePath)

    // Ensure parent directory exists
    const dir = join(destPath, "..")
    await ensureDir(dir)

    // Copy file
    const content = await Deno.readFile(entry.path)
    await Deno.writeFile(destPath, content)
  }

  logger.info(`Copied directory: ${relativeName}`)
}
