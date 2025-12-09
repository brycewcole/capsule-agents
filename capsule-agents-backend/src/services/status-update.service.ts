import type * as A2A from "@a2a-js/sdk"
import * as Vercel from "ai"
import { a2aMessageRepository } from "../repositories/message.repository.ts"

const STATUS_UPDATE_INTERVAL_MS = 10000

export class StatusUpdateService {
  private intervals: Map<string, number> = new Map()
  private abortControllers: Map<string, AbortController> = new Map()

  /**
   * Start generating periodic status updates for a task
   * @param taskId Task ID
   * @param contextId Context ID
   * @param getModel Function to get the current model
   * @param getActivity Function to get current activity (user message + agent steps)
   * @param eventEmitter Callback to emit status update events
   */
  startStatusUpdates(
    taskId: string,
    contextId: string,
    getModel: () => Vercel.LanguageModel,
    getActivity: () => {
      userMessage: A2A.Message
      steps: Array<{
        text?: string
        toolCalls?: Array<{ toolName: string; input: unknown }>
        toolResults?: Array<{ toolName: string; output: unknown }>
      }>
    },
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
        getActivity,
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
    getActivity: () => {
      userMessage: A2A.Message
      steps: Array<{
        text?: string
        toolCalls?: Array<{ toolName: string; input: unknown }>
        toolResults?: Array<{ toolName: string; output: unknown }>
      }>
    },
    eventEmitter: (event: A2A.TaskStatusUpdateEvent) => void,
    signal: AbortSignal,
  ): Promise<void> {
    try {
      if (signal.aborted) {
        return
      }

      const model = getModel()
      const activity = getActivity()

      // If no activity yet, skip status generation
      if (activity.steps.length === 0) {
        return
      }

      const recentStatuses = a2aMessageRepository.getRecentStatusTexts(
        taskId,
        5,
      )
      const dedupedStatuses = recentStatuses
        .map((s) => s.trim())
        .filter(Boolean)

      const systemPrompt =
        `You are a concise status update generator for an AI agent. Your task is to provide brief, one-line updates about what the agent is currently doing.
        Keep the updates specific and avoid vague statements. Good examples include 
        - 'Using web search to search for information about X...'
        - 'Running whoami command to get user details...',
        - 'Working on script to pull data from X...'
         Do not repeat recent statuses.`

      // Extract user request text
      const userRequestText = activity.userMessage.parts
        .filter((p) => p.kind === "text")
        .map((p) => (p as A2A.TextPart).text)
        .join(" ")

      // Build agent activity summary
      const activitySummary = activity.steps.map((step, idx) => {
        const parts: string[] = []
        if (step.text) parts.push(`Text: "${step.text.slice(0, 100)}..."`)
        if (step.toolCalls) {
          parts.push(
            `Tool calls: ${step.toolCalls.map((tc) => tc.toolName).join(", ")}`,
          )
        }
        if (step.toolResults) {
          parts.push(
            `Tool results: ${
              step.toolResults.map((tr) => tr.toolName).join(", ")
            }`,
          )
        }
        return `Step ${idx + 1}: ${parts.join("; ")}`
      }).join("\n")

      const prompt = `Generate a short status update.

User request: ${userRequestText}

Agent progress so far:
${activitySummary}

Recent statuses:
${
        dedupedStatuses.length > 0
          ? dedupedStatuses.map((s) => `- ${s}`).join("\n")
          : "- None"
      }`

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
}
