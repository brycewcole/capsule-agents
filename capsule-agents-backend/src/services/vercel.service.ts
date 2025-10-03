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

  upsertMessage(params: CreateVercelMessageParams): void {
    this.vercelMessageRepository.upsertMessage(params)
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

    const textParts = uiMessage.parts.filter((part) => part.type === "text")
    const lastTextPart = textParts[textParts.length - 1]

    if (lastTextPart) {
      a2aParts.push({
        kind: "text",
        text: lastTextPart.text,
      })
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
