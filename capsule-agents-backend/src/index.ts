import { Hono } from "hono"
import { serveStatic } from "hono/deno"
import { cors } from "hono/cors"
import { streamSSE } from "hono/streaming"
import {
  createChat,
  deleteChatById,
  getChatsList,
  getChatWithHistory,
  updateChatMetadata,
} from "./lib/storage.ts"
import { getDb } from "./lib/db.ts"
import { CapsuleAgentA2ARequestHandler } from "./lib/a2a-request-handler.ts"
import { JsonRpcTransportHandler } from "@a2a-js/sdk/server"
import { AgentConfigService, AgentInfo } from "./lib/agent-config.ts"
import { ConfigFileService } from "./lib/config-file.ts"
import * as log from "@std/log"

// Type guard to check if result is an AsyncGenerator (streaming response)
function isAsyncGenerator(
  value: unknown,
): value is AsyncGenerator<unknown, void, undefined> {
  return Boolean(
    value && typeof value === "object" && value !== null &&
      Symbol.asyncIterator in value,
  )
}

const app = new Hono()

// Add CORS middleware
app.use(
  "/api/*",
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:3000",
      "http://localhost:8080",
    ],
    allowHeaders: ["Content-Type", "Authorization", "Cache-Control"],
    allowMethods: ["POST", "GET", "OPTIONS"],
    exposeHeaders: ["Content-Type"],
  }),
)

// Add CORS for A2A protocol endpoints (root) - Allow all origins for A2A compatibility
app.use(
  "/",
  cors({
    origin: "*", // Allow all origins for A2A protocol compatibility
    allowHeaders: ["Content-Type", "Authorization", "Cache-Control"],
    allowMethods: ["POST", "GET", "OPTIONS"],
    exposeHeaders: ["Content-Type"],
  }),
)

// Initialize database and create tables on startup
console.log("Initializing database...")
try {
  getDb()
  log.info("Database initialized successfully")
} catch (error) {
  log.error("Failed to initialize database:", error)
  throw error
}

log.info("Checking for configuration file...")
let configFileAgentInfo: AgentInfo | null = null
try {
  configFileAgentInfo = await ConfigFileService.loadConfigFile()
  if (configFileAgentInfo) {
    log.info(`Loaded configuration from file: ${configFileAgentInfo.name}`)
  } else {
    log.info("No configuration file found, using database defaults")
  }
} catch (error) {
  log.error("Failed to load configuration file:", error)
  log.error("Agent cannot start with invalid configuration file")
  throw error
}

const agentConfigService = new AgentConfigService(configFileAgentInfo)

// Initialize A2A request handler after config is loaded
log.debug("Creating A2A request handler...")
const a2aRequestHandler = new CapsuleAgentA2ARequestHandler(agentConfigService)
log.info("A2A request handler created successfully")

log.info("Creating JSON-RPC handler...")
const jsonRpcHandler = new JsonRpcTransportHandler(a2aRequestHandler)
log.info("JSON-RPC handler created successfully")

// Shared handler for agent card endpoints
const getAgentCardHandler = async (c) => {
  const path = c.req.path
  log.info(`GET ${path} - Getting agent card`)
  try {
    const agentCard = await a2aRequestHandler.getAgentCard()
    log.info("Agent card retrieved successfully:", {
      name: agentCard.name,
      skillCount: agentCard.skills.length,
    })
    return c.json(agentCard)
  } catch (error) {
    log.error("🚨 FAILED TO GET AGENT CARD:", error)
    log.error(
      "Stack trace:",
      error instanceof Error ? error.stack : "No stack available",
    )
    return c.json({
      error: "Failed to get agent card",
      details: error instanceof Error ? error.message : String(error),
    }, 500)
  }
}

app.get("/.well-known/agent.json", getAgentCardHandler)
app.get("/.well-known/agent-card.json", getAgentCardHandler)

// Main A2A JSON-RPC endpoint
app.post("/", async (c) => {
  log.info("POST / - A2A JSON-RPC endpoint called")

  let body
  try {
    body = await c.req.json()
    log.info("JSON-RPC request parsed:", {
      method: body.method,
      id: body.id,
      hasParams: !!body.params,
    })
  } catch (error) {
    log.error("Failed to parse JSON-RPC request body:", error)
    return c.json({
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32700,
        message: "Parse error",
        data: error instanceof Error ? error.message : "Invalid JSON",
      },
    }, 400)
  }

  try {
    log.info("Calling JSON-RPC handler...")
    const result = await jsonRpcHandler.handle(body)
    log.info("JSON-RPC handler returned:", {
      type: typeof result,
      isAsyncGenerator: isAsyncGenerator(result),
    })

    if (isAsyncGenerator(result)) {
      log.info("Starting SSE stream for method:", body.method)
      return streamSSE(c, async (stream) => {
        try {
          let eventId = 0
          for await (const event of result) {
            log.debug("Streaming event:", {
              eventId,
              eventType: (event && typeof event === "object" && "kind" in event)
                ? event.kind
                : typeof event,
            })
            await stream.writeSSE({
              data: JSON.stringify(event),
              id: String(eventId++),
            })
          }
          log.info("SSE stream completed successfully")
        } catch (streamError) {
          log.error("🚨 SSE STREAMING ERROR:", streamError)
          log.error(
            "Stream error stack:",
            streamError instanceof Error
              ? streamError.stack
              : "No stack available",
          )
          log.error("Request method during stream error:", body.method)

          await stream.writeSSE({
            data: JSON.stringify({
              jsonrpc: "2.0",
              id: body.id,
              error: {
                code: -32603,
                message: "Streaming error",
                data: {
                  message: streamError instanceof Error
                    ? streamError.message
                    : "Unknown streaming error",
                  type: streamError instanceof Error
                    ? streamError.constructor.name
                    : typeof streamError,
                  method: body.method,
                },
              },
            }),
            id: "error",
          })
        }
      })
    } else {
      return c.json(result)
    }
  } catch (error) {
    log.error("🚨 JSON-RPC HANDLER ERROR:", error)
    log.error(
      "Stack trace:",
      error instanceof Error ? error.stack : "No stack available",
    )
    log.error("Request method:", body.method)
    log.error("Request ID:", body.id)

    return c.json({
      jsonrpc: "2.0",
      id: body.id,
      error: {
        code: -32603,
        message: "Internal error",
        data: {
          message: error instanceof Error ? error.message : "Unknown error",
          type: error instanceof Error ? error.constructor.name : typeof error,
          method: body.method,
        },
      },
    }, 500)
  }
})

// Regular API endpoints
app.get("/api/health", (c) => {
  return c.json({ status: "ok" })
})

app.post("/api/chat/create", async (c) => {
  const { userId } = await c.req.json()
  const chatId = createChat(userId || "anonymous")
  return c.json({ chatId })
})

// Agent configuration endpoints
app.get("/api/agent", (c) => {
  log.info("GET /api/agent - Getting agent configuration")
  try {
    const agentInfo = agentConfigService.getAgentInfo()
    log.info("Agent info retrieved:", {
      name: agentInfo.name,
      modelName: agentInfo.model_name,
      toolCount: agentInfo.tools.length,
    })

    // Transform to match frontend expectations
    const response = {
      name: agentInfo.name,
      description: agentInfo.description,
      modelName: agentInfo.model_name, // Transform model_name to modelName
      modelParameters: agentInfo.model_parameters,
      tools: agentInfo.tools,
    }

    return c.json(response)
  } catch (error) {
    log.error("Error getting agent info:", error)
    return c.json({ error: "Failed to get agent configuration" }, 500)
  }
})

app.put("/api/agent", async (c) => {
  log.info("PUT /api/agent - Updating agent configuration")
  try {
    const body = await c.req.json()
    log.info("Update request received:", {
      name: body.name,
      modelName: body.modelName,
      toolCount: body.tools?.length || 0,
    })

    // Transform from frontend format to backend format
    const agentInfo = {
      name: body.name,
      description: body.description,
      model_name: body.modelName, // Transform modelName back to model_name
      model_parameters: body.modelParameters || {},
      tools: body.tools || [],
    }

    log.info("Calling agentConfigService.updateAgentInfo...")
    const updatedInfo = agentConfigService.updateAgentInfo(agentInfo)
    log.info("Agent info updated successfully")

    // Transform back to frontend format
    const response = {
      name: updatedInfo.name,
      description: updatedInfo.description,
      modelName: updatedInfo.model_name,
      modelParameters: updatedInfo.model_parameters,
      tools: updatedInfo.tools,
    }

    return c.json(response)
  } catch (error) {
    log.error("Error updating agent info:", error)
    return c.json({
      error: error instanceof Error
        ? error.message
        : "Failed to update agent configuration",
    }, 400)
  }
})

app.get("/api/models", (c) => {
  try {
    const models = agentConfigService.getAvailableModels()
    return c.json(models)
  } catch (error) {
    log.error("Error getting models:", error)
    return c.json({ error: "Failed to get available models" }, 500)
  }
})

app.get("/api/providers", (c) => {
  try {
    const providerInfo = agentConfigService.getProviderInfo()
    return c.json(providerInfo)
  } catch (error) {
    log.error("Error getting provider info:", error)
    return c.json({ error: "Failed to get provider information" }, 500)
  }
})

// Chat management endpoints
app.get("/api/chats", (c) => {
  log.info("GET /api/chats - Getting chat list")
  try {
    const userId = "user" // TODO: Extract from auth when implemented
    const chats = getChatsList(userId)
    log.info("Chat list retrieved successfully:", {
      count: chats.length,
      chats: chats.map((c) => ({ id: c.id, title: c.title })),
    })
    return c.json({ chats })
  } catch (error) {
    log.error("Error getting chat list:", error)
    return c.json({ error: "Failed to get chat list" }, 500)
  }
})

app.get("/api/chats/:contextId", (c) => {
  const contextId = c.req.param("contextId")
  log.info("GET /api/chats/:contextId - Getting chat history:", { contextId })

  try {
    const chat = getChatWithHistory(contextId)
    if (!chat) {
      log.warn("Chat not found:", { contextId })
      return c.json({ error: "Chat not found" }, 404)
    }

    log.info("Chat history retrieved successfully:", {
      contextId,
      messageCount: chat.messages.length,
      taskCount: chat.tasks.length,
    })
    return c.json(chat)
  } catch (error) {
    log.error("Error getting chat history:", error)
    return c.json({ error: "Failed to get chat history" }, 500)
  }
})

app.delete("/api/chats/:contextId", (c) => {
  const contextId = c.req.param("contextId")
  log.info("DELETE /api/chats/:contextId - Deleting chat:", { contextId })

  try {
    const success = deleteChatById(contextId)
    if (!success) {
      log.warn("Chat not found for deletion:", { contextId })
      return c.json({ error: "Chat not found" }, 404)
    }

    log.info("Chat deleted successfully:", { contextId })
    return c.json({ success: true })
  } catch (error) {
    log.error("Error deleting chat:", error)
    return c.json({ error: "Failed to delete chat" }, 500)
  }
})

app.patch("/api/chats/:contextId", async (c) => {
  const contextId = c.req.param("contextId")
  log.info("PATCH /api/chats/:contextId - Updating chat metadata:", {
    contextId,
  })

  try {
    const body = await c.req.json()
    const success = updateChatMetadata(contextId, body)

    if (!success) {
      log.warn("Chat not found for update:", { contextId })
      return c.json({ error: "Chat not found" }, 404)
    }

    log.info("Chat metadata updated successfully:", { contextId })
    return c.json({ success: true })
  } catch (error) {
    log.error("Error updating chat metadata:", error)
    return c.json({ error: "Failed to update chat metadata" }, 500)
  }
})

// Serve static files from the frontend build at /editor path
app.use(
  "/editor/*",
  serveStatic({
    root: "./static",
    rewriteRequestPath: (path) => path.replace(/^\/editor/, ""),
  }),
)

// Serve editor at /editor root (for SPA routing)
app.get(
  "/editor",
  serveStatic({
    root: "./static",
    rewriteRequestPath: () => "/index.html",
  }),
)

// Start the server using Deno's built-in serve
const port = parseInt(Deno.env.get("PORT") || "80")

log.info(`Server running on port ${port}`)
Deno.serve({ port }, app.fetch)
