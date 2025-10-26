import type {
  Message as A2AMessage,
  Task as A2ATask,
  TaskArtifactUpdateEvent,
  TaskStatusUpdateEvent,
} from "@a2a-js/sdk"
import type * as A2A from "@a2a-js/sdk"
import { A2AClient } from "@a2a-js/sdk/client"
import { v4 as uuidv4 } from "uuid"

const API_BASE_URL = globalThis.location.origin
const a2aClient = new A2AClient(API_BASE_URL, {
  fetchImpl: (...a) => globalThis.fetch(...a),
})

// Auth store for credentials
class AuthStore {
  private credentials: string | null = null

  setCredentials(username: string, password: string) {
    this.credentials = btoa(`${username}:${password}`)
  }

  clearCredentials() {
    this.credentials = null
  }

  getAuthHeaders(): Record<string, string> {
    if (!this.credentials) {
      return {}
    }
    return {
      "Authorization": `Basic ${this.credentials}`,
    }
  }

  isAuthenticated(): boolean {
    return this.credentials !== null
  }
}

export const authStore = new AuthStore()

// Function to test login credentials
export async function testLogin(password: string): Promise<boolean> {
  try {
    // Temporarily set credentials
    authStore.setCredentials("admin", password)

    // Test with a simple API call
    await getAgentInfo()

    return true
  } catch (error) {
    // Clear credentials on failure
    authStore.clearCredentials()
    throw error
  }
}

// A2A Protocol types are now the primary types - legacy types removed

// Vercel's GatewayModel format from gateway.getAvailableModels()
export interface Model {
  id: string
  name: string
  description?: string
  pricing?: {
    input: number
    output: number
    cachedInputTokens?: number
    cacheCreationInputTokens?: number
  }
}

export interface ProviderInfo {
  id: string
  name: string
  available: boolean
  models: Model[]
  requiredEnvVars: string[]
}

export interface ProvidersResponse {
  providers: ProviderInfo[]
  status: Record<string, boolean>
}

// Legacy Task type removed - using A2A.Task directly now

// New capability type system
export interface BaseCapability {
  name: string
  enabled: boolean
  type: "prebuilt" | "a2a" | "mcp"
}

export interface PrebuiltCapability extends BaseCapability {
  type: "prebuilt"
  subtype: "exec" | "web_search" | "memory"
}

export interface A2ACapability extends BaseCapability {
  type: "a2a"
  agentUrl: string
}

export interface MCPCapability extends BaseCapability {
  type: "mcp"
  serverUrl: string
  serverType: "http" | "sse"
  headers?: Record<string, string>
}

export type Capability = PrebuiltCapability | A2ACapability | MCPCapability

// Type guard functions
export function isPrebuiltCapability(
  capability: Capability,
): capability is PrebuiltCapability {
  return capability.type === "prebuilt"
}

export function isA2ACapability(
  capability: Capability,
): capability is A2ACapability {
  return capability.type === "a2a"
}

export function isMCPCapability(
  capability: Capability,
): capability is MCPCapability {
  return capability.type === "mcp"
}

// Legacy Tool type removed - use Capability directly

// Type for capability calls (tool calls)
export type CapabilityCall = {
  name: string
  args: Record<string, unknown>
  result?: unknown
}

// Legacy alias removed - use CapabilityCall directly

// Types for agent configuration
export type AgentInfo = {
  name: string
  description: string
  modelName: string
  modelParameters: Record<string, unknown>
  capabilities?: Capability[]
}

export async function fetchTaskById(
  taskId: string,
  options: { historyLength?: number } = {},
): Promise<A2ATask> {
  try {
    const response = await a2aClient.getTask({
      id: taskId,
      ...(options.historyLength
        ? { historyLength: options.historyLength }
        : {}),
    })

    if ("error" in response && response.error) {
      const message = typeof response.error.message === "string"
        ? response.error.message
        : "Failed to fetch task"
      throw new Error(message)
    }

    if (!("result" in response) || !response.result) {
      throw new Error("Task response is missing result data")
    }

    return response.result as A2ATask
  } catch (error) {
    console.error("Failed to fetch task:", error)
    throw error
  }
}

// Function to send a message to the agent using A2A SDK
export async function sendMessage(message: string, contextId?: string | null) {
  const messageId = uuidv4()

  const a2aMessage: A2AMessage = {
    kind: "message",
    messageId,
    parts: [{
      kind: "text",
      text: message,
    }],
    role: "user",
    ...(contextId ? { contextId } : {}),
  }

  try {
    const result = await a2aClient.sendMessage({
      message: a2aMessage,
      configuration: {
        acceptedOutputModes: ["text/plain"],
        blocking: true,
      },
    })

    return result
  } catch (error) {
    console.error("Error sending message:", error)
    throw error
  }
}

// A2A Stream Event Type combining all possible events
type A2AStreamEventType =
  | A2ATask
  | A2AMessage
  | TaskStatusUpdateEvent
  | TaskArtifactUpdateEvent

// Function to stream messages from the agent using A2A SDK
export async function* streamMessage(
  message: string,
  contextId?: string | null,
): AsyncGenerator<A2AStreamEventType> {
  const messageId = uuidv4()

  const a2aMessage: A2AMessage = {
    kind: "message",
    messageId,
    parts: [{
      kind: "text",
      text: message,
    }],
    role: "user",
    ...(contextId ? { contextId } : {}),
  }

  try {
    const stream = a2aClient.sendMessageStream({
      message: a2aMessage,
      configuration: {
        acceptedOutputModes: ["text/plain"],
        blocking: false,
      },
    })

    for await (const event of stream) {
      yield event
    }
  } catch (error) {
    console.error("Error streaming message:", error)
    throw error
  }
}

// Function to cancel a task
export async function cancelTask(taskId: string): Promise<void> {
  try {
    await a2aClient.cancelTask({ id: taskId })
  } catch (error) {
    console.error("Error cancelling task:", error)
    throw error
  }
}

// Function to get agent health status
export async function checkHealth(): Promise<{ status: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/health`)

    if (!response.ok) {
      throw {
        code: response.status,
        message: `Health check failed: ${response.status}`,
        user_message: "Cannot connect to the backend service",
        recovery_action: "Check if the service is running and try again",
        isAPIError: true,
      }
    }

    return await response.json()
  } catch (error) {
    console.error("Health check failed:", error)
    throw error
  }
}

// Types for session history
type SessionEvent = {
  id: string
  author: string
  timestamp: number
  content: string | null
  actions: string | null
  partial: boolean
  turnComplete: boolean
}

type SessionHistoryResponse = {
  sessionId: string
  events: SessionEvent[]
}

// Function to get session chat history
export async function getSessionHistory(
  sessionId: string,
): Promise<SessionHistoryResponse> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/sessions/${sessionId}/history`,
      {
        headers: {
          ...authStore.getAuthHeaders(),
        },
      },
    )

    if (!response.ok) {
      throw {
        code: response.status,
        message: `Failed to fetch session history: ${response.status}`,
        user_message: response.status === 401
          ? "Please log in to view session history"
          : "Could not load session history",
        recovery_action: response.status === 401
          ? "Log in and try again"
          : "Try again later",
        isAPIError: true,
      }
    }

    return await response.json()
  } catch (error) {
    console.error("Failed to fetch session history:", error)
    throw error
  }
}

// Function to get agent metadata using A2A SDK
export async function getAgentCard() {
  try {
    return await a2aClient.getAgentCard()
  } catch (error) {
    console.error("Failed to fetch agent card:", error)
    throw error
  }
}

// Function to get agent configuration
export async function getAgentInfo(): Promise<AgentInfo> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/agent`, {
      headers: {
        ...authStore.getAuthHeaders(),
      },
    })

    if (!response.ok) {
      throw {
        code: response.status,
        message: `Failed to fetch agent config: ${response.status}`,
        user_message: response.status === 401
          ? "Please log in to view agent configuration"
          : "Could not load agent configuration",
        recovery_action: response.status === 401
          ? "Log in and try again"
          : "Try again later",
        isAPIError: true,
      }
    }

    return await response.json()
  } catch (error) {
    console.error("Failed to fetch agent info:", error)
    throw error
  }
}

// Function to update agent configuration
export async function updateAgentInfo(info: AgentInfo): Promise<AgentInfo> {
  const body = { ...info }
  const response = await fetch(`${API_BASE_URL}/api/agent`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...authStore.getAuthHeaders(),
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorText = await response.text()
    let errorData: { message: string }

    try {
      errorData = JSON.parse(errorText)
    } catch {
      errorData = { message: errorText }
    }

    throw {
      code: response.status,
      message: `Failed to update agent config: ${response.status}`,
      data: errorData,
      user_message: response.status === 401
        ? "Please log in to update agent configuration"
        : "Could not save agent configuration",
      recovery_action: response.status === 401
        ? "Log in and try again"
        : "Check your changes and try again",
      isAPIError: true,
    }
  }

  return response.json()
}

// Function to get the list of available models
export async function getAvailableModels(): Promise<Model[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/models`, {
      headers: {
        ...authStore.getAuthHeaders(),
      },
    })

    if (!response.ok) {
      throw {
        code: response.status,
        message: `Failed to fetch models: ${response.status}`,
        user_message: response.status === 401
          ? "Please log in to view available models"
          : "Could not load available models",
        recovery_action: response.status === 401
          ? "Log in and try again"
          : "Try again later",
        isAPIError: true,
      }
    }

    return await response.json() as Model[]
  } catch (error) {
    console.error("Failed to fetch available models:", error)
    throw error
  }
}

// Function to get provider information including availability
export async function getProviderInfo(): Promise<ProvidersResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/providers`, {
      headers: {
        ...authStore.getAuthHeaders(),
      },
    })

    if (!response.ok) {
      throw {
        code: response.status,
        message: `Failed to fetch provider info: ${response.status}`,
        user_message: response.status === 401
          ? "Please log in to view provider information"
          : "Could not load provider information",
        recovery_action: response.status === 401
          ? "Log in and try again"
          : "Try again later",
        isAPIError: true,
      }
    }

    return await response.json() as ProvidersResponse
  } catch (error) {
    console.error("Failed to fetch provider info:", error)
    throw error
  }
}

// Helper function to extract capability calls from A2A task or message
export function extractCapabilityCalls(
  taskOrEvent: A2ATask | A2AMessage | unknown,
): CapabilityCall[] {
  const capabilityCalls: CapabilityCall[] = []

  if (!taskOrEvent || typeof taskOrEvent !== "object") {
    return capabilityCalls
  }

  // Handle A2A Task type
  if (
    (taskOrEvent as { kind?: string; history?: unknown[] }).kind === "task" &&
    (taskOrEvent as { kind?: string; history?: unknown[] }).history
  ) {
    const task = taskOrEvent as A2ATask
    console.log(
      "Processing A2A task history with",
      task.history?.length || 0,
      "messages",
    )

    // Track function calls and their responses
    const functionCalls = new Map<
      string,
      { name: string; args: Record<string, unknown> }
    >()

    for (const message of task.history || []) {
      if (message.parts) {
        for (const part of message.parts) {
          // Check for function calls
          if ("function_call" in part && part.function_call) {
            const functionCall = part.function_call as {
              id: string
              name: string
              args?: Record<string, unknown>
            }
            console.log("Found function call:", functionCall)
            functionCalls.set(functionCall.id, {
              name: functionCall.name,
              args: functionCall.args || {},
            })
          }

          // Check for function responses
          if ("function_response" in part && part.function_response) {
            const functionResponse = part.function_response as {
              id: string
              response: unknown
            }
            console.log("Found function response:", functionResponse)
            const callId = functionResponse.id
            const call = functionCalls.get(callId)

            if (call) {
              capabilityCalls.push({
                name: call.name,
                args: call.args,
                result: functionResponse.response,
              })
              console.log("Created capability call:", {
                name: call.name,
                args: call.args,
                result: functionResponse.response,
              })
            }
          }
        }
      }
    }
  } // Handle legacy Task type for backward compatibility
  else if (
    (taskOrEvent as { history?: unknown[] }).history &&
    (taskOrEvent as { history?: unknown[] }).history!.length > 0
  ) {
    const legacyTask = taskOrEvent as { history: unknown[] }
    console.log("Processing legacy task history")
    // Keep the old logic for backward compatibility
    const functionCalls = new Map<
      string,
      { name: string; args: Record<string, unknown> }
    >()

    for (const event of legacyTask.history) {
      const typedEvent = event as { content?: { parts?: unknown[] } }
      if (typedEvent.content && typedEvent.content.parts) {
        for (const part of typedEvent.content.parts) {
          const typedPart = part as {
            function_call?: {
              id: string
              name: string
              args?: Record<string, unknown>
            }
            function_response?: { id: string; response: unknown }
          }
          if (typedPart.function_call) {
            functionCalls.set(typedPart.function_call.id, {
              name: typedPart.function_call.name,
              args: typedPart.function_call.args || {},
            })
          }

          if (typedPart.function_response) {
            const callId = typedPart.function_response.id
            const call = functionCalls.get(callId)

            if (call) {
              capabilityCalls.push({
                name: call.name,
                args: call.args,
                result: typedPart.function_response.response,
              })
            }
          }
        }
      }
    }
  }

  console.log("Final extracted capability calls:", capabilityCalls)
  return capabilityCalls
}

// Helper function to extract text from A2A response
export function extractResponseText(
  taskOrEvent: A2ATask | A2AMessage | A2AStreamEventType,
): string {
  // Handle A2A Message
  if ("kind" in taskOrEvent && taskOrEvent.kind === "message") {
    return taskOrEvent.parts
      .filter((part): part is A2A.TextPart => part.kind === "text")
      .map((part) => part.text)
      .join("")
  }

  // Handle A2A Task
  if ("kind" in taskOrEvent && taskOrEvent.kind === "task") {
    const a2aTask = taskOrEvent as A2ATask

    // First try to get text from artifacts if they exist
    if (a2aTask.artifacts && a2aTask.artifacts.length > 0) {
      const textArtifact = a2aTask.artifacts.find((artifact) =>
        artifact.parts && artifact.parts.some((part) => "text" in part)
      )

      if (textArtifact) {
        return textArtifact.parts.map((part) => "text" in part ? part.text : "")
          .join("")
      }
    }

    // Check latest message in history
    if (a2aTask.history && a2aTask.history.length > 0) {
      const lastMessage = a2aTask.history[a2aTask.history.length - 1]
      if (lastMessage.role === "agent") {
        return lastMessage.parts
          .filter((part) => part.kind === "text")
          .map((part) => part.text)
          .join("")
      }
    }
  }

  // Skip status update events - these should not provide chat message text
  if ("kind" in taskOrEvent && taskOrEvent.kind === "status-update") {
    return ""
  }

  return ""
}

// Types for chat management
export interface ChatSummary {
  id: string
  title: string
  lastActivity: number
  messageCount: number
  preview: string
  createTime: number
}

export interface ChatWithHistory {
  contextId: string
  title: string
  messages: unknown[]
  tasks: unknown[]
  metadata: Record<string, unknown>
  createTime: number
  updateTime: number
}

// Chat management API functions
export async function getChatsList(): Promise<ChatSummary[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/chats`, {
      headers: {
        ...authStore.getAuthHeaders(),
      },
    })

    if (!response.ok) {
      throw {
        code: response.status,
        message: `Failed to fetch chats: ${response.status}`,
        user_message: response.status === 401
          ? "Please log in to view chats"
          : "Could not load chat list",
        recovery_action: response.status === 401
          ? "Log in and try again"
          : "Try again later",
        isAPIError: true,
      }
    }

    const data = await response.json()
    return data.chats || []
  } catch (error) {
    console.error("Failed to fetch chats list:", error)
    throw error
  }
}

export async function getChatById(contextId: string): Promise<ChatWithHistory> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/chats/${contextId}`, {
      headers: {
        ...authStore.getAuthHeaders(),
      },
    })

    if (!response.ok) {
      throw {
        code: response.status,
        message: `Failed to fetch chat: ${response.status}`,
        user_message: response.status === 404
          ? "Chat not found"
          : response.status === 401
          ? "Please log in to view this chat"
          : "Could not load chat",
        recovery_action: response.status === 401
          ? "Log in and try again"
          : "Try again later",
        isAPIError: true,
      }
    }

    return await response.json()
  } catch (error) {
    console.error("Failed to fetch chat by ID:", error)
    throw error
  }
}

export async function deleteChatById(contextId: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/chats/${contextId}`, {
      method: "DELETE",
      headers: {
        ...authStore.getAuthHeaders(),
      },
    })

    if (!response.ok) {
      throw {
        code: response.status,
        message: `Failed to delete chat: ${response.status}`,
        user_message: response.status === 404
          ? "Chat not found"
          : response.status === 401
          ? "Please log in to delete this chat"
          : "Could not delete chat",
        recovery_action: response.status === 401
          ? "Log in and try again"
          : "Try again later",
        isAPIError: true,
      }
    }

    const result = await response.json()
    return result.success === true
  } catch (error) {
    console.error("Failed to delete chat:", error)
    throw error
  }
}

export async function updateChatMetadata(
  contextId: string,
  metadata: Record<string, unknown>,
): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/chats/${contextId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...authStore.getAuthHeaders(),
      },
      body: JSON.stringify(metadata),
    })

    if (!response.ok) {
      throw {
        code: response.status,
        message: `Failed to update chat: ${response.status}`,
        user_message: response.status === 404
          ? "Chat not found"
          : response.status === 401
          ? "Please log in to update this chat"
          : "Could not update chat",
        recovery_action: response.status === 401
          ? "Log in and try again"
          : "Try again later",
        isAPIError: true,
      }
    }

    const result = await response.json()
    return result.success === true
  } catch (error) {
    console.error("Failed to update chat metadata:", error)
    throw error
  }
}

// Schedule types and API functions
export interface Schedule {
  id: string
  name: string
  prompt: string
  cronExpression: string
  enabled: boolean
  contextId?: string
  backoffEnabled: boolean
  backoffSchedule?: number[]
  lastRunAt?: number
  nextRunAt?: number
  runCount: number
  failureCount: number
  createdAt: number
  updatedAt: number
}

export interface ScheduleInput {
  name: string
  prompt: string
  cronExpression: string
  enabled?: boolean
  contextId?: string
  backoffEnabled?: boolean
  backoffSchedule?: number[]
}

export async function getSchedules(): Promise<Schedule[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/schedules`, {
      headers: {
        ...authStore.getAuthHeaders(),
      },
    })

    if (!response.ok) {
      throw {
        code: response.status,
        message: `Failed to fetch schedules: ${response.status}`,
        user_message: response.status === 401
          ? "Please log in to view schedules"
          : "Could not load schedules",
        recovery_action: response.status === 401
          ? "Log in and try again"
          : "Try again later",
        isAPIError: true,
      }
    }

    const data = await response.json()
    return data.schedules || []
  } catch (error) {
    console.error("Failed to fetch schedules:", error)
    throw error
  }
}

export async function getSchedule(id: string): Promise<Schedule> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/schedules/${id}`, {
      headers: {
        ...authStore.getAuthHeaders(),
      },
    })

    if (!response.ok) {
      throw {
        code: response.status,
        message: `Failed to fetch schedule: ${response.status}`,
        user_message: response.status === 404
          ? "Schedule not found"
          : response.status === 401
          ? "Please log in to view this schedule"
          : "Could not load schedule",
        recovery_action: response.status === 401
          ? "Log in and try again"
          : "Try again later",
        isAPIError: true,
      }
    }

    return await response.json()
  } catch (error) {
    console.error("Failed to fetch schedule:", error)
    throw error
  }
}

export async function createSchedule(
  data: ScheduleInput,
): Promise<Schedule> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/schedules`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authStore.getAuthHeaders(),
      },
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      throw {
        code: response.status,
        message: `Failed to create schedule: ${response.status}`,
        user_message: response.status === 401
          ? "Please log in to create a schedule"
          : "Could not create schedule",
        recovery_action: response.status === 401
          ? "Log in and try again"
          : "Check your input and try again",
        isAPIError: true,
      }
    }

    return await response.json()
  } catch (error) {
    console.error("Failed to create schedule:", error)
    throw error
  }
}

export async function updateSchedule(
  id: string,
  data: Partial<ScheduleInput>,
): Promise<Schedule> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/schedules/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...authStore.getAuthHeaders(),
      },
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      throw {
        code: response.status,
        message: `Failed to update schedule: ${response.status}`,
        user_message: response.status === 404
          ? "Schedule not found"
          : response.status === 401
          ? "Please log in to update this schedule"
          : "Could not update schedule",
        recovery_action: response.status === 401
          ? "Log in and try again"
          : "Check your input and try again",
        isAPIError: true,
      }
    }

    return await response.json()
  } catch (error) {
    console.error("Failed to update schedule:", error)
    throw error
  }
}

export async function deleteSchedule(id: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/schedules/${id}`, {
      method: "DELETE",
      headers: {
        ...authStore.getAuthHeaders(),
      },
    })

    if (!response.ok) {
      throw {
        code: response.status,
        message: `Failed to delete schedule: ${response.status}`,
        user_message: response.status === 404
          ? "Schedule not found"
          : response.status === 401
          ? "Please log in to delete this schedule"
          : "Could not delete schedule",
        recovery_action: response.status === 401
          ? "Log in and try again"
          : "Try again later",
        isAPIError: true,
      }
    }

    const result = await response.json()
    return result.success === true
  } catch (error) {
    console.error("Failed to delete schedule:", error)
    throw error
  }
}

export async function toggleSchedule(
  id: string,
  enabled: boolean,
): Promise<Schedule> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/schedules/${id}/toggle`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authStore.getAuthHeaders(),
      },
      body: JSON.stringify({ enabled }),
    })

    if (!response.ok) {
      throw {
        code: response.status,
        message: `Failed to toggle schedule: ${response.status}`,
        user_message: response.status === 404
          ? "Schedule not found"
          : response.status === 401
          ? "Please log in to toggle this schedule"
          : "Could not toggle schedule",
        recovery_action: response.status === 401
          ? "Log in and try again"
          : "Try again later",
        isAPIError: true,
      }
    }

    return await response.json()
  } catch (error) {
    console.error("Failed to toggle schedule:", error)
    throw error
  }
}

export async function runScheduleNow(id: string): Promise<void> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/schedules/${id}/run-now`,
      {
        method: "POST",
        headers: {
          ...authStore.getAuthHeaders(),
        },
      },
    )

    if (!response.ok) {
      throw {
        code: response.status,
        message: `Failed to run schedule: ${response.status}`,
        user_message: response.status === 404
          ? "Schedule not found"
          : response.status === 401
          ? "Please log in to run this schedule"
          : "Could not run schedule",
        recovery_action: response.status === 401
          ? "Log in and try again"
          : "Try again later",
        isAPIError: true,
      }
    }
  } catch (error) {
    console.error("Failed to run schedule:", error)
    throw error
  }
}

// Export A2A types for use in components
export type {
  A2AMessage,
  A2AStreamEventType,
  A2ATask,
  TaskArtifactUpdateEvent,
  TaskStatusUpdateEvent,
}
