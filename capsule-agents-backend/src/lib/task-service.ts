import type * as A2A from "@a2a-js/sdk"
import { TaskStorage } from "./task-storage.ts"
import { ArtifactStorage } from "./artifact-storage.ts"
import { messageStorage } from "./storage.ts"

type TaskState = A2A.Task["status"]["state"]

export class TaskService {
  private taskStorage: TaskStorage
  private artifactStorage = new ArtifactStorage()

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
      history: [],
      metadata: metadata || {},
    }

    // Save the task first
    this.taskStorage.setTask(taskId, task)

    // Then add the initial message as part of task history
    const taskMessage: A2A.Message = {
      ...initialMessage,
      taskId,
    }
    this.addMessageToHistory(task, taskMessage)

    return task
  }

  /**
   * Transitions task to a new state and generates update event
   */
  transitionState(
    task: A2A.Task,
    newState: TaskState,
    statusText?: string,
  ): A2A.TaskStatusUpdateEvent {
    task.status.state = newState
    task.status.timestamp = new Date().toISOString()

    let final = false
    let statusMessage: A2A.Message | undefined

    // Create status message if statusText provided
    if (statusText) {
      statusMessage = {
        kind: "message",
        messageId: this.createMessageId(),
        role: "agent",
        parts: [{ kind: "text", text: statusText }],
        taskId: task.id,
        contextId: task.contextId,
      }

      // Store the status message
      messageStorage.createMessage(statusMessage)
      task.status.message = statusMessage
    }

    // Determine if this is a final state
    switch (newState) {
      case "failed":
      case "completed":
      case "canceled":
      case "rejected":
        final = true
        break
      case "submitted":
      case "working":
      case "input-required":
      case "auth-required":
      case "unknown":
        final = false
        break
    }

    // Update the task
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

    this.transitionState(task, "canceled", "Task canceled")
  }

  /**
   * Adds a message to task history
   */
  addMessageToHistory(task: A2A.Task, message: A2A.Message): void {
    // Store message with task association
    const taskMessage: A2A.Message = {
      ...message,
      taskId: task.id,
    }

    messageStorage.createMessage(taskMessage)

    // Update task to reflect new history (the task storage will rebuild history from messages)
    this.taskStorage.setTask(task.id, task)
  }

  /**
   * Creates an artifact for a task
   */
  createArtifact(
    task: A2A.Task,
    artifact: Omit<A2A.Artifact, "artifactId">,
  ): A2A.TaskArtifactUpdateEvent {
    const storedArtifact = this.artifactStorage.createArtifact(
      task.id,
      artifact,
    )

    return {
      kind: "artifact-update",
      taskId: task.id,
      contextId: task.contextId,
      artifact: {
        artifactId: storedArtifact.id,
        name: storedArtifact.name,
        description: storedArtifact.description,
        parts: storedArtifact.parts,
      },
    }
  }

  /**
   * Adds a tool call and result as messages to task history
   */
  addToolCallToHistory(
    task: A2A.Task,
    toolName: string,
    toolArgs: unknown,
    toolResult: unknown,
  ): void {
    const callId = this.createMessageId()

    // Create tool call message
    const toolCallMessage: A2A.Message = {
      kind: "message",
      messageId: this.createMessageId(),
      role: "agent",
      parts: [{
        kind: "data",
        data: {
          type: "tool_call",
          id: callId,
          name: toolName,
          args: toolArgs,
        },
      }],
      taskId: task.id,
      contextId: task.contextId,
    }

    // Create tool result message
    const toolResultMessage: A2A.Message = {
      kind: "message",
      messageId: this.createMessageId(),
      role: "agent",
      parts: [{
        kind: "data",
        data: {
          type: "tool_result",
          id: callId,
          name: toolName,
          result: toolResult,
        },
      }],
      taskId: task.id,
      contextId: task.contextId,
    }

    // Add both messages to history
    this.addMessageToHistory(task, toolCallMessage)
    this.addMessageToHistory(task, toolResultMessage)
  }

  /**
   * Creates a response message and adds it to task history
   */
  createResponseMessage(task: A2A.Task, text: string): A2A.Message {
    const responseMessage: A2A.Message = {
      kind: "message",
      messageId: this.createMessageId(),
      role: "agent",
      parts: [{ kind: "text", text } as A2A.TextPart],
      taskId: task.id,
      contextId: task.contextId,
    }

    this.addMessageToHistory(task, responseMessage)
    return responseMessage
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

  /**
   * Get a task by ID
   */
  getTask(taskId: string): A2A.Task | undefined {
    return this.taskStorage.getTask(taskId)
  }

  /**
   * Get all tasks for a context
   */
  getTasksByContext(contextId: string): A2A.Task[] {
    return this.taskStorage.getTasksByContext(contextId)
  }

  private createMessageId(): string {
    return `msg_${crypto.randomUUID()}`
  }
}
