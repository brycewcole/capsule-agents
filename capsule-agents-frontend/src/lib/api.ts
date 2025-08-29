import { v4 as uuidv4 } from "uuid"
import { A2AClient } from "@a2a-js/sdk/client"
import type {
  Message as A2AMessage,
  Task as A2ATask,
  TaskArtifactUpdateEvent,
  TaskStatusUpdateEvent,
} from "@a2a-js/sdk"

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

// Types from backend
type Content = {
  role: string
  parts: { text: string }[]
}

type TaskState =
  | "submitted"
  | "working"
  | "input-required"
  | "completed"
  | "canceled"
  | "failed"
  | "unknown"

type TaskStatus = {
  state: TaskState
  message?: Content
  timestamp: string
}

type Model = {
  model_name: string
  display_name: string
}

type Part = {
  text?: string
  function_call?: {
    id: string
    name: string
    args: Record<string, unknown>
  }
  function_response?: {
    id: string
    name: string
    response: unknown
  }
}

type Artifact = {
  name?: string
  description?: string
  parts: Part[]
  metadata?: Record<string, unknown>
  index: number
  append?: boolean
  lastChunk?: boolean
}

type Task = {
  id: string
  sessionId?: string
  status: TaskStatus
  artifacts?: Artifact[]
  history?: unknown[]
  metadata?: Record<string, unknown>
}

// Type for tool definition
export type Tool = {
  name: string
  type: string
  tool_schema: Record<string, unknown>
}

// Type for tool calls
export type ToolCall = {
  name: string
  args: Record<string, unknown>
  result?: unknown
}

// Types for agent configuration
export type AgentInfo = {
  name: string
  description: string
  modelName: string
  modelParameters: Record<string, unknown>
  tools?: Tool[]
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
    contextId: contextId || uuidv4(),
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
    contextId: contextId || uuidv4(),
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
    let errorData

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

// Helper function to extract tool calls from A2A task or message
export function extractToolCalls(
  taskOrEvent: A2ATask | A2AMessage | unknown,
): ToolCall[] {
  const toolCalls: ToolCall[] = []

  if (!taskOrEvent || typeof taskOrEvent !== "object") {
    return toolCalls
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
              toolCalls.push({
                name: call.name,
                args: call.args,
                result: functionResponse.response,
              })
              console.log("Created tool call:", {
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
              toolCalls.push({
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

  console.log("Final extracted tool calls:", toolCalls)
  return toolCalls
}

// Helper function to extract text from A2A response
export function extractResponseText(
  taskOrEvent: A2ATask | A2AMessage | Task | A2AStreamEventType,
): string {
  // Handle A2A Message
  if ("kind" in taskOrEvent && taskOrEvent.kind === "message") {
    return taskOrEvent.parts
      .filter((part) => part.kind === "text")
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

  // Handle status update events
  if ("kind" in taskOrEvent && taskOrEvent.kind === "status-update") {
    const statusEvent = taskOrEvent as TaskStatusUpdateEvent
    if (statusEvent.status.message) {
      const statusMessage = statusEvent.status.message as {
        kind?: string
        parts?: Array<{ kind?: string; text?: string }>
      }
      // Handle A2A message format with kind and parts
      if (statusMessage.kind === "message" && statusMessage.parts) {
        return statusMessage.parts
          .filter((part: { kind?: string }) => part.kind === "text")
          .map((part: { text?: string }) => part.text || "")
          .join("")
      }
      // Handle legacy Content type in status message
      if (statusMessage.parts) {
        return statusMessage.parts
          .map((part: { text?: string }) => part.text || "")
          .join("")
      }
    }
  }

  // Handle legacy Task type for backward compatibility
  const legacyTask = taskOrEvent as Task
  if (legacyTask.artifacts && legacyTask.artifacts.length > 0) {
    const textArtifact = legacyTask.artifacts.find((artifact) =>
      artifact.parts && artifact.parts.some((part) => "text" in part)
    )

    if (textArtifact) {
      return textArtifact.parts.map((part) => "text" in part ? part.text : "")
        .join("")
    }
  }

  if (
    legacyTask.status && legacyTask.status.message &&
    legacyTask.status.message.parts
  ) {
    return legacyTask.status.message.parts
      .map((part) => "text" in part ? part.text : "")
      .join("")
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

// Export A2A types for use in components
export type {
  A2AMessage,
  A2AStreamEventType,
  A2ATask,
  TaskArtifactUpdateEvent,
  TaskStatusUpdateEvent,
}
