import type * as A2A from "@a2a-js/sdk"
import * as Vercel from "ai"
import { a2aMessageRepository } from "../repositories/message.repository.ts"

const STATUS_UPDATE_INTERVAL_MS = 5000

export class StatusUpdateService {
  private intervals: Map<string, number> = new Map()
  private abortControllers: Map<string, AbortController> = new Map()

  /**
   * Start generating periodic status updates for a task
   * @param taskId Task ID
   * @param contextId Context ID
   * @param getModel Function to get the current model
   * @param getMessageHistory Function to get current message history
   * @param eventEmitter Callback to emit status update events
   */
  startStatusUpdates(
    taskId: string,
    contextId: string,
    getModel: () => Vercel.LanguageModel,
    getMessageHistory: () => Vercel.ModelMessage[],
    eventEmitter: (event: A2A.TaskStatusUpdateEvent) => void,
  ): void {
    if (this.intervals.has(taskId)) {
      console.warn(`Status updates already running for task ${taskId}`)
      return
    }

    console.info(`Starting status updates for task ${taskId}`)

    const abortController = new AbortController()
    this.abortControllers.set(taskId, abortController)

    const intervalId = setInterval(() => {
      this.generateAndEmitStatus(
        taskId,
        contextId,
        getModel,
        getMessageHistory,
        eventEmitter,
        abortController.signal,
      )
    }, STATUS_UPDATE_INTERVAL_MS)

    this.intervals.set(taskId, intervalId)
  }

  /**
   * Stop generating status updates for a task
   * @param taskId Task ID
   */
  stopStatusUpdates(taskId: string): void {
    const intervalId = this.intervals.get(taskId)
    if (intervalId !== undefined) {
      clearInterval(intervalId)
      this.intervals.delete(taskId)
      console.debug(`Stopped status updates for task ${taskId}`)
    }

    const abortController = this.abortControllers.get(taskId)
    if (abortController) {
      abortController.abort()
      this.abortControllers.delete(taskId)
    }
  }

  /**
   * Generate a status update and emit it
   */
  private async generateAndEmitStatus(
    taskId: string,
    contextId: string,
    getModel: () => Vercel.LanguageModel,
    getMessageHistory: () => Vercel.ModelMessage[],
    eventEmitter: (event: A2A.TaskStatusUpdateEvent) => void,
    signal: AbortSignal,
  ): Promise<void> {
    try {
      if (signal.aborted) {
        return
      }

      const model = getModel()
      const messages = this.removeReasoningParts(getMessageHistory())

      const recentStatuses = a2aMessageRepository.getRecentStatusTexts(
        taskId,
        5,
      )
      const dedupedStatuses = recentStatuses
        .map((s) => s.trim())
        .filter(Boolean)

      const systemPrompt =
        `You are a concise status update generator for an AI agent. Your task is to provide brief, one-line updates about what the agent is currently doing. Keep the updates specific and avoid vague statements. Good examples include 'Searching for information...', 'Processing data...', or 'Calling API...'. Do not repeat recent statuses.`

      const prompt = `Generate a short status update.
      Conversation history:
      ${
        messages.map((m) =>
          `- ${m.role}: ${
            typeof m.content === "string" ? m.content : m.content
              .map((part) =>
                typeof part === "string"
                  ? part
                  : (part as { text?: string }).text || ""
              )
              .join(" ")
          }`
        ).join("\n")
      }
      Recent statuses:
      ${
        dedupedStatuses.length > 0
          ? dedupedStatuses.map((s) => `- ${s}`).join("\n")
          : "- None"
      }
      Provide a new status update that is not in the recent statuses list.`

      const result = await Vercel.generateText({
        model,
        system: systemPrompt,
        prompt,
        abortSignal: signal,
      })

      if (signal.aborted) {
        return
      }

      const statusText = result.text.trim()

      console.info(`Generated status update for task ${taskId}: ${statusText}`)

      this.emitStatusMessage(taskId, contextId, statusText, eventEmitter)
    } catch (error) {
      if (!signal.aborted) {
        console.error(
          `Error generating status update for task ${taskId}:`,
          error,
        )
      }
    }
  }

  /**
   * Clean up all running status updates
   */
  cleanup(): void {
    for (const taskId of this.intervals.keys()) {
      this.stopStatusUpdates(taskId)
    }
  }

  private emitStatusMessage(
    taskId: string,
    contextId: string,
    statusText: string,
    eventEmitter: (event: A2A.TaskStatusUpdateEvent) => void,
  ): void {
    const statusMessage: A2A.Message = {
      kind: "message",
      messageId: `status_${crypto.randomUUID()}`,
      role: "agent",
      parts: [{ kind: "text", text: statusText }],
      taskId,
      contextId,
      metadata: {
        kind: "status-message",
        timestamp: new Date().toISOString(),
      },
    }

    a2aMessageRepository.createMessage(statusMessage)

    eventEmitter({
      kind: "status-update",
      taskId,
      contextId,
      status: {
        state: "working",
        timestamp: new Date().toISOString(),
        message: statusMessage,
      },
      final: false,
    })
  }

  /**
   * Strip reasoning parts to avoid provider errors when reusing history
   */
  private removeReasoningParts(
    messages: Vercel.ModelMessage[],
  ): Vercel.ModelMessage[] {
    return messages.map((message) => {
      if (
        typeof message.content === "string" ||
        !Array.isArray(message.content)
      ) {
        return message as Vercel.ModelMessage
      }

      const filteredContent = message.content.filter((part) =>
        (part as { type?: string }).type !== "reasoning"
      ) as typeof message.content

      return { ...message, content: filteredContent } as Vercel.ModelMessage
    })
  }
}
