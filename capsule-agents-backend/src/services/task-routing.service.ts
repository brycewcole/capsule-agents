import type * as A2A from "@a2a-js/sdk"
import * as Vercel from "ai"
import { tool } from "ai"
import { z } from "zod"
import { A2AMessageRepository } from "../repositories/message.repository.ts"
import { buildSystemPrompt } from "../lib/default-prompts.ts"
import type { AgentConfigService } from "./agent-config.ts"
import type { VercelService } from "./vercel.service.ts"

export class TaskRoutingService {
  constructor(
    private agentConfigService: AgentConfigService,
    private vercelService: VercelService,
    private a2aMessageRepository: A2AMessageRepository,
  ) {}

  /**
   * Decide whether a message should create a task or get a direct response
   */
  async handleInitialRouting(
    _params: A2A.MessageSendParams,
    contextId: string,
    model: Vercel.LanguageModel,
  ): Promise<{
    shouldCreateTask: boolean
    initialResponse?: A2A.Message
  }> {
    const vercelMessages = this.vercelService.fromContext(contextId)
    const sanitizedMessages = this.removeReasoningParts(vercelMessages)

    const agentInfo = this.agentConfigService.getAgentInfo()
    const { prompt: agentSystemPrompt } = buildSystemPrompt({
      userPrompt: agentInfo.description,
      modelId: agentInfo.model_name,
      enabled: agentInfo.built_in_prompts_enabled !== false,
    })

    console.info("Initial routing: checking if task creation is needed")

    // Build conversation summary from messages
    const conversationSummary = sanitizedMessages.map((msg, idx) => {
      const role = msg.role === "user" ? "User" : "Agent"
      const content = msg.parts
        .map((p) => {
          if (p.type === "text") return p.text
          if (p.type === "tool-call") {
            // deno-lint-ignore no-explicit-any
            return `[Tool call: ${(p as any).toolName || "unknown"}]`
          }
          if (p.type === "tool-result") {
            // deno-lint-ignore no-explicit-any
            return `[Tool result: ${(p as any).toolName || "unknown"}]`
          }
          return "[Other content]"
        })
        .join(" ")
      return `Message ${idx + 1} (${role}): ${content.slice(0, 200)}${
        content.length > 200 ? "..." : ""
      }`
    }).join("\n")

    const systemPrompt =
      `You are a routing assistant that decides whether a user request needs task creation or can be answered directly.

Agent description: ${agentInfo.description || "A helpful assistant"}
${agentSystemPrompt ? `\nAgent system prompt: ${agentSystemPrompt}` : ""}

Call the createTask tool if the request requires:
- Tool execution (file access, web search, API calls, etc.)
- Multi-step processing
- Research or data gathering
- Complex operations

Respond directly (without calling createTask) if the request is:
- A simple question that can be answered from your knowledge
- A greeting or casual conversation
- A clarification request
- Something that doesn't need tools`

    const prompt =
      `Review this conversation and decide how to handle the latest user message:

Conversation:
${conversationSummary}

Either call createTask to handle this as a task, or respond directly with an answer.`

    const result = await Vercel.generateText({
      model,
      system: systemPrompt,
      prompt,
      tools: {
        createTask: tool({
          description:
            "Create a task for complex requests that require tool execution, research, or multi-step processing",
          inputSchema: z.object({}),
        }),
      },
    })

    console.log("Initial routing model response:", {
      text: result.text,
      toolCalls: result.toolCalls,
    })

    for (const toolCall of result.toolCalls) {
      if (toolCall.toolName === "createTask") {
        console.info("Initial routing decided to create a task")
        return { shouldCreateTask: true }
      }
    }

    // Model did not call createTask - respond directly
    const message: A2A.Message = {
      kind: "message",
      messageId: crypto.randomUUID(),
      role: "agent",
      parts: [{ kind: "text", text: result.text.trim() }],
      contextId,
    }
    this.a2aMessageRepository.createMessage(message)
    this.vercelService.createMessage({
      message: {
        id: message.messageId,
        role: "assistant",
        parts: [{ type: "text", text: result.text.trim() }],
      },
      contextId,
    })

    return {
      shouldCreateTask: false,
      initialResponse: message,
    }
  }

  private removeReasoningParts(
    messages: Vercel.UIMessage[],
  ): Vercel.UIMessage[] {
    let removedCount = 0

    const cleaned = messages
      .map((message) => {
        const filteredParts = message.parts.filter((part) => {
          const isReasoning = part.type === "reasoning"
          if (isReasoning) {
            removedCount++
          }
          return !isReasoning
        })

        if (filteredParts.length === message.parts.length) {
          return message
        }

        return {
          ...message,
          parts: filteredParts,
        }
      })
      .filter((message) => message.parts.length > 0)

    if (removedCount > 0) {
      console.info(
        `Removed ${removedCount} reasoning part(s) from stored context before model call`,
      )
    }

    return cleaned
  }
}
