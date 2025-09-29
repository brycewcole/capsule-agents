import type { UIMessage } from "ai"
import { getDb } from "../infrastructure/db.ts"
import { getChanges } from "./sqlite-utils.ts"

export interface StoredVercelMessage {
  id: string
  contextId: string
  taskId?: string
  role: UIMessage["role"]
  message: UIMessage
  metadata: Record<string, unknown>
  createdAt: number
  updatedAt: number
}

export interface CreateVercelMessageParams {
  message: UIMessage
  contextId: string
  taskId?: string
  metadata?: Record<string, unknown>
}

export class VercelMessageRepository {
  createMessage(params: CreateVercelMessageParams): StoredVercelMessage {
    const db = getDb()
    const now = Date.now() / 1000

    const messageId = params.message.id || crypto.randomUUID()
    const normalizedMessage: UIMessage = { ...params.message, id: messageId }

    if (!normalizedMessage.role) {
      throw new Error("UIMessage role is required")
    }

    const metadata = params.metadata ?? {}

    const stmt = db.prepare(`
      INSERT INTO vercel_messages (id, context_id, task_id, role, payload, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      messageId,
      params.contextId,
      params.taskId ?? null,
      normalizedMessage.role,
      JSON.stringify(normalizedMessage),
      JSON.stringify(metadata),
      now,
      now,
    )

    return {
      id: messageId,
      contextId: params.contextId,
      taskId: params.taskId,
      role: normalizedMessage.role,
      message: normalizedMessage,
      metadata,
      createdAt: now,
      updatedAt: now,
    }
  }

  getMessage(id: string): StoredVercelMessage | undefined {
    const db = getDb()
    const row = db.prepare(`
      SELECT id, context_id, task_id, role, payload, metadata, created_at, updated_at
      FROM vercel_messages WHERE id = ?
    `).get(id) as
      | {
        id: string
        context_id: string
        task_id: string | null
        role: string
        payload: string
        metadata: string
        created_at: number
        updated_at: number
      }
      | undefined

    if (!row) return undefined

    return {
      id: row.id,
      contextId: row.context_id,
      taskId: row.task_id || undefined,
      role: row.role as UIMessage["role"],
      message: JSON.parse(row.payload),
      metadata: JSON.parse(row.metadata ?? "{}"),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  getMessagesByContext(contextId: string): StoredVercelMessage[] {
    const db = getDb()
    const rows = db.prepare(`
      SELECT id, context_id, task_id, role, payload, metadata, created_at, updated_at
      FROM vercel_messages WHERE context_id = ? ORDER BY created_at ASC
    `).all(contextId) as {
      id: string
      context_id: string
      task_id: string | null
      role: string
      payload: string
      metadata: string
      created_at: number
      updated_at: number
    }[]

    return rows.map((row) => ({
      id: row.id,
      contextId: row.context_id,
      taskId: row.task_id || undefined,
      role: row.role as UIMessage["role"],
      message: JSON.parse(row.payload),
      metadata: JSON.parse(row.metadata ?? "{}"),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))
  }

  getMessagesByTask(taskId: string): StoredVercelMessage[] {
    const db = getDb()
    const rows = db.prepare(`
      SELECT id, context_id, task_id, role, payload, metadata, created_at, updated_at
      FROM vercel_messages WHERE task_id = ? ORDER BY created_at ASC
    `).all(taskId) as {
      id: string
      context_id: string
      task_id: string | null
      role: string
      payload: string
      metadata: string
      created_at: number
      updated_at: number
    }[]

    return rows.map((row) => ({
      id: row.id,
      contextId: row.context_id,
      taskId: row.task_id || undefined,
      role: row.role as UIMessage["role"],
      message: JSON.parse(row.payload),
      metadata: JSON.parse(row.metadata ?? "{}"),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))
  }

  updateMessage(
    id: string,
    updates: Partial<
      Pick<
        StoredVercelMessage,
        "contextId" | "taskId" | "role" | "message" | "metadata"
      >
    >,
  ): boolean {
    const db = getDb()
    const fields: string[] = []
    const values: (string | number | null)[] = []

    if (Object.prototype.hasOwnProperty.call(updates, "contextId")) {
      if (!updates.contextId) {
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

    if (Object.prototype.hasOwnProperty.call(updates, "message")) {
      if (!updates.message) {
        throw new Error("message cannot be null")
      }
      const normalizedMessage: UIMessage = {
        ...updates.message,
        id: updates.message.id || id,
      }
      if (!normalizedMessage.role) {
        throw new Error("UIMessage role is required")
      }
      fields.push("payload = ?")
      values.push(JSON.stringify(normalizedMessage))

      // Keep role in sync unless explicitly overridden above
      if (!Object.prototype.hasOwnProperty.call(updates, "role")) {
        fields.push("role = ?")
        values.push(normalizedMessage.role)
      }
    }

    if (Object.prototype.hasOwnProperty.call(updates, "metadata")) {
      fields.push("metadata = ?")
      values.push(JSON.stringify(updates.metadata ?? {}))
    }

    if (fields.length === 0) return false

    const now = Date.now() / 1000
    fields.push("updated_at = ?")
    values.push(now)
    values.push(id)

    const res = db.prepare(
      `UPDATE vercel_messages SET ${fields.join(", ")} WHERE id = ?`,
    ).run(...values)

    return getChanges(res) > 0
  }

  deleteMessage(id: string): boolean {
    const db = getDb()
    const res = db.prepare(`DELETE FROM vercel_messages WHERE id = ?`).run(id)
    return getChanges(res) > 0
  }

  deleteContextMessages(contextId: string): number {
    const db = getDb()
    const res = db.prepare(`DELETE FROM vercel_messages WHERE context_id = ?`)
      .run(contextId)
    return getChanges(res)
  }

  deleteTaskMessages(taskId: string): number {
    const db = getDb()
    const res = db.prepare(`DELETE FROM vercel_messages WHERE task_id = ?`).run(
      taskId,
    )
    return getChanges(res)
  }
}

export const vercelMessageRepository = new VercelMessageRepository()
