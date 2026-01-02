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
    const { artifacts } = payload

    // Extract plain text content from all artifacts
    if (artifacts.length === 0) {
      return {
        content: "Task completed with no artifacts.",
      }
    }

    const artifactTexts = artifacts.map((artifact) => {
      const content = this.extractArtifactContent(artifact)
      const name = artifact.name ? `**${artifact.name}**\n` : ""
      return `${name}${content}`
    })

    // Join all artifacts with double newlines and limit to Discord's 2000 char limit
    const content = artifactTexts.join("\n\n").slice(0, 2000)

    return {
      content,
    }
  }

  private extractArtifactContent(artifact: A2A.Artifact): string {
    return artifact.parts
      .filter((p): p is A2A.TextPart => p.kind === "text")
      .map((p) => p.text)
      .join("\n")
  }
}
