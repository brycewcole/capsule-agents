import type * as A2A from "@a2a-js/sdk"
import type { A2ARequestHandler } from "@a2a-js/sdk/server"
import * as log from "@std/log"
import * as Vercel from "ai"
import { createProviderRegistry, experimental_createMCPClient } from "ai"
import { StreamableHTTPClientTransport } from "mcp/client/streamableHttp.js"
import { z } from "zod"
import { executeA2ACall } from "../capabilities/a2a.ts"
import { webSearchSkill, webSearchTool } from "../capabilities/brave-search.ts"
import { fileAccessSkill, fileAccessTool } from "../capabilities/file-access.ts"
import { memorySkill, memoryTool } from "../capabilities/memory.ts"
import { contextRepository } from "../repositories/context.repository.ts"
import { MessageRepository } from "../repositories/message.repository.ts"
import { TaskRepository } from "../repositories/task.repository.ts"
import { AgentConfigService } from "../services/agent-config.ts"
import { ProviderService } from "../services/provider-service.ts"
import { TaskService } from "../services/task.service.ts"
import { VercelService } from "../services/vercel.service.ts"
import { isMCPCapability } from "./capability-types.ts"
import { AnyToolCall, AnyToolResult } from "./types.ts"

interface MCPToolsDisposable {
  tools: Record<string, Vercel.Tool>
  [Symbol.asyncDispose](): Promise<void>
}

export class CapsuleAgentA2ARequestHandler implements A2ARequestHandler {
  private taskStorage = new TaskRepository()
  private messageRepository = new MessageRepository()
  private taskService = new TaskService(this.taskStorage)
  private vercelService = new VercelService(
    this.messageRepository,
    this.taskStorage,
  )
  private agentConfigService: AgentConfigService

  constructor(agentConfigService?: AgentConfigService) {
    log.info("Initializing CapsuleAgentA2ARequestHandler...")
    try {
      this.agentConfigService = agentConfigService || new AgentConfigService()
      log.info("AgentConfigService initialized successfully")
    } catch (error) {
      log.error("Failed to initialize AgentConfigService:", error)
      throw error
    }
  }

  getAuthenticatedExtendedAgentCard(): Promise<A2A.AgentCard> {
    throw new Error("Method not implemented.")
  }

  listTaskPushNotificationConfigs(
    _params: A2A.ListTaskPushNotificationConfigParams,
  ): Promise<A2A.TaskPushNotificationConfig[]> {
    throw new Error("Method not implemented.")
  }

  deleteTaskPushNotificationConfig(
    _params: A2A.DeleteTaskPushNotificationConfigParams,
  ): Promise<void> {
    throw new Error("Method not implemented.")
  }

  private async getMCPServers(): Promise<MCPToolsDisposable> {
    const agentInfo = this.agentConfigService.getAgentInfo()
    const clients: Array<{ close: () => Promise<void> }> = []
    const urls: string[] = agentInfo.capabilities.filter(isMCPCapability).map((
      c,
    ) => c.serverUrl)

    try {
      log.info("Connecting to MCP servers:", urls)
      const connectedClients = await Promise.all(
        urls.map(async (url) => {
          const client = await experimental_createMCPClient({
            transport: new StreamableHTTPClientTransport(new URL(url)),
          })
          clients.push(client)
          return client
        }),
      )

      const toolSets = await Promise.all(
        connectedClients.map((client) => client.tools()),
      )

      const tools = Object.assign({}, ...toolSets)
      log.info("MCP tools loaded:", Object.keys(tools))

      return {
        tools: tools,
        [Symbol.asyncDispose]: async () => {
          log.info("Disposing MCP clients...")
          await Promise.all(clients.map((client) => client.close()))
          log.info("MCP clients disposed")
        },
      }
    } catch (error) {
      await Promise.all(clients.map((client) => client.close()))
      throw error
    }
  }

  private async getAvailableTools(): Promise<Record<string, Vercel.Tool>> {
    const capabilities: Record<string, Vercel.Tool> = {}

    const agentInfo = this.agentConfigService.getAgentInfo()
    for (const capability of agentInfo.capabilities) {
      if (capability.type === "prebuilt") {
        switch (capability.subtype) {
          case "file_access":
            capabilities.fileAccess = fileAccessTool
            break
          case "web_search":
            capabilities.webSearch = webSearchTool
            break
          case "memory":
            capabilities.memory = memoryTool
            break
        }
      } else if (capability.type === "a2a") {
        const agentUrl = capability.agentUrl
        if (agentUrl && typeof agentUrl === "string") {
          try {
            log.info(
              `Fetching agent card from: ${agentUrl}/.well-known/agent.json`,
            )
            const agentCardResponse = await fetch(
              `${agentUrl}/.well-known/agent.json`,
              {
                signal: AbortSignal.timeout(5000),
              },
            )
            let agentName = capability.name
            let description = `Communicate with agent at ${agentUrl}`

            if (agentCardResponse.ok) {
              const agentCard: A2A.AgentCard = await agentCardResponse.json()
              agentName = agentCard.name
              description =
                `Communicate with ${agentCard.name}: ${agentCard.description}`
              log.info(`Retrieved agent card for ${agentUrl}:`, {
                name: agentCard.name,
              })
            } else {
              log.warn(
                `Failed to fetch agent card from ${agentUrl} with status ${agentCardResponse.status}, using fallback`,
              )
            }

            capabilities[capability.name] = {
              description,
              inputSchema: z.object({
                message: z.string().describe(`Message to send to ${agentName}`),
                contextId: z.string().optional().describe(
                  "Optional context ID for conversation continuity",
                ),
              }),
              execute: async (
                params: { message: string; contextId?: string },
              ) => {
                const result = await executeA2ACall({
                  agentUrl,
                  message: params.message,
                  contextId: params.contextId,
                })
                if (result.error) {
                  return `Error: ${result.error}`
                } else if (result.response) {
                  return result.response
                } else if (result.taskId) {
                  return `Task created with ID: ${result.taskId}. Status: ${
                    result.status || "unknown"
                  }`
                } else {
                  return JSON.stringify(result)
                }
              },
            }
          } catch (error) {
            log.error(`Error setting up A2A capability for ${agentUrl}:`, error)
            capabilities[capability.name] = {
              description:
                `Communicate with agent at ${agentUrl} (agent unavailable)`,
              inputSchema: z.object({
                message: z.string().describe("Message to send to the agent"),
                contextId: z.string().optional().describe(
                  "Optional context ID for conversation continuity",
                ),
              }),
              execute: async (
                params: { message: string; contextId?: string },
              ) => {
                const result = await executeA2ACall({
                  agentUrl,
                  message: params.message,
                  contextId: params.contextId,
                })
                if (result.error) {
                  return `Error: ${result.error}`
                } else if (result.response) {
                  return result.response
                } else {
                  return JSON.stringify(result)
                }
              },
            }
          }
        }
      }
    }

    log.info(
      "Capabilities loaded from agent config:",
      Object.keys(capabilities),
    )
    return capabilities
  }

  async getAgentCard(): Promise<A2A.AgentCard> {
    const port = Deno.env.get("PORT") || "80"
    const agentUrl = Deno.env.get("AGENT_URL") || `http://localhost:${port}`

    let agentName = "Capsule Agent"
    let agentDescription =
      "A versatile AI agent with configurable tools and capabilities"

    const agentInfo = this.agentConfigService.getAgentInfo()
    agentName = agentInfo.name
    agentDescription = agentInfo.description
    log.info("Agent config loaded for card:", { name: agentName })

    // Get enabled skills based on available tools
    const availableCapabilities = await this.getAvailableTools()
    const skills: A2A.AgentSkill[] = []

    if ("fileAccess" in availableCapabilities) {
      skills.push(fileAccessSkill)
    }
    if ("webSearch" in availableCapabilities) {
      skills.push(webSearchSkill)
    }
    if ("memory" in availableCapabilities) {
      skills.push(memorySkill)
    }

    return {
      name: agentName,
      description: agentDescription,
      url: agentUrl,
      preferredTransport: "json-rpc",
      version: "1.0.0",
      protocolVersion: "1.0",
      capabilities: {
        streaming: true,
        pushNotifications: false,
        stateTransitionHistory: true,
      },
      defaultInputModes: ["text/plain"],
      defaultOutputModes: ["text/plain", "application/json"],
      skills,
    }
  }

  sendMessage(
    _params: A2A.MessageSendParams,
  ): Promise<A2A.Message | A2A.Task> {
    throw new Error("Not yet implemented")
  }

  getTask(params: A2A.TaskQueryParams): Promise<A2A.Task> {
    const task = this.taskStorage.getTask(params.id)
    if (!task) {
      throw new Error("Task not found")
    }

    // Apply history length limit if specified
    if (params.historyLength && task.history) {
      const limitedTask = { ...task }
      limitedTask.history = task.history.slice(-params.historyLength)
      return Promise.resolve(limitedTask)
    }

    return Promise.resolve(task)
  }

  cancelTask(params: A2A.TaskIdParams): Promise<A2A.Task> {
    const task = this.taskStorage.getTask(params.id)
    if (!task) {
      throw new Error("Task not found")
    }

    this.taskService.cancelTask(task)
    return Promise.resolve(task)
  }

  setTaskPushNotificationConfig(
    _params: A2A.TaskPushNotificationConfig,
  ): Promise<A2A.TaskPushNotificationConfig> {
    throw new Error("Push notifications are not supported")
  }

  getTaskPushNotificationConfig(
    _params: A2A.TaskIdParams,
  ): Promise<A2A.TaskPushNotificationConfig> {
    throw new Error("Push notifications are not supported")
  }

  // Utility to truncate long JSON strings for logging
  private truncateForLog(obj: unknown, maxLen = 100): string {
    const str = typeof obj === "string" ? obj : JSON.stringify(obj)
    return str.length > maxLen ? str.slice(0, maxLen) + "..." : str
  }

  private checkForPendingToolCalls(
    toolCalls: AnyToolCall[],
    toolResults: AnyToolResult[],
  ): AnyToolCall[] {
    if (!toolCalls || toolCalls.length === 0) return []
    const resultIds = new Set<string>()
    for (const r of toolResults || []) {
      resultIds.add(r.toolCallId)
    }
    return (toolCalls || []).filter((tc) => {
      return resultIds.has(tc.toolCallId) === false
    })
  }

  async *sendMessageStream(
    params: A2A.MessageSendParams,
  ): AsyncGenerator<
    | A2A.Task
    | A2A.Message
    | A2A.TaskStatusUpdateEvent
    | A2A.TaskArtifactUpdateEvent,
    void,
    undefined
  > {
    if (params.message.contextId == null) {
      params.message.contextId = crypto.randomUUID()
      contextRepository.createContext(params.message.contextId)
    }
    if (!contextRepository.getContext(params.message.contextId)) {
      throw new Error("Invalid contextId: " + params.message.contextId)
    }
    const contextId = params.message.contextId

    // Save the user message
    this.messageRepository.createMessage(params.message)

    // Queue for status updates that need to be yielded progressively
    const statusUpdateQueue: A2A.TaskStatusUpdateEvent[] = []

    try {
      let tools = await this.getAvailableTools()
      await using mcpTools = await this.getMCPServers()
      tools = Object.assign(tools, mcpTools.tools)

      const model = this.getConfiguredModel()

      const agentInfo = this.agentConfigService.getAgentInfo()
      const vercelMessages = this.vercelService.fromContext(contextId)

      let currentTask: A2A.Task | null = null
      log.info(vercelMessages)

      log.debug("Sending message to model:", {
        contextId: params.message.contextId,
        messages: Vercel.convertToModelMessages(vercelMessages),
        tools: Object.keys(tools),
        systemPrompt: agentInfo.description,
      })

      const result = Vercel.streamText({
        experimental_telemetry: {
          isEnabled: true,
          functionId: "chat-complete",
        },
        system: agentInfo.description,
        model,
        messages: Vercel.convertToModelMessages(vercelMessages),
        tools: tools,
        stopWhen: Vercel.stepCountIs(10),
        onStepFinish: (stepResult) => {
          const { text, toolCalls, toolResults, finishReason } = stepResult
          log.info(
            `Step finished - text: "${this.truncateForLog(text)}", toolCalls: ${
              this.truncateForLog(toolCalls)
            }, toolResults: ${this.truncateForLog(toolResults)}`,
          )

          if (finishReason === "tool-calls") {
            if (!currentTask) {
              currentTask = this.taskService.createTask(
                params.message.contextId!,
                params.metadata,
              )
              // Move user message into task context
              this.taskService.addExistingMessageToHistory(
                currentTask,
                params.message,
              )
            }
            const pendingToolCalls = this.checkForPendingToolCalls(
              toolCalls || [],
              toolResults || [],
            )
            if (pendingToolCalls.length > 0) {
              throw new Error(
                `Tool calls returned without matching results: ${
                  this.truncateForLog(pendingToolCalls)
                }`,
              )
            }
            // Add tool calls and results to task history
            for (const toolResult of toolResults) {
              this.taskService.addToolResultToHistory(
                currentTask,
                toolResult,
              )
            }
            statusUpdateQueue.push(this.taskService.transitionState(
              currentTask,
              "working",
              `Used ${toolCalls.map((tc) => tc.toolName).join(", ")}`,
            ))
          }
        },
        onFinish: ({ text }) => {
          log.info(`Stream finished - text: "${this.truncateForLog(text)}"`)

          if (currentTask) {
            this.taskService.createResponseMessage(currentTask, text)
            statusUpdateQueue.push(this.taskService.transitionState(
              currentTask,
              "completed",
              "Finished",
            ))
          }
        },
      })

      log.info("StreamText initialized, consuming stream...")
      for await (const e of result.fullStream) {
        // In the future we might want to add hooks here to display like
        // using xyz
        switch (e.type) {
          case "finish":
            log.info(`Finish event in stream: ${this.truncateForLog(e)}`)
            break
          default:
            break
        }

        // Drain and yield queued status updates as they arrive
        while (statusUpdateQueue.length > 0) {
          const statusUpdate = statusUpdateQueue.shift()!
          yield statusUpdate
        }
      }

      // Final drain in case onFinish enqueued after the final event
      while (statusUpdateQueue.length > 0) {
        const statusUpdate = statusUpdateQueue.shift()!
        yield statusUpdate
      }
    } catch (error) {
      log.error("🚨 STREAM MESSAGE ERROR:", this.truncateForLog(error))
      log.error(
        "Error stack:",
        error instanceof Error ? error.stack : "No stack available",
      )
      throw error
    }
  }

  async *resubscribe(
    params: A2A.TaskIdParams,
  ): AsyncGenerator<
    A2A.Task | A2A.TaskStatusUpdateEvent | A2A.TaskArtifactUpdateEvent,
    void,
    undefined
  > {
    const task = await this.getTask(params)
    yield task
  }

  private getConfiguredModel() {
    const agentInfo = this.agentConfigService.getAgentInfo()
    const modelName = agentInfo.model_name
    if (!modelName) {
      throw new Error("No model configured for the agent")
    }

    log.info(`Getting configured model: ${modelName}`)

    const providerService = ProviderService.getInstance()

    if (!providerService.isModelAvailable(modelName)) {
      throw new Error(`Model ${modelName} is not supported.`)
    }

    // Create provider instances and registry
    const providers = providerService.createProviderInstances()
    const registry = createProviderRegistry(providers)

    // Parse the model name to extract provider and model
    const [provider, ...modelParts] = modelName.split("/")
    const model = modelParts.join("/")

    if (!provider || !model) {
      throw new Error(
        `Invalid model name format: ${modelName}. Expected format: provider/model`,
      )
    }

    return registry.languageModel(`${provider}:${model}`)
  }
}
