import { JsonRpcTransportHandler } from "@a2a-js/sdk/server"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { serveStatic } from "hono/deno"
import { createA2AController } from "./controllers/a2a.controller.ts"
import { createAgentController } from "./controllers/agent.controller.ts"
import { createChatController } from "./controllers/chat.controller.ts"
import { createContextController } from "./controllers/context.controller.ts"
import { createHealthController } from "./controllers/health.controller.ts"
import { createScheduleController } from "./controllers/schedule.controller.ts"
import { createWorkspaceController } from "./controllers/workspace.controller.ts"
import { getDb } from "./infrastructure/db.ts"
import { CapsuleAgentA2ARequestHandler } from "./lib/a2a-request-handler.ts"
import { basicAuth } from "./middleware/auth.ts"
import { AgentConfigService, type AgentInfo } from "./services/agent-config.ts"
import { ChatService } from "./services/chat.service.ts"
import { ConfigFileService } from "./services/config-file.ts"
import { ScheduleService } from "./services/schedule.service.ts"

const app = new Hono()

// CORS for API routes
app.use(
  "/api/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization", "Cache-Control"],
    allowMethods: ["POST", "GET", "OPTIONS", "DELETE", "PUT", "PATCH"],
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

// Apply authentication to protected API routes
// Skip auth for health check endpoint and A2A protocol endpoints
app.use("/api/agent", basicAuth)
app.use("/api/chat/*", basicAuth)
app.use("/api/chats", basicAuth)
app.use("/api/chats/*", basicAuth)
app.use("/api/contexts", basicAuth)
app.use("/api/contexts/*", basicAuth)
app.use("/api/schedules", basicAuth)
app.use("/api/schedules/*", basicAuth)
app.use("/api/workspace/*", basicAuth)
app.use("/api/models", basicAuth)
app.use("/api/providers", basicAuth)

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
let workspaceFiles: string[] = []
try {
  const configResult = await ConfigFileService.loadConfigFile()
  configFileAgentInfo = configResult.agentInfo
  configSchedules = configResult.schedules
  workspaceFiles = configResult.workspaceFiles
  if (configFileAgentInfo) {
    console.info(`Loaded configuration from file: ${configFileAgentInfo.name}`)
  } else console.info("No configuration file found, using database defaults")
} catch (error) {
  console.error("Failed to load configuration file:", error)
  throw error
}

// Copy workspace files from config if any
if (workspaceFiles.length > 0) {
  console.info("Copying workspace files from config...")
  try {
    const { copyConfigFilesToWorkspace } = await import(
      "./services/workspace.service.ts"
    )
    const configDir = Deno.env.get("AGENT_CONFIG_FILE")?.replace(
      /\/agent\.config\.(yaml|yml)$/,
      "",
    ) ||
      "/app/config"
    await copyConfigFilesToWorkspace(workspaceFiles, configDir)
    console.info(`Copied ${workspaceFiles.length} workspace file(s)`)
  } catch (error) {
    console.error("Failed to copy workspace files:", error)
    // Don't throw - continue even if workspace files fail to copy
  }
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
app.route("/api", createContextController())
app.route("/api", createScheduleController(scheduleService))
app.route("/api", createWorkspaceController())

// Serve frontend assets
app.use(
  "/editor/assets/*",
  serveStatic({
    root: "./static",
    rewriteRequestPath: (path) => path.replace(/^\/editor/, ""),
  }),
)

app.get(
  "/editor/favicon.svg",
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

app.get(
  "/editor/*",
  serveStatic({ root: "./static", rewriteRequestPath: () => "/index.html" }),
)

const port = parseInt(Deno.env.get("PORT") || "9000")
const agentUrl = Deno.env.get("AGENT_URL")
if (!agentUrl) {
  throw new Error("AGENT_URL environment variable is not set")
}

// Display ASCII art banner
console.log(`
▞▀▖            ▜    
▌  ▝▀▖▛▀▖▞▀▘▌ ▌▐ ▞▀▖
▌ ▖▞▀▌▙▄▘▝▀▖▌ ▌▐ ▛▀ 
▝▀ ▝▀▘▌  ▀▀ ▝▀▘ ▘▝▀▘
▞▀▖         ▐       
▙▄▌▞▀▌▞▀▖▛▀▖▜▀ ▞▀▘  
▌ ▌▚▄▌▛▀ ▌ ▌▐ ▖▝▀▖  
▘ ▘▗▄▘▝▀▘▘ ▘ ▀ ▀▀   


Access your agent at: ${agentUrl}/editor
Or via API at: ${agentUrl}
`)
console.info(`Server running on port ${port}`)
Deno.serve({ port }, app.fetch)
