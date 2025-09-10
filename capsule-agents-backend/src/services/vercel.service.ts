import type * as A2A from "@a2a-js/sdk"
import type { UIDataTypes, UIMessage, UIMessagePart, UITools } from "ai"
import { MessageRepository } from "../repositories/message.repository.ts"
import { TaskRepository } from "../repositories/task.repository.ts"
import { isToolCallData, isToolResultData } from "../lib/types.ts"

interface MessageWithTimestamp extends A2A.Message {
  timestamp: string
}

export class VercelService {
  constructor(
    private messageRepository: MessageRepository,
    private taskRepository: TaskRepository
  ) {}

  private transformA2AToUIMessage(a2aMessage: A2A.Message): UIMessage {
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
        if (dataPart.data && isToolCallData(dataPart.data)) {
          const data = dataPart.data
          uiParts.push({
            type: `tool-${data.name}`,
            toolCallId: data.id,
            state: "input-available",
            input: data.args || {},
            providerExecuted: true,
          })
        } else if (dataPart.data && isToolResultData(dataPart.data)) {
          const data = dataPart.data
          uiParts.push({
            type: `tool-${data.name}`,
            toolCallId: data.id,
            state: "output-available",
            input: {},
            output: data.response,
            providerExecuted: true,
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
      .filter((message): message is MessageWithTimestamp =>
        Boolean((message as MessageWithTimestamp).timestamp)
      )
      .sort((a, b) => {
        const timeA = new Date(a.timestamp).getTime()
        const timeB = new Date(b.timestamp).getTime()
        return timeA - timeB
      })

    return allMessages.map((message) => this.transformA2AToUIMessage(message))
  }
}
