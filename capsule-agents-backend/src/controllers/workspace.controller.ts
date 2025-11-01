import { Hono } from "hono"
import { getLogger } from "@std/log"
import * as workspaceService from "../services/workspace.service.ts"

const logger = getLogger("workspace-controller")

export function createWorkspaceController() {
  const router = new Hono()

  /**
   * GET /api/workspace/files
   * List all files in the workspace
   */
  router.get("/workspace/files", async (c) => {
    try {
      const files = await workspaceService.listWorkspaceFiles()
      return c.json({ files })
    } catch (error) {
      logger.error(`Error listing workspace files: ${error}`)
      return c.json(
        { error: "Failed to list workspace files", details: String(error) },
        500,
      )
    }
  })

  /**
   * POST /api/workspace/files
   * Upload one or more files to the workspace
   */
  router.post("/workspace/files", async (c) => {
    try {
      const body = await c.req.parseBody()

      // Handle multiple files or single file
      const uploadedFiles: string[] = []

      for (const [_key, value] of Object.entries(body)) {
        if (value instanceof File) {
          const arrayBuffer = await value.arrayBuffer()
          const content = new Uint8Array(arrayBuffer)
          await workspaceService.uploadFile(value.name, content)
          uploadedFiles.push(value.name)
        }
      }

      if (uploadedFiles.length === 0) {
        return c.json({ error: "No files provided" }, 400)
      }

      return c.json({ success: true, files: uploadedFiles })
    } catch (error) {
      logger.error(`Error uploading files: ${error}`)
      return c.json(
        { error: "Failed to upload files", details: String(error) },
        500,
      )
    }
  })

  /**
   * GET /api/workspace/files/:path
   * Download a specific file from the workspace
   */
  router.get("/workspace/files/*", async (c) => {
    try {
      // Get the full path after /workspace/files/
      const fullPath = c.req.path
      const path = fullPath.replace("/api/workspace/files/", "")

      if (!path) {
        return c.json({ error: "File path is required" }, 400)
      }

      const content = await workspaceService.readFile(path)

      // Set appropriate headers for file download
      c.header("Content-Type", "application/octet-stream")
      c.header(
        "Content-Disposition",
        `attachment; filename="${path.split("/").pop()}"`,
      )

      return c.body(content)
    } catch (error) {
      logger.error(`Error downloading file: ${error}`)
      return c.json(
        { error: "Failed to download file", details: String(error) },
        500,
      )
    }
  })

  /**
   * DELETE /api/workspace/files/:path
   * Delete a file or directory from the workspace
   */
  router.delete("/workspace/files/*", async (c) => {
    try {
      // Get the full path after /workspace/files/
      const fullPath = c.req.path
      const path = fullPath.replace("/api/workspace/files/", "")

      if (!path) {
        return c.json({ error: "File path is required" }, 400)
      }

      await workspaceService.deleteFile(path)

      return c.json({ success: true, path })
    } catch (error) {
      logger.error(`Error deleting file: ${error}`)
      return c.json(
        { error: "Failed to delete file", details: String(error) },
        500,
      )
    }
  })

  return router
}
