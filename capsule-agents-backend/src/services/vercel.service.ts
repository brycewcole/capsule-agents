import type * as A2A from "@a2a-js/sdk"
import type { UIDataTypes, UIMessage, UIMessagePart, UITools } from "ai"
import { isToolCallData, isToolResultData } from "../lib/types.ts"
import {
  CreateVercelMessageParams,
  StoredVercelMessage,
  VercelMessageRepository,
} from "../repositories/vercel-message.repository.ts"

export class VercelService {
  constructor(
    private vercelMessageRepository: VercelMessageRepository,
  ) {}

  upsertMessage(params: CreateVercelMessageParams): Promise<void> {
    return this.vercelMessageRepository.upsertMessage(params)
  }

  createMessage(params: CreateVercelMessageParams): StoredVercelMessage {
    return this.vercelMessageRepository.createMessage(params)
  }

  getMessage(id: string): UIMessage | undefined {
    return this.vercelMessageRepository.getMessage(id)
  }

  getContextMessages(contextId: string): UIMessage[] {
    return this.vercelMessageRepository.getMessagesByContext(contextId)
  }

  getTaskMessages(taskId: string): UIMessage[] {
    return this.vercelMessageRepository.getMessagesByTask(taskId)
  }

  deleteMessage(id: string): boolean {
    return this.vercelMessageRepository.deleteMessage(id)
  }

  deleteContextMessages(contextId: string): number {
    return this.vercelMessageRepository.deleteContextMessages(contextId)
  }

  deleteTaskMessages(taskId: string): number {
    return this.vercelMessageRepository.deleteTaskMessages(taskId)
  }

  fromA2AToUIMessage(a2aMessage: A2A.Message): UIMessage {
    const uiParts: UIMessagePart<UIDataTypes, UITools>[] = []

    for (const part of a2aMessage.parts || []) {
      if (part.kind === "text") {
        const textPart = part
        uiParts.push({
          type: "text",
          text: textPart.text,
          state: "done",
        })
      } else if (part.kind === "data") {
        const dataPart = part
        if (isToolCallData(dataPart.data)) {
          const data = dataPart.data
          uiParts.push({
            type: `tool-${data.toolName}`,
            toolCallId: data.toolCallId,
            state: "input-available",
            input: data.input || {},
          })
        } else if (isToolResultData(dataPart.data)) {
          const data = dataPart.data
          uiParts.push({
            type: `tool-${data.toolName}`,
            toolCallId: data.toolCallId,
            state: "output-available",
            input: {},
            output: data.output,
          })
        }
      }
    }

    return {
      id: a2aMessage.messageId,
      role: a2aMessage.role === "agent" ? "assistant" : "user",
      parts: uiParts,
    }
  }

  fromUIMessageToA2A(
    uiMessage: UIMessage,
    contextId: string,
    taskId?: string,
  ): A2A.Message {
    const a2aParts: A2A.Part[] = []

    for (const part of uiMessage.parts) {
      if (part.type === "text") {
        a2aParts.push({
          kind: "text",
          text: part.text,
        })
      } else if (part.type.startsWith("tool-")) {
        const toolName = part.type.substring(5) // Remove "tool-" prefix
        const toolPart = part as {
          type: string
          toolCallId: string
          state: string
          input?: unknown
          output?: unknown
        }

        // Add tool call as data part
        if (toolPart.state === "input-available" || toolPart.state === "output-available") {
          a2aParts.push({
            kind: "data",
            data: {
              type: "tool-call",
              toolName,
              toolCallId: toolPart.toolCallId,
              input: toolPart.input,
            },
          })

          // Add tool result if available
          if (toolPart.state === "output-available" && toolPart.output !== undefined) {
            a2aParts.push({
              kind: "data",
              data: {
                type: "tool-result",
                toolName,
                toolCallId: toolPart.toolCallId,
                output: toolPart.output,
              },
            })
          }
        }
      }
    }

    return {
      kind: "message",
      messageId: uiMessage.id,
      contextId,
      taskId,
      role: uiMessage.role === "assistant" ? "agent" : "user",
      parts: a2aParts,
      metadata: {
        timestamp: new Date().toISOString(),
      },
    }
  }

  fromContext(contextId: string): UIMessage[] {
    return this.vercelMessageRepository.getMessagesByContext(contextId)
  }
}
