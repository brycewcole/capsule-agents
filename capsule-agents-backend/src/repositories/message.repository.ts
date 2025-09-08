import type * as A2A from "@a2a-js/sdk"
import { getDb } from "../infrastructure/db.ts"

export interface StoredMessage {
  id: string
  contextId: string
  taskId?: string
  role: "user" | "agent"
  parts: A2A.Part[]
  timestamp: number
}

export class MessageRepository {
  createMessage(message: A2A.Message): StoredMessage {
    if (!message.contextId) {
      throw new Error("Message contextId is required")
    }

    const role = message.role as "user" | "agent"
    const db = getDb()
    const ts = Date.now() / 1000
    const stmt = db.prepare(
      `INSERT INTO messages (id, context_id, task_id, role, parts, timestamp) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    stmt.run(
      message.messageId,
      message.contextId,
      message.taskId ?? null,
      role,
      JSON.stringify(message.parts ?? []),
      ts,
    )

    return {
      id: message.messageId,
      contextId: message.contextId,
      taskId: message.taskId,
      role,
      parts: message.parts ?? [],
      timestamp: ts,
    }
  }

  getMessage(id: string): A2A.Message | undefined {
    const db = getDb()
    const row = db.prepare(
      `SELECT id, context_id, task_id, role, parts, timestamp FROM messages WHERE id = ?`,
    ).get(id) as
      | {
        id: string
        context_id: string
        task_id: string | null
        role: "user" | "agent"
        parts: string
        timestamp: number
      }
      | undefined
    if (!row) return undefined
    return {
      kind: "message",
      messageId: row.id,
      contextId: row.context_id,
      taskId: row.task_id || undefined,
      role: row.role,
      parts: JSON.parse(row.parts),
    }
  }

  getContextMessages(
    contextId: string,
    includeTaskMessages: boolean = false,
  ): A2A.Message[] {
    const db = getDb()
    const where = includeTaskMessages ? `context_id = ?` : `context_id = ? AND task_id IS NULL`
    const rows = db.prepare(
      `SELECT id, context_id, task_id, role, parts, timestamp FROM messages WHERE ${where} ORDER BY timestamp ASC`,
    ).all(contextId) as {
      id: string
      context_id: string
      task_id: string | null
      role: "user" | "agent"
      parts: string
      timestamp: number
    }[]
    return rows.map((row) => ({
      kind: "message" as const,
      messageId: row.id,
      contextId: row.context_id,
      taskId: row.task_id || undefined,
      role: row.role,
      parts: JSON.parse(row.parts),
      timestamp: new Date(row.timestamp * 1000).toISOString(),
    }))
  }

  getTaskMessages(taskId: string): A2A.Message[] {
    const db = getDb()
    const rows = db.prepare(
      `SELECT id, context_id, task_id, role, parts, timestamp FROM messages WHERE task_id = ? ORDER BY timestamp ASC`,
    ).all(taskId) as {
      id: string
      context_id: string
      task_id: string | null
      role: "user" | "agent"
      parts: string
      timestamp: number
    }[]
    return rows.map((row) => ({
      kind: "message" as const,
      messageId: row.id,
      contextId: row.context_id,
      taskId: row.task_id || undefined,
      role: row.role,
      parts: JSON.parse(row.parts),
      timestamp: new Date(row.timestamp * 1000).toISOString(),
    }))
  }

  deleteMessage(id: string): boolean {
    const db = getDb()
    const res = db.prepare(`DELETE FROM messages WHERE id = ?`).run(id) as unknown as { changes: number }
    return res.changes > 0
  }

  deleteContextMessages(contextId: string): number {
    const db = getDb()
    const res = db.prepare(`DELETE FROM messages WHERE context_id = ?`).run(contextId) as unknown as { changes: number }
    return res.changes
  }

  deleteTaskMessages(taskId: string): number {
    const db = getDb()
    const res = db.prepare(`DELETE FROM messages WHERE task_id = ?`).run(taskId) as unknown as { changes: number }
    return res.changes
  }
}

export const messageRepository = new MessageRepository()
