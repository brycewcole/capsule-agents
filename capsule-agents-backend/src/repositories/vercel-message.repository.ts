import type { UIMessage } from "ai"
import { getDb } from "../infrastructure/db.ts"
import {
  DBMessagePart,
  mapDBPartToUIMessagePart,
  mapUIMessagePartsToDBParts,
} from "../lib/vercel-message-mapping.ts"

export interface StoredVercelMessage {
  id: string
  contextId: string
  taskId?: string
  role: UIMessage["role"]
  createdAt: number
}

export interface CreateVercelMessageParams {
  message: UIMessage
  contextId: string
  taskId?: string
}

export class VercelMessageRepository {
  upsertMessage(params: CreateVercelMessageParams): void {
    const db = getDb()
    const now = Date.now() / 1000

    const messageId = params.message.id || crypto.randomUUID()
    const normalizedMessage: UIMessage = { ...params.message, id: messageId }

    if (!normalizedMessage.role) {
      throw new Error("UIMessage role is required")
    }

    const mappedParts = mapUIMessagePartsToDBParts(
      normalizedMessage.parts || [],
      messageId,
    )

    // Use transaction for atomic upsert
    const insertMessage = db.prepare(`
      INSERT INTO vercel_messages (id, context_id, task_id, role, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        context_id = excluded.context_id,
        task_id = excluded.task_id,
        role = excluded.role
    `)

    const deleteParts = db.prepare(
      `DELETE FROM vercel_message_parts WHERE message_id = ?`,
    )

    const insertPart = db.prepare(`
      INSERT INTO vercel_message_parts (
        id, message_id, type, order_index, created_at,
        text_text, reasoning_text,
        file_mediaType, file_filename, file_url,
        source_url_sourceId, source_url_url, source_url_title,
        source_document_sourceId, source_document_mediaType,
        source_document_title, source_document_filename,
        tool_toolCallId, tool_state, tool_errorText,
        tool_input, tool_output, provider_metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const transaction = db.transaction(() => {
      insertMessage.run(
        messageId,
        params.contextId,
        params.taskId ?? null,
        normalizedMessage.role,
        now,
      )

      deleteParts.run(messageId)

      if (mappedParts.length > 0) {
        for (const part of mappedParts) {
          const partId = crypto.randomUUID()
          insertPart.run(
            partId,
            part.messageId,
            part.type,
            part.orderIndex,
            now,
            part.text_text ?? null,
            part.reasoning_text ?? null,
            part.file_mediaType ?? null,
            part.file_filename ?? null,
            part.file_url ?? null,
            part.source_url_sourceId ?? null,
            part.source_url_url ?? null,
            part.source_url_title ?? null,
            part.source_document_sourceId ?? null,
            part.source_document_mediaType ?? null,
            part.source_document_title ?? null,
            part.source_document_filename ?? null,
            part.tool_toolCallId ?? null,
            part.tool_state ?? null,
            part.tool_errorText ?? null,
            part.tool_input ?? null,
            part.tool_output ?? null,
            part.provider_metadata ?? null,
          )
        }
      }
    })

    transaction()
  }

  // Legacy createMessage method - calls upsertMessage
  createMessage(params: CreateVercelMessageParams): StoredVercelMessage {
    const now = Date.now() / 1000
    const messageId = params.message.id || crypto.randomUUID()

    // Call upsertMessage synchronously
    this.upsertMessage(params)

    return {
      id: messageId,
      contextId: params.contextId,
      taskId: params.taskId,
      role: params.message.role,
      createdAt: now,
    }
  }

  getMessage(id: string): UIMessage | undefined {
    const db = getDb()

    const messageRow = db.prepare(`
      SELECT id, context_id, task_id, role, created_at
      FROM vercel_messages WHERE id = ?
    `).get(id) as
      | {
        id: string
        context_id: string
        task_id: string | null
        role: string
        created_at: number
      }
      | undefined

    if (!messageRow) return undefined

    const partRows = db.prepare(`
      SELECT * FROM vercel_message_parts
      WHERE message_id = ?
      ORDER BY order_index ASC
    `).all(id) as DBMessagePart[]

    return {
      id: messageRow.id,
      role: messageRow.role as UIMessage["role"],
      parts: partRows.map((part) => mapDBPartToUIMessagePart(part)),
    }
  }

  getMessagesByContext(contextId: string): UIMessage[] {
    const db = getDb()

    const messageRows = db.prepare(`
      SELECT id, context_id, task_id, role, created_at
      FROM vercel_messages
      WHERE context_id = ?
      ORDER BY created_at ASC
    `).all(contextId) as {
      id: string
      context_id: string
      task_id: string | null
      role: string
      created_at: number
    }[]

    return messageRows.map((messageRow) => {
      const partRows = db.prepare(`
        SELECT * FROM vercel_message_parts
        WHERE message_id = ?
        ORDER BY order_index ASC
      `).all(messageRow.id) as DBMessagePart[]

      return {
        id: messageRow.id,
        role: messageRow.role as UIMessage["role"],
        parts: partRows.map((part) => mapDBPartToUIMessagePart(part)),
      }
    })
  }

  getMessagesByTask(taskId: string): UIMessage[] {
    const db = getDb()

    const messageRows = db.prepare(`
      SELECT id, context_id, task_id, role, created_at
      FROM vercel_messages
      WHERE task_id = ?
      ORDER BY created_at ASC
    `).all(taskId) as {
      id: string
      context_id: string
      task_id: string | null
      role: string
      created_at: number
    }[]

    return messageRows.map((messageRow) => {
      const partRows = db.prepare(`
        SELECT * FROM vercel_message_parts
        WHERE message_id = ?
        ORDER BY order_index ASC
      `).all(messageRow.id) as DBMessagePart[]

      return {
        id: messageRow.id,
        role: messageRow.role as UIMessage["role"],
        parts: partRows.map((part) => mapDBPartToUIMessagePart(part)),
      }
    })
  }

  deleteMessage(id: string): boolean {
    const db = getDb()
    const result = db.prepare(`DELETE FROM vercel_messages WHERE id = ?`).run(
      id,
    )
    return result.changes > 0
  }

  deleteContextMessages(contextId: string): number {
    const db = getDb()
    const result = db.prepare(
      `DELETE FROM vercel_messages WHERE context_id = ?`,
    ).run(contextId)
    return result.changes
  }

  deleteTaskMessages(taskId: string): number {
    const db = getDb()
    const result = db.prepare(
      `DELETE FROM vercel_messages WHERE task_id = ?`,
    ).run(taskId)
    return result.changes
  }
}

export const vercelMessageRepository = new VercelMessageRepository()
