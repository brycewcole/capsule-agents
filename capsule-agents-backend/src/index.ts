import { JsonRpcTransportHandler } from "@a2a-js/sdk/server"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { serveStatic } from "hono/deno"
import { createA2AController } from "./controllers/a2a.controller.ts"
import { createAgentController } from "./controllers/agent.controller.ts"
import { createChatController } from "./controllers/chat.controller.ts"
import { createScheduleController } from "./controllers/schedule.controller.ts"
import { ChatService } from "./services/chat.service.ts"
import { ScheduleService } from "./services/schedule.service.ts"
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
console.info("Initializing database...")
try {
  getDb()
  console.info("Database initialized successfully")
} catch (error) {
  console.error("Failed to initialize database:", error)
  throw error
}

// Load optional config file
console.info("Checking for configuration file...")
let configFileAgentInfo: AgentInfo | null = null
let configSchedules: import("./services/config-schema.ts").ScheduleConfig[] = []
try {
  const configResult = await ConfigFileService.loadConfigFile()
  configFileAgentInfo = configResult.agentInfo
  configSchedules = configResult.schedules
  if (configFileAgentInfo) {
    console.info(`Loaded configuration from file: ${configFileAgentInfo.name}`)
  } else console.info("No configuration file found, using database defaults")
} catch (error) {
  console.error("Failed to load configuration file:", error)
  throw error
}

// Instantiate services/handlers
const agentConfigService = new AgentConfigService(configFileAgentInfo)
const chatService = new ChatService()
const scheduleService = new ScheduleService(agentConfigService)
const a2aRequestHandler = new CapsuleAgentA2ARequestHandler(agentConfigService)
const jsonRpcHandler = new JsonRpcTransportHandler(a2aRequestHandler)

// Initialize schedule service with config schedules
console.info("Initializing schedule service...")
await scheduleService.initializeSchedules(configSchedules)

// Mount controllers
app.route("/", createA2AController({ jsonRpcHandler, a2aRequestHandler }))
app.route("/api", createHealthController())
app.route("/api", createAgentController(agentConfigService))
app.route("/api", createChatController(chatService))
app.route("/api", createScheduleController(scheduleService))

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
console.info(`Server running on port ${port}`)
Deno.serve({ port }, app.fetch)
