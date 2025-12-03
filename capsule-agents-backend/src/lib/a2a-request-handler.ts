import type * as A2A from "@a2a-js/sdk"
import type { A2ARequestHandler } from "@a2a-js/sdk/server"
import { experimental_createMCPClient } from "@ai-sdk/mcp"
import * as Vercel from "ai"
import { createProviderRegistry } from "ai"
import { StreamableHTTPClientTransport } from "mcp/client/streamableHttp.js"
import { z } from "zod"
import { executeA2ACall } from "../capabilities/a2a.ts"
import { execSkill, execTool } from "../capabilities/exec.ts"
import { memorySkill, memoryTool } from "../capabilities/memory.ts"
import { contextRepository } from "../repositories/context.repository.ts"
import { A2AMessageRepository } from "../repositories/message.repository.ts"
import { TaskRepository } from "../repositories/task.repository.ts"
import { VercelMessageRepository } from "../repositories/vercel-message.repository.ts"
import { AgentConfigService } from "../services/agent-config.ts"
import { ProviderService } from "../services/provider-service.ts"
import { StatusUpdateService } from "../services/status-update.service.ts"
import { TaskRoutingService } from "../services/task-routing.service.ts"
import { TaskService } from "../services/task.service.ts"
import { VercelService } from "../services/vercel.service.ts"
import {
  type ArtifactInput,
  type ArtifactStreamCallback,
  artifactTool as staticArtifactTool,
  createArtifactTool,
} from "./artifact-tool.ts"
import { isMCPCapability } from "./capability-types.ts"
import {
  buildSystemPrompt,
  type BuiltInPromptUsage,
} from "./default-prompts.ts"
import { getProviderOptions } from "./provider-options.ts"
import {
  extractStringFieldsFromBuffer,
  parsePartialObjectFromStream,
} from "./streaming-json.ts"

interface MCPToolsDisposable {
  tools: Record<string, Vercel.Tool>
  [Symbol.asyncDispose](): Promise<void>
}

type StreamEmitUnion =
  | A2A.Task
  | A2A.Message
  | A2A.TaskStatusUpdateEvent
  | A2A.TaskArtifactUpdateEvent

type TaskEmitUnion = Exclude<StreamEmitUnion, A2A.Message>

type StatusUpdateHandler = (
  event: TaskEmitUnion,
) => void

type ArtifactStreamState = {
  artifactId: string
  name: string
  description?: string
  content: string
  inputBuffer: string
  isComplete: boolean
}

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
  private statusUpdateService = new StatusUpdateService()
  private taskRoutingService: TaskRoutingService
  private taskAbortControllers = new Map<string, AbortController>()

  constructor(agentConfigService?: AgentConfigService) {
    console.info("Initializing CapsuleAgentA2ARequestHandler...")
    try {
      this.agentConfigService = agentConfigService || new AgentConfigService()
      console.info("AgentConfigService initialized successfully")
      this.taskRoutingService = new TaskRoutingService(
        this.agentConfigService,
        this.vercelService,
        this.a2aMessageRepository,
      )
      console.info("TaskRoutingService initialized successfully")
    } catch (error) {
      console.error("Failed to initialize services:", error)
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
    const mcpCapabilities = agentInfo.capabilities.filter(isMCPCapability)

    try {
      console.info(
        "Connecting to MCP servers:",
        mcpCapabilities.map((c) => c.serverUrl),
      )
      const connectedClients = await Promise.all(
        mcpCapabilities.map(async (capability) => {
          const client = await experimental_createMCPClient({
            transport: new StreamableHTTPClientTransport(
              new URL(capability.serverUrl),
              {
                requestInit: {
                  headers: capability.headers,
                },
              },
            ),
          })
          clients.push(client)
          return client
        }),
      )

      const toolSets = await Promise.all(
        connectedClients.map((client) => client.tools()),
      )

      const tools = Object.assign({}, ...toolSets)
      console.info("MCP tools loaded:", Object.keys(tools))

      return {
        tools: tools,
        [Symbol.asyncDispose]: async () => {
          console.info("Disposing MCP clients...")
          await Promise.all(clients.map((client) => client.close()))
          console.info("MCP clients disposed")
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
          case "exec":
            capabilities.exec = execTool
            break
          case "memory":
            capabilities.memory = memoryTool
            break
        }
      } else if (capability.type === "a2a") {
        const agentUrl = capability.agentUrl
        if (agentUrl && typeof agentUrl === "string") {
          try {
            console.info(
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
              console.info(`Retrieved agent card for ${agentUrl}:`, {
                name: agentCard.name,
              })
            } else {
              console.warn(
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
            console.error(
              `Error setting up A2A capability for ${agentUrl}:`,
              error,
            )
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

    console.info(
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
    console.info("Agent config loaded for card:", { name: agentName })

    // Get enabled skills based on available tools
    const availableCapabilities = await this.getAvailableTools()
    const skills: A2A.AgentSkill[] = []

    if ("exec" in availableCapabilities) {
      skills.push(execSkill)
    }
    if ("memory" in availableCapabilities) {
      skills.push(memorySkill)
    }

    return {
      name: agentName,
      description: agentDescription,
      url: agentUrl,
      preferredTransport: "JSONRPC",
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

  /**
   * Persist messages from stream completion to database
   * Shared between sendMessage and sendMessageStream
   */
  private async persistStreamMessages(
    messages: Vercel.UIMessage[],
    contextId: string,
    originalMessageCount: number,
    taskId?: string,
  ): Promise<void> {
    const newMessages = messages.slice(originalMessageCount)

    if (newMessages.length === 0) {
      console.warn("No new messages to persist from stream")
      return
    }

    for (const message of newMessages) {
      if (!message.id) {
        message.id = crypto.randomUUID()
      }

      await this.vercelService.upsertMessage({
        message,
        contextId,
        taskId,
      })
    }

    console.info(
      `Persisted ${newMessages.length} new message(s) from stream response`,
    )
  }

  private async prepareStreamContext(contextId: string): Promise<{
    tools: Record<string, Vercel.Tool>
    mcpTools: MCPToolsDisposable
    model: Vercel.LanguageModel
    agentInfo: ReturnType<AgentConfigService["getAgentInfo"]>
    messages: Vercel.UIMessage[]
    systemPrompt: string
    defaultPromptUsage: BuiltInPromptUsage[]
    providerOptions: ReturnType<typeof getProviderOptions>
  }> {
    let tools = await this.getAvailableTools()
    const mcpTools = await this.getMCPServers()
    tools = Object.assign(tools, mcpTools.tools)

    const model = this.getConfiguredModel()
    const agentInfo = this.agentConfigService.getAgentInfo()
    const vercelMessages = this.vercelService.fromContext(contextId)
    const sanitizedMessages = this.removeReasoningParts(vercelMessages)

    console.debug(
      `Loaded ${sanitizedMessages.length} messages from DB for context ${contextId}`,
    )
    sanitizedMessages.forEach((msg, i) => {
      console.debug(
        `Message ${i}: id=${msg.id}, role=${msg.role}, parts=${msg.parts.length}`,
        {
          partTypes: msg.parts.map((p) => p.type),
        },
      )
    })
    console.debug("Using stored messages without additional filtering")

    const { prompt: systemPrompt, prompts: defaultPromptUsage } =
      buildSystemPrompt({
        userPrompt: agentInfo.description,
        modelId: agentInfo.model_name,
        enabled: agentInfo.built_in_prompts_enabled !== false,
      })

    if (agentInfo.built_in_prompts_enabled) {
      const activePrompts = defaultPromptUsage
        .filter((prompt) => prompt.matchesModel)
        .map((prompt) => prompt.id)
      console.debug("Default prompts applied:", {
        activePromptIds: activePrompts,
        model: agentInfo.model_name,
      })
    } else {
      console.debug("Default prompts disabled by configuration.")
    }

    return {
      tools,
      mcpTools,
      model,
      agentInfo,
      messages: sanitizedMessages,
      systemPrompt,
      defaultPromptUsage,
      providerOptions: getProviderOptions(),
    }
  }

  /**
   * Orchestrates stream events, status updates, and artifact emissions.
   * Uses polling to ensure status updates are emitted even when the stream is idle.
   * When statusUpdateQueue is null, skips status polling (used for forced artifacts).
   */
  private async *orchestrateStreamEvents(
    // deno-lint-ignore no-explicit-any
    streamResult: Vercel.StreamTextResult<any, unknown>,
    task: A2A.Task,
    artifactStreamStates: Map<string, ArtifactStreamState>,
    statusUpdateQueue: TaskEmitUnion[] | null,
    shouldStreamArtifacts: boolean,
  ): AsyncGenerator<TaskEmitUnion> {
    let artifactGenerationStarted = false

    // When no status queue, iterate directly without polling
    if (statusUpdateQueue === null) {
      for await (const event of streamResult.fullStream) {
        if (shouldStreamArtifacts) {
          const artifactEvent = this.processArtifactEvent(
            event,
            task,
            artifactStreamStates,
          )
          if (artifactEvent) {
            yield artifactEvent
          }
        }
      }
      return
    }

    const QUEUE_CHECK_INTERVAL_MS = 100

    const iterator = streamResult.fullStream[Symbol.asyncIterator]()
    let pendingNext: ReturnType<typeof iterator.next> | null = null
    let streamDone = false

    while (!streamDone) {
      // Always drain queue first - this ensures status updates emit immediately
      while (statusUpdateQueue.length > 0) {
        yield statusUpdateQueue.shift()!
      }

      // Start waiting for next stream event if not already waiting
      if (!pendingNext) {
        pendingNext = iterator.next()
      }

      // Race between: next stream event OR a short timeout to check queue again
      const timeoutPromise = new Promise<"timeout">((resolve) =>
        setTimeout(() => resolve("timeout"), QUEUE_CHECK_INTERVAL_MS)
      )

      const raceResult = await Promise.race([pendingNext, timeoutPromise])

      if (raceResult === "timeout") {
        // Timeout - loop again to drain queue and keep waiting for stream
        continue
      }

      // Got a stream event
      const { value: event, done } = raceResult
      pendingNext = null
      streamDone = done ?? false

      if (!event) continue

      // Check if artifact generation is starting
      if (
        !artifactGenerationStarted &&
        event.type === "tool-input-start" &&
        this.isArtifactTool(event.toolName)
      ) {
        console.info("Artifact generation started, stopping status updates")
        this.statusUpdateService.stopStatusUpdates(task.id)
        artifactGenerationStarted = true
      }

      // Process artifact events if streaming artifacts
      if (shouldStreamArtifacts) {
        const artifactEvent = this.processArtifactEvent(
          event,
          task,
          artifactStreamStates,
        )
        if (artifactEvent) {
          yield artifactEvent
        }
      }
    }

    // Final drain
    while (statusUpdateQueue.length > 0) {
      yield statusUpdateQueue.shift()!
    }
  }

  private isArtifactTool(toolName: string): boolean {
    return toolName === "createArtifact" || toolName === "generateArtifact"
  }

  /**
   * Process a single stream event for artifact updates
   * Returns an artifact update event if content changed, null otherwise
   */
  private processArtifactEvent(
    // deno-lint-ignore no-explicit-any
    event: any,
    task: A2A.Task,
    artifactStreamStates: Map<string, ArtifactStreamState>,
  ): A2A.TaskArtifactUpdateEvent | null {
    if (
      event.type === "tool-input-start" &&
      this.isArtifactTool(event.toolName)
    ) {
      const callId = event.id
      if (callId && !artifactStreamStates.has(callId)) {
        artifactStreamStates.set(callId, {
          artifactId: crypto.randomUUID(),
          name: "Artifact",
          content: "",
          inputBuffer: "",
          isComplete: false,
        })
      }
      return null
    }

    if (event.type === "tool-call" && this.isArtifactTool(event.toolName)) {
      const state = artifactStreamStates.get(event.toolCallId)
      if (state) {
        this.updateArtifactStateFromInput(
          state,
          typeof event.input === "string"
            ? parsePartialObjectFromStream<ArtifactInput>(
              event.input,
              ["name", "description", "content", "contentType"],
            )
            : event.input as Partial<ArtifactInput>,
        )
        // Mark artifact as complete and emit final event with lastChunk
        state.isComplete = true
        return this.toArtifactUpdateEvent(task, state, true)
      }
      return null
    }

    if (event.type === "tool-input-delta") {
      const state = artifactStreamStates.get(event.id)
      if (state) {
        state.inputBuffer += event.delta
        let hasUpdate = false

        const parsedInput = parsePartialObjectFromStream<ArtifactInput>(
          state.inputBuffer,
          ["name", "description", "content", "contentType"],
        )
        if (parsedInput) {
          this.updateArtifactStateFromInput(state, parsedInput)
          hasUpdate = true
        }

        const streamingFields = extractStringFieldsFromBuffer<ArtifactInput>(
          state.inputBuffer,
          ["content", "name", "description"],
        )
        if (streamingFields) {
          this.updateArtifactStateFromInput(state, streamingFields)
          hasUpdate = true
        }

        // Emit whenever any field was updated (name, description, or content)
        if (hasUpdate) {
          return this.toArtifactUpdateEvent(task, state, false)
        }
      }
    }

    return null
  }

  private updateArtifactStateFromInput(
    state: ArtifactStreamState,
    input?: Partial<ArtifactInput>,
  ): void {
    if (!input) return
    if (input.name) {
      state.name = input.name
    }
    if (input.description) {
      state.description = input.description
    }
    if (input.content) {
      state.content = input.content
    }
  }

  private toArtifactUpdateEvent(
    task: A2A.Task | null,
    state: ArtifactStreamState,
    isLastChunk: boolean,
  ): A2A.TaskArtifactUpdateEvent | null {
    if (!task) return null

    return {
      kind: "artifact-update",
      taskId: task.id,
      contextId: task.contextId,
      append: false, // Always send full content, frontend replaces
      lastChunk: isLastChunk,
      artifact: {
        artifactId: state.artifactId,
        name: state.name || "Artifact",
        description: state.description,
        parts: [{ kind: "text", text: state.content }],
      },
    }
  }

  /**
   * Force artifact generation when the LLM loop completes without calling createArtifact
   */
  private forceArtifactGeneration(
    task: A2A.Task,
    contextId: string,
    allTools: Record<string, Vercel.Tool>,
    onArtifactUpdate?: ArtifactStreamCallback,
  ): {
    // deno-lint-ignore no-explicit-any
    streamResult: Vercel.StreamTextResult<any, unknown>
    artifactStreamStates: Map<string, ArtifactStreamState>
  } {
    const model = this.getConfiguredModel()
    const vercelMessages = this.vercelService.fromContext(contextId)
    const sanitizedMessages = this.removeReasoningParts(vercelMessages)

    // Convert messages with ALL tools so tool results are preserved
    const modelMessages = Vercel.convertToModelMessages(sanitizedMessages, {
      tools: allTools,
    })

    console.info("Forcing artifact generation for task", task.id)

    const artifactToolSet = {
      createArtifact: createArtifactTool(onArtifactUpdate),
    }

    const streamResult = Vercel.streamText({
      model,
      messages: [
        ...modelMessages,
        {
          role: "user",
          content:
            "Generate a final artifact summarizing the results of this task.",
        },
      ],
      tools: artifactToolSet,
      toolChoice: { type: "tool", toolName: "createArtifact" },
    })

    const artifactStreamStates = new Map<string, ArtifactStreamState>()

    return {
      streamResult,
      artifactStreamStates,
    }
  }

  /**
   * Check if step result contains artifact creation and extract details
   * Checks both toolResults (if tool executed) and toolCalls (if stopped early via hasToolCall)
   */
  private extractArtifactFromStepResult<TOOLS extends Vercel.ToolSet>(
    stepResult: Vercel.StepResult<TOOLS>,
    artifactStreamStates: Map<string, ArtifactStreamState>,
  ): {
    artifactId: string
    name: string
    description?: string
    content: string
  } | null {
    const { toolResults, toolCalls } = stepResult

    // First check toolResults (tool executed and completed)
    for (const toolResult of toolResults || []) {
      if (
        toolResult.dynamic !== true &&
        toolResult.toolName === "createArtifact" &&
        "input" in toolResult
      ) {
        const input = toolResult.input as ArtifactInput
        const toolCallId = (toolResult as { toolCallId?: string }).toolCallId
        const state = toolCallId
          ? artifactStreamStates.get(toolCallId)
          : artifactStreamStates.size === 1
          ? artifactStreamStates.values().next().value
          : undefined

        return {
          artifactId: state?.artifactId ?? crypto.randomUUID(),
          name: input.name,
          description: input.description,
          content: state?.content ?? input.content,
        }
      }
    }

    // Check toolCalls if toolResults is empty (stopped early via hasToolCall)
    for (const toolCall of toolCalls || []) {
      if (
        toolCall.type === "tool-call" &&
        toolCall.toolName === "createArtifact"
      ) {
        // toolCall has input property with the tool arguments
        const callInput = "input" in toolCall
          ? (toolCall.input as ArtifactInput)
          : undefined
        const toolCallId = toolCall.toolCallId
        const state = toolCallId
          ? artifactStreamStates.get(toolCallId)
          : artifactStreamStates.size === 1
          ? artifactStreamStates.values().next().value
          : undefined

        // Prefer streamed state content over toolCall input (more complete)
        return {
          artifactId: state?.artifactId ?? crypto.randomUUID(),
          name: state?.name || callInput?.name || "Artifact",
          description: state?.description || callInput?.description,
          content: state?.content || callInput?.content || "",
        }
      }
    }

    return null
  }

  private createOnStepFinishHandler<TOOLS extends Vercel.ToolSet>(
    currentTaskRef: { current: A2A.Task | null },
    _statusHandler: StatusUpdateHandler,
    artifactResultRef: {
      current: {
        artifactId: string
        name: string
        description?: string
        content: string
      } | null
    },
    abortController?: AbortController,
    artifactStreamStates?: Map<string, ArtifactStreamState>,
    activitySnapshot?: {
      userMessage: A2A.Message
      steps: Array<{
        text?: string
        toolCalls?: Array<{ toolName: string; input: unknown }>
        toolResults?: Array<{ toolName: string; output: unknown }>
      }>
    },
  ): (stepResult: Vercel.StepResult<TOOLS>) => void {
    return (stepResult) => {
      const { text, toolCalls, toolResults, finishReason } = stepResult
      console.info(
        `Step finished - text: "${this.truncateForLog(text)}", toolCalls: ${
          this.truncateForLog(toolCalls)
        }, toolResults: ${this.truncateForLog(toolResults)}`,
      )

      // Update activity snapshot with full step context for status updates
      if (activitySnapshot) {
        const stepData: {
          text?: string
          toolCalls?: Array<{ toolName: string; input: unknown }>
          toolResults?: Array<{ toolName: string; output: unknown }>
        } = {}

        if (text && text.trim()) {
          stepData.text = text
        }

        if (toolCalls && toolCalls.length > 0) {
          stepData.toolCalls = toolCalls.map((tc) => ({
            toolName: tc.toolName,
            input: "args" in tc ? tc.args : ("input" in tc ? tc.input : {}),
          }))
        }

        if (toolResults && toolResults.length > 0) {
          stepData.toolResults = toolResults.map((tr) => ({
            toolName: tr.toolName,
            output: "result" in tr
              ? tr.result
              : ("output" in tr ? tr.output : undefined),
          }))
        }

        if (
          stepData.text || stepData.toolCalls || stepData.toolResults
        ) {
          activitySnapshot.steps.push(stepData)
        }
      }

      if (finishReason === "tool-calls" && currentTaskRef.current) {
        // Register AbortController for this task if not already registered
        if (
          abortController &&
          !this.taskAbortControllers.has(currentTaskRef.current.id)
        ) {
          this.taskAbortControllers.set(
            currentTaskRef.current.id,
            abortController,
          )
        }

        // Check for artifact creation
        if (artifactStreamStates) {
          const artifactDetails = this.extractArtifactFromStepResult(
            stepResult,
            artifactStreamStates,
          )

          if (artifactDetails) {
            console.info("Artifact creation detected in step finish")
            artifactResultRef.current = artifactDetails
          }
        }
      }
    }
  }

  private handleStreamError(error: unknown): never {
    throw error
  }

  private removeReasoningParts(
    messages: Vercel.UIMessage[],
  ): Vercel.UIMessage[] {
    let removedCount = 0

    const cleaned = messages
      .map((message) => {
        const filteredParts = message.parts.filter((part) => {
          const isReasoning = part.type === "reasoning"
          if (isReasoning) {
            removedCount++
          }
          return !isReasoning
        })

        if (filteredParts.length === message.parts.length) {
          return message
        }

        return {
          ...message,
          parts: filteredParts,
        }
      })
      .filter((message) => message.parts.length > 0)

    if (removedCount > 0) {
      console.info(
        `Removed ${removedCount} reasoning part(s) from stored context before model call`,
      )
    }

    return cleaned
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
      const {
        tools,
        mcpTools,
        model,
        messages,
        systemPrompt,
        providerOptions,
      } = await this
        .prepareStreamContext(contextId)

      await using _mcpTools = mcpTools

      const currentTaskRef = { current: null as A2A.Task | null }
      const artifactStreamStates = new Map<string, ArtifactStreamState>()

      // Single ref to track artifact result
      const artifactResultRef: {
        current: {
          artifactId: string
          name: string
          description?: string
          content: string
        } | null
      } = { current: null }

      const allTools = {
        ...tools,
        ...mcpTools.tools,
        createArtifact: staticArtifactTool,
      }

      console.info(
        `Prepared ${Object.keys(allTools).length} tools for message sending`,
      )

      const modelMessages = Vercel.convertToModelMessages(messages, {
        tools: allTools,
      })

      console.debug("Sending message to model:", {
        contextId: params.message.contextId,
        messages: modelMessages,
        tools: Object.keys(allTools),
        systemPrompt,
      })

      const result = Vercel.streamText({
        experimental_telemetry: {
          isEnabled: true,
          functionId: "sendMessage",
        },
        onError: (error) => {
          this.handleStreamError(error)
        },
        system: systemPrompt || undefined,
        model,
        messages: modelMessages,
        tools: allTools,
        providerOptions,
        stopWhen: Vercel.stepCountIs(100),
        onStepFinish: this.createOnStepFinishHandler(
          currentTaskRef,
          () => {}, // No status handler for non-streaming
          artifactResultRef,
          undefined, // No abort controller for non-streaming
          artifactStreamStates,
        ),
      })

      const originalMessageCount = messages.length

      const uiResponse = result.toUIMessageStreamResponse({
        originalMessages: messages,
        generateMessageId: () => crypto.randomUUID(),
        onFinish: async ({ messages: finalMessages }) => {
          await this.persistStreamMessages(
            finalMessages,
            contextId,
            originalMessageCount,
            currentTaskRef.current?.id,
          )
        },
      })

      // Consume stream to trigger onFinish and collect artifact state
      for await (const _chunk of uiResponse.body!) {
        // Just consume to trigger callbacks
      }

      console.info("Stream consumed, collecting results")

      // Check if we need to force artifact generation
      if (currentTaskRef.current && !artifactResultRef.current) {
        console.info("No artifact in non-streaming mode, forcing generation")

        // Get current message count before forced artifact generation
        const forcedOriginalMessages = this.vercelService.fromContext(contextId)
        const forcedOriginalMessageCount = forcedOriginalMessages.length

        const { streamResult, artifactStreamStates: forcedStates } = this
          .forceArtifactGeneration(currentTaskRef.current, contextId, allTools)

        // Set up UI message tracking for message persistence
        const forcedUiResponse = streamResult.toUIMessageStreamResponse({
          originalMessages: forcedOriginalMessages,
          generateMessageId: () => crypto.randomUUID(),
          onFinish: async ({ messages: finalMessages }) => {
            await this.persistStreamMessages(
              finalMessages,
              contextId,
              forcedOriginalMessageCount,
              currentTaskRef.current?.id,
            )
            console.info(
              "Persisted forced artifact messages to avoid tool_use/tool_result mismatch (non-streaming)",
            )
          },
        })

        // Consume UI response to trigger message persistence
        if (forcedUiResponse.body) {
          const reader = forcedUiResponse.body.getReader()
          try {
            while (true) {
              const { done } = await reader.read()
              if (done) break
            }
          } catch (error) {
            console.error(
              "Error consuming forced artifact UI response (non-streaming):",
              error,
            )
          }
        }

        const artifactState = forcedStates.values().next().value
        if (artifactState) {
          artifactResultRef.current = {
            artifactId: artifactState.artifactId,
            name: artifactState.name,
            description: artifactState.description,
            content: artifactState.content,
          }
        }
      }

      // Persist all collected artifacts
      if (currentTaskRef.current && artifactResultRef.current) {
        const artifact = artifactResultRef.current
        this.taskService.createArtifact(currentTaskRef.current, {
          name: artifact.name,
          description: artifact.description,
          parts: [{ kind: "text", text: artifact.content }],
        })

        // Return task with artifacts attached
        const taskWithArtifacts = this.taskStorage.getTask(
          currentTaskRef.current.id,
        )
        if (taskWithArtifacts) {
          return taskWithArtifacts
        }
        return currentTaskRef.current
      }

      // No task created - this was a direct message response
      if (currentTaskRef.current) {
        return currentTaskRef.current
      }

      // Return direct message
      const lastMessage = messages[messages.length - 1]
      if (lastMessage && lastMessage.role === "assistant") {
        return {
          kind: "message",
          messageId: lastMessage.id,
          role: "agent",
          parts: lastMessage.parts.map((part) => {
            if (part.type === "text") {
              return { kind: "text", text: part.text }
            }
            // Handle other part types if needed
            return { kind: "text", text: "" }
          }),
          contextId,
        }
      }

      throw new Error("No task or message generated from sendMessage")
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

    // Abort the streaming if there's an active controller
    const abortController = this.taskAbortControllers.get(params.id)
    if (abortController) {
      console.info(`Aborting task ${params.id}`)
      abortController.abort()
      this.taskAbortControllers.delete(params.id)
    }

    this.taskService.cancelTask(task)

    // Reload the task from storage to get the complete task with updated history
    const updatedTask = this.taskStorage.getTask(params.id)
    return Promise.resolve(updatedTask!)
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
  private truncateForLog(obj: unknown, maxLen = 1000): string {
    const str = typeof obj === "string" ? obj : JSON.stringify(obj)
    return str.length > maxLen ? str.slice(0, maxLen) + "..." : str
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

    console.info("Stage 1: Initial routing")
    const model = this.getConfiguredModel()
    const routing = await this.taskRoutingService.handleInitialRouting(
      params,
      contextId,
      model,
    )

    if (!routing.shouldCreateTask) {
      console.info("No task needed, returning direct message")
      if (routing.initialResponse) {
        yield routing.initialResponse
      }
      return
    }

    console.info("Stage 2: Task creation requested")

    const eventUpdateQueue: TaskEmitUnion[] = []
    const currentTaskRef = { current: null as A2A.Task | null }
    const artifactStreamStates = new Map<string, ArtifactStreamState>()

    try {
      currentTaskRef.current = this.taskService.createTask(
        contextId,
        params.metadata,
      )
      console.info(`Task created: ${currentTaskRef.current.id}`)

      this.taskService.addExistingMessageToHistory(
        currentTaskRef.current,
        params.message,
      )

      currentTaskRef.current = this.taskStorage.getTask(
        currentTaskRef.current.id,
      ) ?? null
      if (!currentTaskRef.current) {
        throw new Error("Failed to retrieve newly created task from storage")
      }

      // Emit initial task (state: submitted)
      yield currentTaskRef.current

      const {
        tools,
        mcpTools,
        model,
        messages,
        systemPrompt,
        providerOptions,
      } = await this
        .prepareStreamContext(contextId)

      await using _mcpTools = mcpTools

      const originalMessageCount = messages.length

      const queueStatusHandler: StatusUpdateHandler = (event) => {
        eventUpdateQueue.push(event)
      }

      // Single ref to track artifact result for persistence
      const artifactResultRef: {
        current: {
          artifactId: string
          name: string
          description?: string
          content: string
        } | null
      } = { current: null }

      // Create artifact tool with streaming callback that pushes events to the queue
      // This uses onInputDelta hooks which fire synchronously, bypassing fullStream buffering
      const artifactStreamCallback: ArtifactStreamCallback = (update) => {
        if (!currentTaskRef.current) return

        const artifactEvent: A2A.TaskArtifactUpdateEvent = {
          kind: "artifact-update",
          taskId: currentTaskRef.current.id,
          contextId,
          append: false,
          lastChunk: update.isComplete,
          artifact: {
            artifactId: update.artifactId,
            name: update.name,
            description: update.description,
            parts: [{ kind: "text", text: update.content }],
          },
        }

        // Push to queue - will be yielded by orchestrator
        eventUpdateQueue.push(artifactEvent)

        // Track artifact for persistence when complete
        if (update.isComplete) {
          artifactResultRef.current = {
            artifactId: update.artifactId,
            name: update.name,
            description: update.description,
            content: update.content,
          }
        }
      }

      const allTools = {
        ...tools,
        ...mcpTools.tools,
        createArtifact: createArtifactTool(artifactStreamCallback),
      }

      // Track current agent activity for status updates
      const activitySnapshot = {
        userMessage: params.message,
        steps: [] as Array<{
          text?: string
          toolCalls?: Array<{ toolName: string; input: unknown }>
          toolResults?: Array<{ toolName: string; output: unknown }>
        }>,
      }

      this.statusUpdateService.startStatusUpdates(
        currentTaskRef.current.id,
        contextId,
        () => model,
        () => activitySnapshot,
        (statusEvent) => {
          queueStatusHandler(statusEvent)
        },
      )

      const modelMessages = Vercel.convertToModelMessages(messages, {
        tools: allTools,
      })
      console.info(
        `Sending ${modelMessages.length} messages to model (streaming)`,
      )
      console.debug("Sending message to model:", {
        contextId: params.message.contextId,
        messages: modelMessages,
        tools: Object.keys(allTools),
        systemPrompt,
      })

      const abortController = new AbortController()

      const workingStatus = this.taskService.transitionState(
        currentTaskRef.current,
        "working",
      )
      yield workingStatus

      console.log("providerOptions:", providerOptions)
      const result = Vercel.streamText({
        experimental_telemetry: {
          isEnabled: true,
          functionId: "sendMessageStream",
        },
        abortSignal: abortController.signal,
        system: systemPrompt || undefined,
        model,
        messages: modelMessages,
        tools: allTools,
        providerOptions,
        stopWhen: [
          Vercel.stepCountIs(100),
          Vercel.hasToolCall("createArtifact"),
        ],
        onError: (error) => {
          this.handleStreamError(error)
        },
        onStepFinish: this.createOnStepFinishHandler(
          currentTaskRef,
          queueStatusHandler,
          artifactResultRef,
          abortController,
          artifactStreamStates,
          activitySnapshot,
        ),
      })

      const uiResponse = result.toUIMessageStreamResponse({
        originalMessages: messages,
        generateMessageId: () => crypto.randomUUID(),
        onFinish: async ({ messages: finalMessages }) => {
          await this.persistStreamMessages(
            finalMessages,
            contextId,
            originalMessageCount,
            currentTaskRef.current?.id,
          )

          // Note: Do NOT mark task as completed here - it will be marked completed
          // at the end of sendMessageStream after all events have been yielded
          // to ensure the frontend receives all status updates in order

          if (currentTaskRef.current) {
            // Clean up the AbortController
            this.taskAbortControllers.delete(currentTaskRef.current.id)
          }
        },
      })

      // Start consuming UI response in background to trigger onFinish
      const consumePromise = (async () => {
        try {
          if (uiResponse.body) {
            const reader = uiResponse.body.getReader()
            while (true) {
              const { done } = await reader.read()
              if (done) break
            }
          }
        } catch (error) {
          console.error("Error consuming UI response:", error)
        }
      })()

      console.info("StreamText initialized, processing stream events...")

      // Orchestrate all events through single method
      // Note: artifact streaming is now handled via onInputDelta callback, not fullStream
      for await (
        const event of this.orchestrateStreamEvents(
          result,
          currentTaskRef.current,
          artifactStreamStates,
          eventUpdateQueue,
          false, // Artifacts streamed via callback, not fullStream
        )
      ) {
        yield event
      }

      // Wait for message persistence to complete before continuing to Stage 3
      console.info("Waiting for message persistence to complete...")
      await consumePromise

      if (currentTaskRef.current) {
        this.statusUpdateService.stopStatusUpdates(currentTaskRef.current.id)
      }

      // ========== STAGE 3: Artifact Persistence ==========
      console.info("Stage 3: Artifact persistence")

      if (currentTaskRef.current && artifactResultRef.current) {
        // Artifact was streamed, just persist it
        const details = artifactResultRef.current
        this.taskService.createArtifact(currentTaskRef.current, {
          name: details.name,
          description: details.description,
          parts: [{ kind: "text", text: details.content }],
        })
        console.info("Persisted streamed artifact to database")
      } else if (currentTaskRef.current) {
        // No artifact created - force generation
        console.info("No artifact created, forcing generation")

        // Create a queue for forced artifact events
        const forcedArtifactQueue: TaskEmitUnion[] = []
        // Explicitly typed ref to track artifact result from callback
        const forcedArtifactResultRef: {
          current: {
            artifactId: string
            name: string
            description?: string
            content: string
          } | null
        } = { current: null }

        const forcedArtifactCallback: ArtifactStreamCallback = (update) => {
          if (!currentTaskRef.current) return

          const artifactEvent: A2A.TaskArtifactUpdateEvent = {
            kind: "artifact-update",
            taskId: currentTaskRef.current.id,
            contextId,
            append: false,
            lastChunk: update.isComplete,
            artifact: {
              artifactId: update.artifactId,
              name: update.name,
              description: update.description,
              parts: [{ kind: "text", text: update.content }],
            },
          }

          forcedArtifactQueue.push(artifactEvent)

          if (update.isComplete) {
            forcedArtifactResultRef.current = {
              artifactId: update.artifactId,
              name: update.name,
              description: update.description,
              content: update.content,
            }
          }
        }

        // Get current message count before forced artifact generation
        const forcedOriginalMessages = this.vercelService.fromContext(contextId)
        const forcedOriginalMessageCount = forcedOriginalMessages.length

        const { streamResult, artifactStreamStates: _forcedStates } = this
          .forceArtifactGeneration(
            currentTaskRef.current,
            contextId,
            allTools,
            forcedArtifactCallback,
          )

        // Set up UI message tracking for message persistence
        const forcedUiResponse = streamResult.toUIMessageStreamResponse({
          originalMessages: forcedOriginalMessages,
          generateMessageId: () => crypto.randomUUID(),
          onFinish: async ({ messages: finalMessages }) => {
            await this.persistStreamMessages(
              finalMessages,
              contextId,
              forcedOriginalMessageCount,
              currentTaskRef.current?.id,
            )
            console.info(
              "Persisted forced artifact messages to avoid tool_use/tool_result mismatch",
            )
          },
        })

        // Consume UI response to trigger message persistence
        if (forcedUiResponse.body) {
          const reader = forcedUiResponse.body.getReader()
          try {
            while (true) {
              const { done } = await reader.read()
              if (done) break
            }
          } catch (error) {
            console.error("Error consuming forced artifact UI response:", error)
          }
        }

        // Emit queued artifact events to client
        while (forcedArtifactQueue.length > 0) {
          yield forcedArtifactQueue.shift()!
        }

        // Persist forced artifact
        if (forcedArtifactResultRef.current) {
          this.taskService.createArtifact(currentTaskRef.current, {
            name: forcedArtifactResultRef.current.name,
            description: forcedArtifactResultRef.current.description,
            parts: [{
              kind: "text",
              text: forcedArtifactResultRef.current.content,
            }],
          })
          console.info("Persisted forced artifact to database")
        }
      }

      // Mark task as completed
      if (currentTaskRef.current) {
        const completedStatus = this.taskService.transitionState(
          currentTaskRef.current,
          "completed",
        )
        yield completedStatus
      }
    } catch (error) {
      // Clean up abort controller and status updates on error
      if (currentTaskRef.current) {
        this.taskAbortControllers.delete(currentTaskRef.current.id)
        this.statusUpdateService.stopStatusUpdates(currentTaskRef.current.id)

        // Mark task as failed
        const failedStatus = this.taskService.transitionState(
          currentTaskRef.current,
          "failed",
        )
        yield failedStatus
      }
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

    console.info(`Getting configured model: ${modelName}`)

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
