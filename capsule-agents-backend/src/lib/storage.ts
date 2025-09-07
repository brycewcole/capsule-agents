import { getDb } from "./db.ts"
import type * as A2A from "@a2a-js/sdk"
import { TaskStorage } from "./task-storage.ts"

export interface StoredContext {
  id: string
  metadata: Record<string, unknown>
  createdAt: number
  updatedAt: number
}

export interface StoredMessage {
  id: string
  contextId: string
  taskId?: string
  role: "user" | "agent"
  parts: A2A.Part[]
  timestamp: number
}

export class ContextStorage {
  createContext(id?: string, metadata: Record<string, unknown> = {}): string {
    const db = getDb()
    const contextId = id || crypto.randomUUID()
    const now = Date.now() / 1000

    const stmt = db.prepare(`
      INSERT INTO contexts (id, metadata, created_at, updated_at) 
      VALUES (?, ?, ?, ?)
    `)
    stmt.run(contextId, JSON.stringify(metadata), now, now)

    return contextId
  }

  getContext(id: string): StoredContext | undefined {
    const db = getDb()
    const stmt = db.prepare(`
      SELECT id, metadata, created_at, updated_at 
      FROM contexts 
      WHERE id = ?
    `)

    const row = stmt.get(id) as {
      id: string
      metadata: string
      created_at: number
      updated_at: number
    } | undefined

    if (!row) return undefined

    return {
      id: row.id,
      metadata: JSON.parse(row.metadata),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  updateContext(id: string, metadata: Record<string, unknown>): boolean {
    const db = getDb()
    const now = Date.now() / 1000

    const stmt = db.prepare(`
      UPDATE contexts 
      SET metadata = ?, updated_at = ? 
      WHERE id = ?
    `)
    const result = stmt.run(JSON.stringify(metadata), now, id) as unknown as {
      changes: number
    }
    return result.changes > 0
  }

  deleteContext(id: string): boolean {
    const db = getDb()
    const stmt = db.prepare("DELETE FROM contexts WHERE id = ?")
    const result = stmt.run(id) as unknown as { changes: number }
    return result.changes > 0
  }

  getAllContexts(): StoredContext[] {
    const db = getDb()
    const stmt = db.prepare(`
      SELECT id, metadata, created_at, updated_at 
      FROM contexts 
      ORDER BY updated_at DESC
    `)

    const rows = stmt.all() as {
      id: string
      metadata: string
      created_at: number
      updated_at: number
    }[]

    return rows.map((row) => ({
      id: row.id,
      metadata: JSON.parse(row.metadata),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))
  }

  touchContext(id: string): void {
    const db = getDb()
    const now = Date.now() / 1000
    const stmt = db.prepare("UPDATE contexts SET updated_at = ? WHERE id = ?")
    stmt.run(now, id)
  }
}

export class MessageStorage {
  createMessage(message: A2A.Message): StoredMessage {
    if (!message.contextId) {
      throw new Error("Message contextId is required")
    }

    const db = getDb()
    const now = Date.now() / 1000

    const stmt = db.prepare(`
      INSERT INTO messages (id, context_id, task_id, role, parts, timestamp) 
      VALUES (?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      message.messageId,
      message.contextId,
      message.taskId || null,
      message.role,
      JSON.stringify(message.parts),
      now,
    )

    return {
      id: message.messageId,
      contextId: message.contextId,
      taskId: message.taskId,
      role: message.role,
      parts: message.parts,
      timestamp: now,
    }
  }

  getMessage(id: string): A2A.Message | undefined {
    const db = getDb()
    const stmt = db.prepare(`
      SELECT id, context_id, task_id, role, parts, timestamp 
      FROM messages 
      WHERE id = ?
    `)

    const row = stmt.get(id) as {
      id: string
      context_id: string
      task_id: string | null
      role: string
      parts: string
      timestamp: number
    } | undefined

    if (!row) return undefined

    return {
      kind: "message",
      messageId: row.id,
      contextId: row.context_id,
      taskId: row.task_id || undefined,
      role: row.role as "user" | "agent",
      parts: JSON.parse(row.parts),
    }
  }

  getContextMessages(
    contextId: string,
    includeTaskMessages: boolean = false,
  ): A2A.Message[] {
    const db = getDb()
    const whereClause = includeTaskMessages
      ? "WHERE context_id = ?"
      : "WHERE context_id = ? AND task_id IS NULL"

    const stmt = db.prepare(`
      SELECT id, context_id, task_id, role, parts, timestamp 
      FROM messages 
      ${whereClause}
      ORDER BY timestamp ASC
    `)

    const rows = stmt.all(contextId) as {
      id: string
      context_id: string
      task_id: string | null
      role: string
      parts: string
      timestamp: number
    }[]

    return rows.map((row) => ({
      kind: "message" as const,
      messageId: row.id,
      contextId: row.context_id,
      taskId: row.task_id || undefined,
      role: row.role as "user" | "agent",
      parts: JSON.parse(row.parts),
      timestamp: new Date(row.timestamp * 1000).toISOString(),
    }))
  }

  getTaskMessages(taskId: string): A2A.Message[] {
    const db = getDb()
    const stmt = db.prepare(`
      SELECT id, context_id, task_id, role, parts, timestamp 
      FROM messages 
      WHERE task_id = ?
      ORDER BY timestamp ASC
    `)

    const rows = stmt.all(taskId) as {
      id: string
      context_id: string
      task_id: string | null
      role: string
      parts: string
      timestamp: number
    }[]

    return rows.map((row) => ({
      kind: "message" as const,
      messageId: row.id,
      contextId: row.context_id,
      taskId: row.task_id || undefined,
      role: row.role as "user" | "agent",
      parts: JSON.parse(row.parts),
      timestamp: new Date(row.timestamp * 1000).toISOString(),
    }))
  }

  deleteMessage(id: string): boolean {
    const db = getDb()
    const stmt = db.prepare("DELETE FROM messages WHERE id = ?")
    const result = stmt.run(id) as unknown as { changes: number }
    return result.changes > 0
  }

  deleteContextMessages(contextId: string): number {
    const db = getDb()
    const stmt = db.prepare("DELETE FROM messages WHERE context_id = ?")
    const result = stmt.run(contextId) as unknown as { changes: number }
    return result.changes
  }

  deleteTaskMessages(taskId: string): number {
    const db = getDb()
    const stmt = db.prepare("DELETE FROM messages WHERE task_id = ?")
    const result = stmt.run(taskId) as unknown as { changes: number }
    return result.changes
  }
}

// Chat management types for API compatibility
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
  private contextStorage = new ContextStorage()
  private messageStorage = new MessageStorage()
  private taskStorage = new TaskStorage()

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
      const messages = this.messageStorage.getContextMessages(context.id, false)

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

    const messages = this.messageStorage.getContextMessages(contextId, false)
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
    this.messageStorage.createMessage(message)
    if (message.contextId) {
      this.contextStorage.touchContext(message.contextId)
    }
  }
}

// Create singleton instances for backwards compatibility
export const contextStorage = new ContextStorage()
export const messageStorage = new MessageStorage()
export const chatService = new ChatService()

// Legacy function exports for backwards compatibility
export const createChat = chatService.createChat.bind(chatService)
export const createChatWithId = (contextId: string) =>
  chatService.createChat(contextId)
export const getChatsList = chatService.getChatsList.bind(chatService)
export const getChatWithHistory = chatService.getChatWithHistory.bind(
  chatService,
)
export const deleteChatById = chatService.deleteChatById.bind(chatService)
export const updateChatMetadata = chatService.updateChatMetadata.bind(
  chatService,
)
