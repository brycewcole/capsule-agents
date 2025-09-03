import type * as A2A from "@a2a-js/sdk"
import type { A2ARequestHandler } from "@a2a-js/sdk/server"
import * as log from "@std/log"
import * as Vercel from "ai"
import { z } from "zod"
import { executeA2ACall } from "../tools/a2a.ts"
import { braveSearchSkill, braveSearchTool } from "../tools/brave-search.ts"
import { fileAccessSkill, fileAccessTool } from "../tools/file-access.ts"
import { memorySkill, memoryTool } from "../tools/memory.ts"
import { AgentConfigService } from "./agent-config.ts"
import { ModelRegistry } from "./model-registry.ts"
import {
  createChatWithId as createChatIfNotExists,
  loadChat,
  saveChat,
} from "./storage.ts"
import { TaskService } from "./task-service.ts"
import { TaskStorage } from "./task-storage.ts"
import { VercelService } from "./vercel-service.ts"

export class CapsuleAgentA2ARequestHandler implements A2ARequestHandler {
  private taskStorage = new TaskStorage()
  private taskService = new TaskService(this.taskStorage)
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

  private async getAvailableTools(): Promise<Record<string, Vercel.Tool>> {
    const tools: Record<string, Vercel.Tool> = {}

    const agentInfo = this.agentConfigService.getAgentInfo()
    for (const tool of agentInfo.tools) {
      if (tool.type === "prebuilt") {
        const toolType = tool.tool_schema?.type
        switch (toolType) {
          case "file_access":
            tools.fileAccess = fileAccessTool
            break
          case "brave_search":
            tools.braveSearch = braveSearchTool
            break
          case "memory":
            tools.memory = memoryTool
            break
        }
      } else if (tool.type === "a2a_call") {
        const agentUrl = tool.tool_schema?.agent_url
        if (agentUrl && typeof agentUrl === "string") {
          try {
            // Fetch agent card to get agent name and description
            log.info(
              `Fetching agent card from: ${agentUrl}/.well-known/agent.json`,
            )
            const agentCardResponse = await fetch(
              `${agentUrl}/.well-known/agent.json`,
              {
                signal: AbortSignal.timeout(5000), // 5 second timeout
              },
            )
            let agentName = tool.name
            let description = `Communicate with agent at ${agentUrl}`

            log.info(
              `Agent card response status: ${agentCardResponse.status} for ${agentUrl}`,
            )
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

            tools[tool.name] = {
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
                // Convert result to string for tool return
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
            log.error(`Error setting up A2A tool for ${agentUrl}:`, error)
            if (error instanceof Error) {
              log.error(`Error message: ${error.message}`)
              log.error(`Error type: ${error.constructor.name}`)
              if (error.stack) {
                log.error(`Error stack: ${error.stack}`)
              }
            } else {
              log.error(`Non-Error thrown: ${String(error)}`)
              log.error(`Type of error: ${typeof error}`)
            }

            // Check if it's a network error specifically
            if (error instanceof TypeError && error.message.includes("fetch")) {
              log.error(
                `This appears to be a network/fetch error - agent at ${agentUrl} may not be running`,
              )
            }
            // Create fallback tool
            tools[tool.name] = {
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
      // TODO: Add support for other tool types like mcp_server
    }

    log.info("Tools loaded from agent config:", Object.keys(tools))

    return tools
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
    const availableTools = await this.getAvailableTools()
    const skills: A2A.AgentSkill[] = []

    // TODO add A2A and MCP server skills
    if ("fileAccess" in availableTools) {
      skills.push(fileAccessSkill)
    }
    if ("braveSearch" in availableTools) {
      skills.push(braveSearchSkill)
    }
    if ("memory" in availableTools) {
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

  // TODO update this to not always return a task
  // deno-lint-ignore require-await
  async sendMessage(
    _params: A2A.MessageSendParams,
  ): Promise<A2A.Message | A2A.Task> {
    throw new Error("Not yet implemented")
  }

  // deno-lint-ignore require-await
  async getTask(params: A2A.TaskQueryParams): Promise<A2A.Task> {
    const task = this.taskStorage.getTask(params.id)
    if (!task) {
      throw new Error("Task not found")
    }

    // Apply history length limit if specified
    if (params.historyLength && task.history) {
      const limitedTask = { ...task }
      limitedTask.history = task.history.slice(-params.historyLength)
      return limitedTask
    }

    return task
  }

  // deno-lint-ignore require-await
  async cancelTask(params: A2A.TaskIdParams): Promise<A2A.Task> {
    const task = this.taskStorage.getTask(params.id)
    if (!task) {
      throw new Error("Task not found")
    }

    this.taskService.cancelTask(task)
    return task
  }

  // deno-lint-ignore require-await
  async setTaskPushNotificationConfig(
    _params: A2A.TaskPushNotificationConfig,
  ): Promise<A2A.TaskPushNotificationConfig> {
    throw new Error("Push notifications are not supported")
  }

  // deno-lint-ignore require-await
  async getTaskPushNotificationConfig(
    _params: A2A.TaskIdParams,
  ): Promise<A2A.TaskPushNotificationConfig> {
    throw new Error("Push notifications are not supported")
  }

  // Utility to truncate long JSON strings for logging
  private truncateForLog(obj: unknown, maxLen = 100): string {
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
    if (params.message.contextId == null) {
      params.message.contextId = crypto.randomUUID()
    }

    let task: A2A.Task | null = null
    let hasToolCalls = false

    // Queue for status updates that need to be yielded
    const statusUpdateQueue: A2A.TaskStatusUpdateEvent[] = []

    try {
      createChatIfNotExists(params.message.contextId, "a2a-agent")
      const chatHistory = loadChat(params.message.contextId)
      log.info("Chat history loaded:", { messageCount: chatHistory.length })

      const newMessage: Vercel.UIMessage = VercelService.createUIMessage(
        params.message,
      )

      const combinedMessages = [...chatHistory, newMessage]
      const tools = await this.getAvailableTools()
      const model = await this.getConfiguredModel()

      let responseMessage: A2A.Message | null = null
      const agentInfo = this.agentConfigService.getAgentInfo()

      const result = Vercel.streamText({
        experimental_telemetry: {
          isEnabled: true,
          functionId: "chat-complete",
        },
        system: agentInfo.description,
        model,
        messages: Vercel.convertToModelMessages(combinedMessages),
        tools,
        stopWhen: Vercel.stepCountIs(10),
        onStepFinish: (
          { text, toolCalls, toolResults, finishReason, usage },
        ) => {
          log.info(
            `Step finished - text: "${this.truncateForLog(text)}", toolCalls: ${
              this.truncateForLog(toolCalls)
            }, toolResults: ${
              this.truncateForLog(toolResults)
            }, finishReason: "${this.truncateForLog(finishReason)}", usage: ${
              this.truncateForLog(usage)
            }`,
          )

          if (
            (toolCalls && toolCalls.length > 0) ||
            (toolResults && toolResults.length > 0)
          ) {
            hasToolCalls = true
          }

          if (hasToolCalls) {
            if (!task) {
              throw new Error(
                "Task should have been created on tool call start",
              )
            }

            // Don't queue completion status here - we'll do it in onFinish with the full text
            this.taskService.addVercelResultToHistory(
              task,
              text,
              toolCalls,
              toolResults,
            )
          } else {
            // Create simple response message
            if (text) {
              responseMessage = {
                kind: "message",
                messageId: `msg_${crypto.randomUUID()}`,
                role: "agent",
                parts: [{ kind: "text", text }],
                contextId: params.message.contextId!,
              }
            } else {
              responseMessage = null
            }
          }

          if (text) {
            createChatIfNotExists(params.message.contextId!, "a2a-agent")
            const assistantMessage = VercelService.createAssistantUIMessage(
              text,
            )
            saveChat(params.message.contextId!, [
              ...combinedMessages,
              assistantMessage,
            ])
          }
        },
        onFinish: ({ text, toolCalls, toolResults, finishReason, usage }) => {
          log.info(
            `Stream finished - text: "${
              this.truncateForLog(text)
            }", toolCalls: ${this.truncateForLog(toolCalls)}, toolResults: ${
              this.truncateForLog(toolResults)
            }, finishReason: "${this.truncateForLog(finishReason)}", usage: ${
              this.truncateForLog(usage)
            }`,
          )
          log.info(
            `onFinish debug - hasToolCalls: ${hasToolCalls}, task: ${
              task ? "exists" : "null"
            }`,
          )

          // Queue completion status update with the final full text if we have tool calls
          if (hasToolCalls && task) {
            // Update the response message with the final text
            responseMessage = this.taskService
              .addVercelResultToHistory(task, text, toolCalls, toolResults)
            statusUpdateQueue.push(this.taskService.transitionState(
              task,
              "completed",
              "Response ready",
            ))
            log.info("Task completed")
          } else {
            log.info(
              `Skipping completion status - hasToolCalls: ${hasToolCalls}, task: ${
                task ? "exists" : "null"
              }`,
            )
          }
        },
      })

      log.info("StreamText initialized, consuming stream...")

      for await (const e of result.fullStream) {
        log.debug(`Stream event: ${e.type} - ${this.truncateForLog(e)}`)
        switch (e.type) {
          case "tool-input-start": {
            log.info(`Tool input started: ${this.truncateForLog(e)}`)
            task = this.taskService.createTask(
              params.message.contextId!,
              params.message,
              params.metadata,
            )
            yield task
            const workingStatus = this.taskService.transitionState(
              task,
              "working",
              `Using ${e.toolName}...`,
            )
            log.info(
              `Yielding working status: ${JSON.stringify(workingStatus)}`,
            )
            yield workingStatus
            break
          }
          case "tool-call":
            log.info(`Tool call event: ${this.truncateForLog(e)}`)
            break
          case "tool-result":
            log.info(`Tool result event: ${this.truncateForLog(e)}`)
            break
          case "finish":
            log.info(`Finish event in stream: ${this.truncateForLog(e)}`)
            break
          default:
            log.debug(`Unhandled stream event type: ${e.type}`)
            break
        }
      }

      // Yield any queued status updates
      for (const statusUpdate of statusUpdateQueue) {
        log.info(
          `Yielding queued status update: ${this.truncateForLog(statusUpdate)}`,
        )
        yield statusUpdate
      }

      // After stream processing, yield the response message if it was created
      if (responseMessage) {
        log.info("Yielding response message after stream completion")
        yield responseMessage
      }
    } catch (error) {
      log.error("🚨 STREAM MESSAGE ERROR:", this.truncateForLog(error))
      log.error(
        "Error stack:",
        error instanceof Error ? error.stack : "No stack available",
      )
      log.error("Context ID:", params.message.contextId)

      if (task) {
        log.error("Task ID:", task.id)
        const errorStatusUpdate = this.taskService.transitionState(
          task as A2A.Task,
          "failed",
          `Task failed`,
        )
        yield errorStatusUpdate
      } else {
        // If no task was created, let the JSON-RPC error bubble up
        throw error
      }
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

  private async getConfiguredModel() {
    const agentInfo = this.agentConfigService.getAgentInfo()
    const modelName = agentInfo.model_name

    log.info(`Getting configured model: ${modelName}`)

    const modelRegistry = ModelRegistry.getInstance()

    if (!(await modelRegistry.isModelSupported(modelName))) {
      throw new Error(`Model ${modelName} is not supported.`)
    }

    return modelRegistry.getModel(modelName)
  }
}
