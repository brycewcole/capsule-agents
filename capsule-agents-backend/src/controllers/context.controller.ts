import { Hono } from "hono"
import { ContextRepository } from "../repositories/context.repository.ts"
import { HookConfigSchema } from "../hooks/hook-types.ts"

export function createContextController() {
  const app = new Hono()
  const contextRepository = new ContextRepository()

  // GET /api/contexts - List all contexts
  app.get("/contexts", (c) => {
    try {
      const contexts = contextRepository.getAllContexts()
      return c.json({ contexts })
    } catch (error) {
      console.error("Failed to get contexts:", error)
      return c.json(
        { error: "Failed to retrieve contexts" },
        500,
      )
    }
  })

  // POST /api/contexts - Create new context
  app.post("/contexts", async (c) => {
    try {
      const body = await c.req.json()

      const metadata = body.metadata || {}

      // Validate hooks if provided
      if (metadata.hooks) {
        try {
          // Validate each hook config
          for (const hook of metadata.hooks) {
            HookConfigSchema.parse(hook)
          }
        } catch (error) {
          return c.json(
            {
              error: "Invalid hook configuration",
              details: error instanceof Error ? error.message : String(error),
            },
            400,
          )
        }
      }

      const contextId = contextRepository.createContext(body.id, metadata)
      const context = contextRepository.getContext(contextId)

      return c.json(context, 201)
    } catch (error) {
      console.error("Failed to create context:", error)
      return c.json(
        { error: "Failed to create context" },
        500,
      )
    }
  })

  // GET /api/contexts/:id - Get context details
  app.get("/contexts/:id", (c) => {
    try {
      const id = c.req.param("id")
      const context = contextRepository.getContext(id)

      if (!context) {
        return c.json({ error: "Context not found" }, 404)
      }

      return c.json(context)
    } catch (error) {
      console.error("Failed to get context:", error)
      return c.json(
        { error: "Failed to retrieve context" },
        500,
      )
    }
  })

  // PUT /api/contexts/:id - Update context
  app.put("/contexts/:id", async (c) => {
    try {
      const id = c.req.param("id")
      const body = await c.req.json()

      const existing = contextRepository.getContext(id)
      if (!existing) {
        return c.json({ error: "Context not found" }, 404)
      }

      // Merge metadata
      const metadata = {
        ...existing.metadata,
        ...body.metadata,
      }

      // Validate hooks if provided
      if (metadata.hooks) {
        try {
          for (const hook of metadata.hooks) {
            HookConfigSchema.parse(hook)
          }
        } catch (error) {
          return c.json(
            {
              error: "Invalid hook configuration",
              details: error instanceof Error ? error.message : String(error),
            },
            400,
          )
        }
      }

      const success = contextRepository.updateContext(id, metadata)
      if (!success) {
        return c.json({ error: "Failed to update context" }, 500)
      }

      const context = contextRepository.getContext(id)
      return c.json(context)
    } catch (error) {
      console.error("Failed to update context:", error)
      return c.json(
        { error: "Failed to update context" },
        500,
      )
    }
  })

  // PUT /api/contexts/:id/hooks - Update hooks specifically
  app.put("/contexts/:id/hooks", async (c) => {
    try {
      const id = c.req.param("id")
      const body = await c.req.json()

      const existing = contextRepository.getContext(id)
      if (!existing) {
        return c.json({ error: "Context not found" }, 404)
      }

      // Validate hooks
      if (body.hooks && Array.isArray(body.hooks)) {
        try {
          for (const hook of body.hooks) {
            HookConfigSchema.parse(hook)
          }
        } catch (error) {
          return c.json(
            {
              error: "Invalid hook configuration",
              details: error instanceof Error ? error.message : String(error),
            },
            400,
          )
        }
      }

      // Update metadata with new hooks
      const metadata = {
        ...existing.metadata,
        hooks: body.hooks,
      }

      const success = contextRepository.updateContext(id, metadata)
      if (!success) {
        return c.json({ error: "Failed to update hooks" }, 500)
      }

      const context = contextRepository.getContext(id)
      return c.json(context)
    } catch (error) {
      console.error("Failed to update context hooks:", error)
      return c.json(
        { error: "Failed to update hooks" },
        500,
      )
    }
  })

  // DELETE /api/contexts/:id - Delete context
  app.delete("/contexts/:id", (c) => {
    try {
      const id = c.req.param("id")
      const success = contextRepository.deleteContext(id)

      if (!success) {
        return c.json({ error: "Context not found" }, 404)
      }

      return c.json({ success: true })
    } catch (error) {
      console.error("Failed to delete context:", error)
      return c.json(
        { error: "Failed to delete context" },
        500,
      )
    }
  })

  return app
}
