import { JsonRpcTransportHandler } from "@a2a-js/sdk/server"
import * as log from "@std/log"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { serveStatic } from "hono/deno"
import { createA2AController } from "./controllers/a2a.controller.ts"
import { createAgentController } from "./controllers/agent.controller.ts"
import { createChatController } from "./controllers/chat.controller.ts"
import { ChatService } from "./services/chat.service.ts"
import { createHealthController } from "./controllers/health.controller.ts"
import { getDb } from "./infrastructure/db.ts"
import { CapsuleAgentA2ARequestHandler } from "./lib/a2a-request-handler.ts"
import { AgentConfigService, type AgentInfo } from "./services/agent-config.ts"
import { ConfigFileService } from "./services/config-file.ts"

const app = new Hono()

// CORS for API routes
app.use(
  "/api/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization", "Cache-Control"],
    allowMethods: ["POST", "GET", "OPTIONS"],
    exposeHeaders: ["Content-Type"],
  }),
)

// CORS for root/A2A routes
app.use(
  "/",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization", "Cache-Control"],
    allowMethods: ["POST", "GET", "OPTIONS"],
    exposeHeaders: ["Content-Type"],
  }),
)

// Initialize DB
log.info("Initializing database...")
try {
  getDb()
  log.info("Database initialized successfully")
} catch (error) {
  log.error("Failed to initialize database:", error)
  throw error
}

// Load optional config file
log.info("Checking for configuration file...")
let configFileAgentInfo: AgentInfo | null = null
try {
  configFileAgentInfo = await ConfigFileService.loadConfigFile()
  if (configFileAgentInfo) {
    log.info(`Loaded configuration from file: ${configFileAgentInfo.name}`)
  } else log.info("No configuration file found, using database defaults")
} catch (error) {
  log.error("Failed to load configuration file:", error)
  throw error
}

// Instantiate services/handlers
const agentConfigService = new AgentConfigService(configFileAgentInfo)
const chatService = new ChatService()
const a2aRequestHandler = new CapsuleAgentA2ARequestHandler(agentConfigService)
const jsonRpcHandler = new JsonRpcTransportHandler(a2aRequestHandler)

// Mount controllers
app.route("/", createA2AController({ jsonRpcHandler, a2aRequestHandler }))
app.route("/api", createHealthController())
app.route("/api", createAgentController(agentConfigService))
app.route("/api", createChatController(chatService))

// Serve static files at /editor
app.use(
  "/editor/*",
  serveStatic({
    root: "./static",
    rewriteRequestPath: (path) => path.replace(/^\/editor/, ""),
  }),
)

// Serve editor SPA
app.get(
  "/editor",
  serveStatic({ root: "./static", rewriteRequestPath: () => "/index.html" }),
)

const port = parseInt(Deno.env.get("PORT") || "80")
log.info(`Server running on port ${port}`)
Deno.serve({ port }, app.fetch)
