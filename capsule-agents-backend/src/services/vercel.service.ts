import type * as A2A from "@a2a-js/sdk"
import type { UIDataTypes, UIMessage, UIMessagePart, UITools } from "ai"
import { isToolCallData, isToolResultData } from "../lib/types.ts"
import { MessageRepository } from "../repositories/message.repository.ts"
import { TaskRepository } from "../repositories/task.repository.ts"

export class VercelService {
  constructor(
    private messageRepository: MessageRepository,
    private taskRepository: TaskRepository,
  ) {}

  transformA2AToUIMessage(a2aMessage: A2A.Message): UIMessage {
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

  fromContext(contextId: string): UIMessage[] {
    const contextMessages = this.messageRepository.getContextMessages(
      contextId,
      false,
    )

    const tasks = this.taskRepository.getTasksByContext(contextId)
    const taskMessages = tasks.flatMap((task) => task.history || [])

    const allMessages = [...contextMessages, ...taskMessages]

    // Validate all messages have timestamps
    for (const message of allMessages) {
      if (!message.metadata?.timestamp) {
        throw new Error(
          `Message ${message.messageId} is missing timestamp in metadata`,
        )
      }
    }

    const sortedMessages = allMessages.sort((a, b) => {
      const timeA = new Date(a.metadata!.timestamp as string).getTime()
      const timeB = new Date(b.metadata!.timestamp as string).getTime()
      return timeA - timeB
    })

    return sortedMessages.map((message) =>
      this.transformA2AToUIMessage(message)
    )
  }
}
