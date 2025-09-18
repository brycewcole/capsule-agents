import type * as A2A from "@a2a-js/sdk"
import { AnyToolResult } from "../lib/types.ts"
import { ArtifactRepository } from "../repositories/artifact.repository.ts"
import { messageRepository } from "../repositories/message.repository.ts"
import { TaskRepository } from "../repositories/task.repository.ts"

type TaskState = A2A.Task["status"]["state"]

export class TaskService {
  private taskStorage: TaskRepository
  private artifactStorage = new ArtifactRepository()

  constructor(taskStorage: TaskRepository) {
    this.taskStorage = taskStorage
  }

  createTask(
    contextId: string,
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

    this.taskStorage.setTask(taskId, task)

    return task
  }

  transitionState(
    task: A2A.Task,
    newState: TaskState,
    statusText?: string,
  ): A2A.TaskStatusUpdateEvent {
    task.status.state = newState
    task.status.timestamp = new Date().toISOString()

    let final = false
    let statusMessage: A2A.Message | undefined

    if (statusText) {
      statusMessage = {
        kind: "message",
        messageId: this.createMessageId(),
        role: "agent",
        parts: [{ kind: "text", text: statusText }],
        taskId: task.id,
        contextId: task.contextId,
      }

      messageRepository.createMessage(statusMessage)
      task.status.message = statusMessage
    }

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

    this.taskStorage.setTask(task.id, task)

    return {
      kind: "status-update",
      taskId: task.id,
      contextId: task.contextId,
      status: task.status,
      final,
    }
  }

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

  addMessageToHistory(task: A2A.Task, message: A2A.Message): void {
    const taskMessage: A2A.Message = {
      ...message,
      messageId: message.messageId || this.createMessageId(),
      taskId: task.id,
    }

    messageRepository.createMessage(taskMessage)

    this.taskStorage.setTask(task.id, task)
  }

  addExistingMessageToHistory(task: A2A.Task, message: A2A.Message): void {
    if (!message.messageId) {
      throw new Error("Existing message must have a messageId")
    }

    if (message.contextId !== task.contextId) {
      throw new Error("Message context does not match task context")
    }

    const updated = messageRepository.updateMessage(message.messageId, {
      taskId: task.id,
    })

    if (!updated) {
      throw new Error(`Message not found: ${message.messageId}`)
    }

    message.taskId = task.id

    this.taskStorage.setTask(task.id, task)
  }

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

  addToolResultToHistory(
    task: A2A.Task,
    toolResult: AnyToolResult,
  ): void {
    const { output: _, ...toolCall } = toolResult

    const toolCallMessage: A2A.Message = {
      kind: "message",
      messageId: this.createMessageId(),
      role: "agent",
      parts: [{
        kind: "data",
        data: toolCall,
      }],
      taskId: task.id,
      contextId: task.contextId,
    }

    const toolResultMessage: A2A.Message = {
      kind: "message",
      messageId: this.createMessageId(),
      role: "agent",
      parts: [{
        kind: "data",
        data: { ...toolResult },
      }],
      taskId: task.id,
      contextId: task.contextId,
    }

    this.addMessageToHistory(task, toolCallMessage)
    this.addMessageToHistory(task, toolResultMessage)
  }

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

  extractTextFromMessage(message: A2A.Message): string {
    return message.parts
      .filter((part): part is A2A.TextPart => part.kind === "text")
      .map((part) => part.text)
      .filter(Boolean)
      .join(" ")
  }

  getTask(taskId: string): A2A.Task | undefined {
    return this.taskStorage.getTask(taskId)
  }

  getTasksByContext(contextId: string): A2A.Task[] {
    return this.taskStorage.getTasksByContext(contextId)
  }

  private createMessageId(): string {
    return `msg_${crypto.randomUUID()}`
  }
}
