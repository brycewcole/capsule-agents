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
import { A2AMessageRepository } from "../repositories/message.repository.ts"
import { TaskRepository } from "../repositories/task.repository.ts"
import { VercelMessageRepository } from "../repositories/vercel-message.repository.ts"
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

type StreamEmitUnion =
  | A2A.Task
  | A2A.Message
  | A2A.TaskStatusUpdateEvent
  | A2A.TaskArtifactUpdateEvent

type StatusUpdateHandler = (
  event: StreamEmitUnion,
) => void

export class CapsuleAgentA2ARequestHandler implements A2ARequestHandler {
  private taskStorage = new TaskRepository()
  private a2aMessageRepository = new A2AMessageRepository()
  private vercelMessageRepository = new VercelMessageRepository()
  private taskService = new TaskService(
    this.taskStorage,
    this.a2aMessageRepository,
  )
  private vercelService = new VercelService(
    this.vercelMessageRepository,
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

  private async saveUserMessage(
    message: A2A.Message,
    contextId: string,
  ): Promise<void> {
    this.a2aMessageRepository.createMessage(message)
    await this.vercelService.upsertMessage({
      message: this.vercelService.fromA2AToUIMessage(message),
      contextId,
    })
  }

  private async prepareStreamContext(contextId: string): Promise<{
    tools: Record<string, Vercel.Tool>
    mcpTools: MCPToolsDisposable
    model: Vercel.LanguageModel
    agentInfo: ReturnType<AgentConfigService["getAgentInfo"]>
    cleanedMessages: Vercel.UIMessage[]
  }> {
    let tools = await this.getAvailableTools()
    const mcpTools = await this.getMCPServers()
    tools = Object.assign(tools, mcpTools.tools)

    const model = this.getConfiguredModel()
    const agentInfo = this.agentConfigService.getAgentInfo()
    const vercelMessages = this.vercelService.fromContext(contextId)

    const cleanedMessages = vercelMessages.map((msg) => ({
      ...msg,
      parts: msg.parts.filter((part) =>
        part.type !== "reasoning" && part.type !== "step-start"
      ),
    }))

    return { tools, mcpTools, model, agentInfo, cleanedMessages }
  }

  private createOnStepFinishHandler(
    params: A2A.MessageSendParams,
    currentTaskRef: { current: A2A.Task | null },
    statusHandler: StatusUpdateHandler,
  ): (stepResult: Vercel.StepResult<Record<string, Vercel.Tool>>) => void {
    return (stepResult) => {
      const { text, toolCalls, toolResults, finishReason } = stepResult
      log.info(
        `Step finished - text: "${this.truncateForLog(text)}", toolCalls: ${
          this.truncateForLog(toolCalls)
        }, toolResults: ${this.truncateForLog(toolResults)}`,
      )

      if (finishReason === "tool-calls") {
        if (!currentTaskRef.current) {
          currentTaskRef.current = this.taskService.createTask(
            params.message.contextId!,
            params.metadata,
          )
          statusHandler(currentTaskRef.current)
          // Move user message into task context
          this.taskService.addExistingMessageToHistory(
            currentTaskRef.current,
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
        const statusUpdate = this.taskService.transitionState(
          currentTaskRef.current,
          "working",
          `Used ${toolCalls.map((tc) => tc.toolName).join(", ")}`,
        )
        statusHandler(statusUpdate)
      }
    }
  }

  private createOnFinishHandler(
    contextId: string,
    currentTaskRef: { current: A2A.Task | null },
    finalMessageHolder: { message: A2A.Message | null },
    statusHandler: StatusUpdateHandler,
  ): (params: { responseMessage: Vercel.UIMessage }) => Promise<void> {
    return async ({ responseMessage }) => {
      log.info(
        `Stream finished - responseMessage: ${
          this.truncateForLog(responseMessage)
        }`,
      )

      if (currentTaskRef.current) {
        const statusUpdate = this.taskService.transitionState(
          currentTaskRef.current,
          "completed",
        )
        statusHandler(statusUpdate)
      }

      // Ensure the message has a valid ID
      if (!responseMessage.id) {
        responseMessage.id = crypto.randomUUID()
      }

      // Save to Vercel storage
      await this.vercelService.upsertMessage({
        message: responseMessage,
        contextId,
      })

      // Convert to A2A message and save
      const a2aMessage = this.vercelService.fromUIMessageToA2A(
        responseMessage,
        contextId,
        currentTaskRef.current?.id,
      )
      this.a2aMessageRepository.createMessage(a2aMessage)

      // Store for yielding after fullStream completes
      finalMessageHolder.message = a2aMessage

      log.info("Saved assistant message to both Vercel and A2A storage")
    }
  }

  private consumeUIStream(
    uiMessageStream: AsyncIterable<unknown>,
  ): void {
    // Consume in background to ensure onFinish fires
    ;(async () => {
      try {
        for await (const _ of uiMessageStream) {
          // Just consume to ensure onFinish fires
        }
        log.info("UI message stream consumed successfully")
      } catch (error) {
        console.log(error)
        log.error(
          "Error stack:",
          error instanceof Error ? error.stack : "No stack available",
        )
      }
    })()
  }

  private async processStreamEvents(
    fullStream: AsyncIterable<
      Vercel.TextStreamPart<Record<string, Vercel.Tool>>
    >,
    currentTaskRef: { current: A2A.Task | null },
    statusHandler: StatusUpdateHandler,
  ): Promise<void> {
    log.info("StreamText initialized, consuming stream...")
    for await (const e of fullStream) {
      switch (e.type) {
        case "tool-input-start":
          log.info(`Tool input starting: ${e.toolName}`)
          if (currentTaskRef.current) {
            const statusUpdate = this.taskService.transitionState(
              currentTaskRef.current,
              "working",
            )
            statusHandler(statusUpdate)
          }
          break
        case "tool-input-end":
          log.info(`Tool input ready: ${e.id}`)
          break
        case "tool-call":
          log.info(`Tool called: ${e.toolName}`)
          if (currentTaskRef.current) {
            const statusUpdate = this.taskService.transitionState(
              currentTaskRef.current,
              "working",
            )
            statusHandler(statusUpdate)
          }
          break
        case "tool-result":
          log.info(`Tool completed: ${e.toolName}`)
          if (currentTaskRef.current) {
            const statusUpdate = this.taskService.transitionState(
              currentTaskRef.current,
              "working",
            )
            statusHandler(statusUpdate)
          }
          break
        case "finish-step":
          log.info("Step finished")
          break
        case "finish":
          log.info(`Finish event in stream: ${this.truncateForLog(e)}`)
          break
        default:
          break
      }
    }
  }

  private handleStreamError(error: unknown): never {
    log.error("🚨 STREAM MESSAGE ERROR:", this.truncateForLog(error))
    log.error(
      "Error stack:",
      error instanceof Error ? error.stack : "No stack available",
    )
    throw error
  }

  private ensureContext(contextId?: string): string {
    if (contextId == null) {
      const newContextId = crypto.randomUUID()
      contextRepository.createContext(newContextId)
      return newContextId
    }

    if (!contextRepository.getContext(contextId)) {
      contextRepository.createContext(contextId)
    }

    return contextId
  }

  async sendMessage(
    params: A2A.MessageSendParams,
  ): Promise<A2A.Message | A2A.Task> {
    params.message.contextId = this.ensureContext(params.message.contextId)
    const contextId = params.message.contextId

    await this.saveUserMessage(params.message, contextId)

    try {
      const { tools, mcpTools, model, agentInfo, cleanedMessages } = await this
        .prepareStreamContext(contextId)

      await using _mcpTools = mcpTools

      const currentTaskRef = { current: null as A2A.Task | null }
      const finalMessageHolder = { message: null as A2A.Message | null }

      log.debug("Sending message to model:", {
        contextId: params.message.contextId,
        messages: Vercel.convertToModelMessages(cleanedMessages),
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
        messages: Vercel.convertToModelMessages(cleanedMessages),
        tools: tools,
        stopWhen: Vercel.stepCountIs(10),
        onStepFinish: this.createOnStepFinishHandler(
          params,
          currentTaskRef,
          () => {},
        ),
      })

      const uiMessageStream = result.toUIMessageStream({
        originalMessages: cleanedMessages,
        onFinish: this.createOnFinishHandler(
          contextId,
          currentTaskRef,
          finalMessageHolder,
          () => {},
        ),
      })

      this.consumeUIStream(uiMessageStream)

      await this.processStreamEvents(
        result.fullStream,
        currentTaskRef,
        () => {},
      )

      // Wait a moment for onFinish to complete
      await new Promise((resolve) => setTimeout(resolve, 100))

      if (currentTaskRef.current) {
        return currentTaskRef.current
      } else if (finalMessageHolder.message) {
        return finalMessageHolder.message
      } else {
        throw new Error("No task or message generated from sendMessage")
      }
    } catch (error) {
      this.handleStreamError(error)
    }
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
    params.message.contextId = this.ensureContext(params.message.contextId)
    const contextId = params.message.contextId

    await this.saveUserMessage(params.message, contextId)

    // Queue for status updates that need to be yielded progressively
    const eventUpdateQueue: StreamEmitUnion[] = []

    try {
      const { tools, mcpTools, model, agentInfo, cleanedMessages } = await this
        .prepareStreamContext(contextId)

      await using _mcpTools = mcpTools

      const currentTaskRef = { current: null as A2A.Task | null }
      const finalMessageHolder = { message: null as A2A.Message | null }

      // Queue-based status handler for streaming version
      const queueStatusHandler: StatusUpdateHandler = (event) => {
        eventUpdateQueue.push(event)
      }

      log.info(cleanedMessages)

      log.debug("Sending message to model:", {
        contextId: params.message.contextId,
        messages: Vercel.convertToModelMessages(cleanedMessages),
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
        messages: Vercel.convertToModelMessages(cleanedMessages),
        tools: tools,
        stopWhen: Vercel.stepCountIs(10),
        onStepFinish: this.createOnStepFinishHandler(
          params,
          currentTaskRef,
          queueStatusHandler,
        ),
      })

      const uiMessageStream = result.toUIMessageStream({
        originalMessages: cleanedMessages,
        onFinish: this.createOnFinishHandler(
          contextId,
          currentTaskRef,
          finalMessageHolder,
          queueStatusHandler,
        ),
      })

      this.consumeUIStream(uiMessageStream)

      log.info("StreamText initialized, consuming stream...")
      for await (const e of result.fullStream) {
        switch (e.type) {
          case "tool-input-start":
            log.info(`Tool input starting: ${e.toolName}`)
            if (currentTaskRef.current) {
              const statusUpdate = this.taskService.transitionState(
                currentTaskRef.current,
                "working",
              )
              queueStatusHandler(statusUpdate)
            }
            break
          case "tool-input-end":
            log.info(`Tool input ready: ${e.id}`)
            break
          case "tool-call":
            log.info(`Tool called: ${e.toolName}`)
            if (currentTaskRef.current) {
              const statusUpdate = this.taskService.transitionState(
                currentTaskRef.current,
                "working",
              )
              queueStatusHandler(statusUpdate)
            }
            break
          case "tool-result":
            log.info(`Tool completed: ${e.toolName}`)
            if (currentTaskRef.current) {
              const statusUpdate = this.taskService.transitionState(
                currentTaskRef.current,
                "working",
              )
              queueStatusHandler(statusUpdate)
            }
            break
          case "finish-step":
            log.info("Step finished")
            break
          case "finish":
            log.info(`Finish event in stream: ${this.truncateForLog(e)}`)
            break
          default:
            break
        }

        // Drain and yield queued status updates as they arrive
        while (eventUpdateQueue.length > 0) {
          const statusUpdate = eventUpdateQueue.shift()!
          yield statusUpdate
        }
      }

      // Final drain in case onFinish enqueued after the final event
      while (eventUpdateQueue.length > 0) {
        const statusUpdate = eventUpdateQueue.shift()!
        yield statusUpdate
      }

      // Wait a moment for onFinish to complete
      await new Promise((resolve) => setTimeout(resolve, 100))

      // Drain any status updates added by onFinish (e.g., "completed" status)
      while (eventUpdateQueue.length > 0) {
        const statusUpdate = eventUpdateQueue.shift()!
        yield statusUpdate
      }

      // Yield the final A2A message
      if (finalMessageHolder.message) {
        log.info("Yielding final A2A message")
        yield finalMessageHolder.message
      }
    } catch (error) {
      this.handleStreamError(error)
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
