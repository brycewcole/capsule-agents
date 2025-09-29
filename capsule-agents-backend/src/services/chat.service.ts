import type * as A2A from "@a2a-js/sdk"
import { ContextRepository } from "../repositories/context.repository.ts"
import { A2AMessageRepository } from "../repositories/message.repository.ts"
import { TaskRepository } from "../repositories/task.repository.ts"

export interface ChatSummary {
  id: string
  title: string
  lastActivity: number
  messageCount: number
  preview: string
  createTime: number
}

export interface ChatWithHistory {
  contextId: string
  title: string
  messages: A2A.Message[]
  tasks: A2A.Task[]
  metadata: Record<string, unknown>
  createTime: number
  updateTime: number
}

export class ChatService {
  private contextStorage = new ContextRepository()
  private messageStorage = new A2AMessageRepository()
  private taskStorage = new TaskRepository()

  createChat(id?: string): string {
    return this.contextStorage.createContext(id)
  }

  // Extract text from A2A message parts
  private extractTextFromMessage(message: A2A.Message): string {
    return message.parts
      .filter((part): part is A2A.TextPart => part.kind === "text")
      .map((part) => part.text)
      .join(" ")
      .trim()
  }

  // Generate title from first user message
  private generateChatTitle(messages: A2A.Message[]): string {
    const firstUserMessage = messages.find((m) => m.role === "user")
    if (!firstUserMessage) return "New Chat"

    const text = this.extractTextFromMessage(firstUserMessage)
    if (!text) return "New Chat"

    const title = text.slice(0, 50).trim()
    return title.length < text.length ? title + "..." : title
  }

  // Get preview from last message
  private getMessagePreview(messages: A2A.Message[]): string {
    if (messages.length === 0) return "No messages"

    const lastMessage = messages[messages.length - 1]
    const text = this.extractTextFromMessage(lastMessage)
    if (!text) return "No content"

    const preview = text.slice(0, 100).trim()
    return preview.length < text.length ? preview + "..." : preview
  }

  getChatsList(): ChatSummary[] {
    const contexts = this.contextStorage.getAllContexts()
    const chatSummaries: ChatSummary[] = []

    for (const context of contexts) {
      // Include messages that belong to tasks so previews/counts reflect reality
      const messages = this.messageStorage.getContextMessages(context.id, true)

      if (messages.length > 0) {
        chatSummaries.push({
          id: context.id,
          title: this.generateChatTitle(messages),
          lastActivity: context.updatedAt,
          messageCount: messages.length,
          preview: this.getMessagePreview(messages),
          createTime: context.createdAt,
        })
      }
    }

    return chatSummaries
  }

  getChatWithHistory(contextId: string): ChatWithHistory | null {
    const context = this.contextStorage.getContext(contextId)
    if (!context) return null

    // Include both context-level and task-linked messages
    const messages = this.messageStorage.getContextMessages(contextId, true)
    const tasks = this.taskStorage.getTasksByContext(contextId)

    return {
      contextId,
      title: this.generateChatTitle(messages),
      messages,
      tasks,
      metadata: context.metadata,
      createTime: context.createdAt,
      updateTime: context.updatedAt,
    }
  }

  deleteChatById(contextId: string): boolean {
    return this.contextStorage.deleteContext(contextId)
  }

  updateChatMetadata(
    contextId: string,
    metadata: Record<string, unknown>,
  ): boolean {
    return this.contextStorage.updateContext(contextId, metadata)
  }

  addMessage(message: A2A.Message): void {
    // Ensure context exists and normalize roles at service layer
    if (!message.contextId) throw new Error("Message contextId is required")

    if (!this.contextStorage.getContext(message.contextId)) {
      this.contextStorage.createContext(message.contextId)
    }

    const normalized: A2A.Message = {
      ...message,
      role: message.role as "user" | "agent",
    }

    this.messageStorage.createMessage(normalized)
    if (message.contextId) {
      this.contextStorage.touchContext(message.contextId)
    }
  }
}
