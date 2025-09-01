import type * as A2A from "@a2a-js/sdk"
import type * as Vercel from "ai"
import type { TaskStorage } from "./task-storage.ts"

interface ToolCallData {
  type: "tool_call"
  id: string
  name: string
  args: unknown
  [k: string]: unknown
}

interface ToolResultData {
  type: "tool_result"
  id: string
  name: string
  result: unknown
  [k: string]: unknown
}

type TaskState = A2A.Task["status"]["state"]

export class TaskService {
  private taskStorage: TaskStorage

  constructor(taskStorage: TaskStorage) {
    this.taskStorage = taskStorage
  }

  /**
   * Creates a new task with initial state
   */
  createTask(
    contextId: string,
    initialMessage: A2A.Message,
    metadata?: Record<string, unknown>,
  ): A2A.Task {
    const taskId = this.taskStorage.createTaskId()

    const task: A2A.Task = {
      id: taskId,
      kind: "task",
      contextId,
      status: {
        state: "submitted",
        timestamp: new Date().toISOString(),
      },
      history: [initialMessage],
      metadata: metadata || {},
    }

    this.taskStorage.setTask(taskId, task)
    return task
  }

  /**
   * Transitions task to a new state and generates update event
   */
  transitionState(
    task: A2A.Task,
    newState: TaskState,
    message?: string,
  ): A2A.TaskStatusUpdateEvent {
    task.status.state = newState
    task.status.timestamp = new Date().toISOString()
    let final = false
    if (message) {
      task.status.message = {
        kind: "message",
        messageId: this.createMessageId(),
        role: "agent",
        parts: [{ kind: "text", text: message }],
        taskId: task.id,
        contextId: task.contextId,
      }
    }

    switch (newState) {
      case "failed":
      case "completed":
        final = true
        break
      case "submitted":
      case "working":
      case "input-required":
      case "canceled":
      case "rejected":
      case "auth-required":
      case "unknown":
    }
    this.taskStorage.setTask(task.id, task)

    return {
      kind: "status-update",
      taskId: task.id,
      contextId: task.contextId,
      status: task.status,
      final,
    }
  }

  /**
   * Cancels a task if it's in a cancelable state
   */
  cancelTask(task: A2A.Task): void {
    if (
      task.status.state === "completed" ||
      task.status.state === "canceled" ||
      task.status.state === "failed"
    ) {
      throw new Error("Task cannot be canceled")
    }

    this.transitionState(task, "canceled", undefined)
  }

  /**
   * Adds a message to task history
   */
  addMessageToHistory(task: A2A.Task, message: A2A.Message): void {
    if (!task.history) {
      task.history = []
    }
    task.history.push(message)
    this.taskStorage.setTask(task.id, task)
  }

  /**
   * Adds Vercel AI SDK result (tool calls, tool results, and response) to task history
   */
  addVercelResultToHistory(
    task: A2A.Task,
    text: string,
    toolCalls?: Vercel.TypedToolCall<Record<string, Vercel.Tool>>[],
    toolResults?: Vercel.TypedToolResult<Record<string, Vercel.Tool>>[],
  ): A2A.Message {
    if (!task.history) task.history = []

    // Add tool calls to history if present
    if (toolCalls && toolCalls.length > 0) {
      for (const toolCall of toolCalls) {
        const toolCallData: ToolCallData = {
          type: "tool_call",
          id: toolCall.toolCallId,
          name: toolCall.toolName,
          args: toolCall.input,
        }

        const toolCallMessage: A2A.Message = {
          kind: "message",
          messageId: this.createMessageId(),
          role: "agent",
          parts: [{ kind: "data", data: toolCallData }],
          taskId: task.id,
          contextId: task.contextId,
        }

        task.history.push(toolCallMessage)
      }
    }

    // Add tool results to history if present
    if (toolResults && toolResults.length > 0) {
      for (const toolResult of toolResults) {
        const toolResultData: ToolResultData = {
          type: "tool_result",
          id: toolResult.toolCallId,
          name: toolResult.toolName,
          // deno-lint-ignore no-explicit-any
          result: (toolResult as any).result,
        }

        const toolResultMessage: A2A.Message = {
          kind: "message",
          messageId: this.createMessageId(),
          role: "agent",
          parts: [{ kind: "data", data: toolResultData }],
          taskId: task.id,
          contextId: task.contextId,
        }

        task.history.push(toolResultMessage)
      }
    }

    // Create and add response message
    const responseMessage = this.createResponseMessage(task, text)
    this.addMessageToHistory(task, responseMessage)

    return responseMessage
  }

  /**
   * Creates a response message
   */
  createResponseMessage(task: A2A.Task, text: string): A2A.Message {
    return {
      kind: "message",
      messageId: this.createMessageId(),
      role: "agent",
      parts: [{ kind: "text", text } as A2A.TextPart],
      taskId: task.id,
      contextId: task.contextId,
    }
  }

  /**
   * Extracts text content from a message
   */
  extractTextFromMessage(message: A2A.Message): string {
    return message.parts
      .filter((part): part is A2A.TextPart => part.kind === "text")
      .map((part) => part.text)
      .filter(Boolean)
      .join(" ")
  }

  private createMessageId(): string {
    return `msg_${crypto.randomUUID()}`
  }
}
