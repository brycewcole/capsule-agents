import type {
  DiscordHookConfig,
  HookExecutionResult,
  OutputHook,
  TaskCompletionPayload,
} from "../hook-types.ts"
import type * as A2A from "@a2a-js/sdk"

export class DiscordHook implements OutputHook {
  readonly type = "discord"
  private config: DiscordHookConfig

  constructor(config: DiscordHookConfig) {
    this.config = config
  }

  async execute(payload: TaskCompletionPayload): Promise<HookExecutionResult> {
    const startTime = Date.now()

    try {
      const message = this.formatDiscordMessage(payload)

      const response = await fetch(this.config.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message),
      })

      if (!response.ok) {
        throw new Error(
          `Discord webhook failed: ${response.status} ${response.statusText}`,
        )
      }

      return {
        hookType: this.type,
        success: true,
        executionTimeMs: Date.now() - startTime,
      }
    } catch (error) {
      return {
        hookType: this.type,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTimeMs: Date.now() - startTime,
      }
    }
  }

  private formatDiscordMessage(payload: TaskCompletionPayload): object {
    const { task, artifacts } = payload

    // Build embeds for Discord rich message
    const embeds: object[] = []

    // Main task status embed
    const statusEmoji = this.getStatusEmoji(task.status.state)
    embeds.push({
      title: `${statusEmoji} Task ${
        task.status.state.charAt(0).toUpperCase() +
        task.status.state.slice(1)
      }`,
      description: this.getTaskDescription(task),
      color: this.getStatusColor(task.status.state),
      timestamp: payload.completedAt,
      fields: [
        { name: "Task ID", value: task.id, inline: true },
        { name: "Context ID", value: task.contextId, inline: true },
      ],
    })

    // Add artifact embeds
    if (artifacts.length > 0) {
      for (const artifact of artifacts.slice(0, 3)) { // Limit to 3 artifacts
        const content = this.extractArtifactContent(artifact)
        embeds.push({
          title: artifact.name || "Artifact",
          description: content.slice(0, 4096), // Discord limit
          color: 0x5865F2, // Discord blurple
        })
      }
    }

    return {
      embeds,
      // Include source info in content if from schedule
      content: payload.source?.type === "schedule"
        ? `Scheduled task "${payload.source.scheduleName}" completed`
        : undefined,
    }
  }

  private getStatusEmoji(state: string): string {
    switch (state) {
      case "completed":
        return "✅"
      case "failed":
        return "❌"
      case "canceled":
        return "🚫"
      default:
        return "📋"
    }
  }

  private getStatusColor(state: string): number {
    switch (state) {
      case "completed":
        return 0x57F287 // Green
      case "failed":
        return 0xED4245 // Red
      case "canceled":
        return 0xFEE75C // Yellow
      default:
        return 0x5865F2 // Blurple
    }
  }

  private getTaskDescription(task: A2A.Task): string {
    // Extract text from last message in history
    const lastMessage = task.history?.[task.history.length - 1]
    if (lastMessage) {
      const textParts = lastMessage.parts
        .filter((p): p is A2A.TextPart => p.kind === "text")
        .map((p) => p.text)
      return textParts.join("\n").slice(0, 2048)
    }
    return "Task completed"
  }

  private extractArtifactContent(artifact: A2A.Artifact): string {
    return artifact.parts
      .filter((p): p is A2A.TextPart => p.kind === "text")
      .map((p) => p.text)
      .join("\n")
  }
}
