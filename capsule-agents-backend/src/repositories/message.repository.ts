import type * as A2A from "@a2a-js/sdk"
import { getDb } from "../infrastructure/db.ts"
import { getChanges } from "./sqlite-utils.ts"

const parseMetadata = (metadataJson: string | null | undefined): Record<string, unknown> => {
  if (!metadataJson) return {}
  try {
    const parsed = JSON.parse(metadataJson)
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {}
  } catch (_error) {
    return {}
  }
}

const addTimestampToMetadata = (
  metadata: Record<string, unknown>,
  timestampSeconds: number,
): Record<string, unknown> => {
  return {
    ...metadata,
    timestamp: new Date(timestampSeconds * 1000).toISOString(),
  }
}

export interface StoredA2AMessage {
  id: string
  contextId: string
  taskId?: string
  role: "user" | "agent"
  parts: A2A.Part[]
  timestamp: number
  metadata: Record<string, unknown>
}

export class A2AMessageRepository {
  createMessage(message: A2A.Message): StoredA2AMessage {
    if (!message.contextId) {
      throw new Error("Message contextId is required")
    }

    const role = message.role as "user" | "agent"
    const db = getDb()
    const ts = Date.now() / 1000
    const metadata = message.metadata
      ? JSON.parse(JSON.stringify(message.metadata)) as Record<string, unknown>
      : {}
    const stmt = db.prepare(
      `INSERT INTO messages (id, context_id, task_id, role, parts, metadata, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    stmt.run(
      message.messageId,
      message.contextId,
      message.taskId ?? null,
      role,
      JSON.stringify(message.parts ?? []),
      JSON.stringify(metadata),
      ts,
    )

    return {
      id: message.messageId,
      contextId: message.contextId,
      taskId: message.taskId,
      role,
      parts: message.parts ?? [],
      timestamp: ts,
      metadata: addTimestampToMetadata(metadata, ts),
    }
  }

  getMessage(id: string): A2A.Message | undefined {
    const db = getDb()
    const row = db.prepare(
      `SELECT id, context_id, task_id, role, parts, metadata, timestamp FROM messages WHERE id = ?`,
    ).get(id) as
      | {
        id: string
        context_id: string
        task_id: string | null
        role: "user" | "agent"
        parts: string
        metadata: string | null
        timestamp: number
      }
      | undefined
    if (!row) return undefined
    const metadata = addTimestampToMetadata(parseMetadata(row.metadata), row.timestamp)
    return {
      kind: "message",
      messageId: row.id,
      contextId: row.context_id,
      taskId: row.task_id || undefined,
      role: row.role,
      parts: JSON.parse(row.parts),
      metadata,
    }
  }

  getContextMessages(
    contextId: string,
    includeTaskMessages: boolean = false,
  ): A2A.Message[] {
    const db = getDb()
    const where = includeTaskMessages
      ? `context_id = ?`
      : `context_id = ? AND task_id IS NULL`
    const rows = db.prepare(
      `SELECT id, context_id, task_id, role, parts, metadata, timestamp FROM messages WHERE ${where} ORDER BY timestamp ASC`,
    ).all(contextId) as {
      id: string
      context_id: string
      task_id: string | null
      role: "user" | "agent"
      parts: string
      metadata: string | null
      timestamp: number
    }[]
    return rows.map((row) => ({
      kind: "message" as const,
      messageId: row.id,
      contextId: row.context_id,
      taskId: row.task_id || undefined,
      role: row.role,
      parts: JSON.parse(row.parts),
      metadata: addTimestampToMetadata(parseMetadata(row.metadata), row.timestamp),
    }))
  }

  getTaskMessages(taskId: string): A2A.Message[] {
    const db = getDb()
    const rows = db.prepare(
      `SELECT id, context_id, task_id, role, parts, metadata, timestamp FROM messages WHERE task_id = ? ORDER BY timestamp ASC`,
    ).all(taskId) as {
      id: string
      context_id: string
      task_id: string | null
      role: "user" | "agent"
      parts: string
      metadata: string | null
      timestamp: number
    }[]
    return rows.map((row) => ({
      kind: "message" as const,
      messageId: row.id,
      contextId: row.context_id,
      taskId: row.task_id || undefined,
      role: row.role,
      parts: JSON.parse(row.parts),
      metadata: addTimestampToMetadata(parseMetadata(row.metadata), row.timestamp),
    }))
  }

  updateMessage(
    id: string,
    updates: Partial<
      Pick<
        StoredA2AMessage,
        "contextId" | "taskId" | "role" | "parts" | "timestamp" | "metadata"
      >
    >,
  ): boolean {
    const db = getDb()
    const fields: string[] = []
    const values: (string | number | null)[] = []

    if (Object.prototype.hasOwnProperty.call(updates, "contextId")) {
      if (updates.contextId == null) {
        throw new Error("contextId cannot be null")
      }
      fields.push("context_id = ?")
      values.push(updates.contextId)
    }

    if (Object.prototype.hasOwnProperty.call(updates, "taskId")) {
      fields.push("task_id = ?")
      values.push((updates.taskId ?? null) as string | null)
    }

    if (Object.prototype.hasOwnProperty.call(updates, "role")) {
      if (!updates.role) {
        throw new Error("role cannot be null")
      }
      fields.push("role = ?")
      values.push(updates.role)
    }

    if (Object.prototype.hasOwnProperty.call(updates, "parts")) {
      fields.push("parts = ?")
      values.push(JSON.stringify(updates.parts ?? []))
    }

    if (Object.prototype.hasOwnProperty.call(updates, "metadata")) {
      fields.push("metadata = ?")
      values.push(JSON.stringify(updates.metadata ?? {}))
    }

    if (Object.prototype.hasOwnProperty.call(updates, "timestamp")) {
      fields.push("timestamp = ?")
      if (updates.timestamp == null) {
        throw new Error("timestamp cannot be null")
      }
      values.push(updates.timestamp)
    }

    if (fields.length === 0) return false

    values.push(id)
    const res = db.prepare(
      `UPDATE messages SET ${fields.join(", ")} WHERE id = ?`,
    ).run(
      ...values,
    )

    return getChanges(res) > 0
  }

  deleteMessage(id: string): boolean {
    const db = getDb()
    const res = db.prepare(`DELETE FROM messages WHERE id = ?`).run(id)
    return getChanges(res) > 0
  }

  deleteContextMessages(contextId: string): number {
    const db = getDb()
    const res = db.prepare(`DELETE FROM messages WHERE context_id = ?`).run(
      contextId,
    )
    return getChanges(res)
  }

  deleteTaskMessages(taskId: string): number {
    const db = getDb()
    const res = db.prepare(`DELETE FROM messages WHERE task_id = ?`).run(taskId)
    return getChanges(res)
  }
}

export const a2aMessageRepository = new A2AMessageRepository()
