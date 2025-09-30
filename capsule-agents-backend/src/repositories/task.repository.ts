// deno-lint-ignore-file require-await
import type * as A2A from "@a2a-js/sdk"
import type { TaskStore } from "@a2a-js/sdk/server"
import { getDb } from "../infrastructure/db.ts"
import { ArtifactRepository } from "./artifact.repository.ts"
import { getChanges } from "./sqlite-utils.ts"

export interface StoredTask {
  id: string
  contextId: string
  statusState: A2A.Task["status"]["state"]
  statusTimestamp: string
  statusMessageId?: string
  metadata: Record<string, unknown>
  createdAt: number
  updatedAt: number
}

export class TaskRepository implements TaskStore {
  private taskCounter = 0
  private artifactStorage = new ArtifactRepository()

  createTaskId(): string {
    return `task_${++this.taskCounter}_${Date.now()}`
  }

  async save(task: A2A.Task): Promise<void> {
    this.setTask(task.id, task)
  }

  async load(taskId: string): Promise<A2A.Task | undefined> {
    return this.getTask(taskId)
  }

  setTask(id: string, task: A2A.Task): void {
    const db = getDb()
    const now = Date.now() / 1000
    const existing = this.getStoredTask(id)
    const createdAt = existing ? existing.createdAt : now
    const stmt = db.prepare(`
      INSERT INTO tasks (id, context_id, status_state, status_timestamp, status_message_id, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        context_id = excluded.context_id,
        status_state = excluded.status_state,
        status_timestamp = excluded.status_timestamp,
        status_message_id = excluded.status_message_id,
        metadata = excluded.metadata,
        updated_at = excluded.updated_at
    `)
    stmt.run(
      id,
      task.contextId,
      task.status.state,
      task.status.timestamp,
      task.status.message?.messageId || null,
      JSON.stringify(task.metadata || {}),
      createdAt,
      now,
    )
  }

  getTask(id: string): A2A.Task | undefined {
    const storedTask = this.getStoredTask(id)
    if (!storedTask) return undefined
    return this.buildA2ATask(storedTask)
  }

  getStoredTask(id: string): StoredTask | undefined {
    const db = getDb()
    const row = db.prepare(`
      SELECT id, context_id, status_state, status_timestamp, status_message_id, metadata, created_at, updated_at
      FROM tasks WHERE id = ?
    `).get(id) as
      | {
        id: string
        context_id: string
        status_state: string
        status_timestamp: string
        status_message_id: string | null
        metadata: string
        created_at: number
        updated_at: number
      }
      | undefined
    if (!row) return undefined
    return {
      id: row.id,
      contextId: row.context_id,
      statusState: row.status_state as A2A.Task["status"]["state"],
      statusTimestamp: row.status_timestamp,
      statusMessageId: row.status_message_id || undefined,
      metadata: JSON.parse(row.metadata),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  getAllTasks(): A2A.Task[] {
    const db = getDb()
    const rows = db.prepare(`
      SELECT id, context_id, status_state, status_timestamp, status_message_id, metadata, created_at, updated_at
      FROM tasks ORDER BY created_at DESC
    `).all() as {
      id: string
      context_id: string
      status_state: string
      status_timestamp: string
      status_message_id: string | null
      metadata: string
      created_at: number
      updated_at: number
    }[]
    return rows.map((row) =>
      this.buildA2ATask({
        id: row.id,
        contextId: row.context_id,
        statusState: row.status_state as A2A.Task["status"]["state"],
        statusTimestamp: row.status_timestamp,
        statusMessageId: row.status_message_id || undefined,
        metadata: JSON.parse(row.metadata),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })
    )
  }

  getTasksByContext(contextId: string): A2A.Task[] {
    const db = getDb()
    const rows = db.prepare(`
      SELECT id, context_id, status_state, status_timestamp, status_message_id, metadata, created_at, updated_at
      FROM tasks WHERE context_id = ? ORDER BY created_at ASC
    `).all(contextId) as {
      id: string
      context_id: string
      status_state: string
      status_timestamp: string
      status_message_id: string | null
      metadata: string
      created_at: number
      updated_at: number
    }[]
    return rows.map((row) =>
      this.buildA2ATask({
        id: row.id,
        contextId: row.context_id,
        statusState: row.status_state as A2A.Task["status"]["state"],
        statusTimestamp: row.status_timestamp,
        statusMessageId: row.status_message_id || undefined,
        metadata: JSON.parse(row.metadata),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })
    )
  }

  deleteTask(id: string): boolean {
    const db = getDb()
    const res = db.prepare(`DELETE FROM tasks WHERE id = ?`).run(id)
    return getChanges(res) > 0
  }

  // Build A2A Task from stored data, including messages and artifacts
  private buildA2ATask(stored: StoredTask): A2A.Task {
    // Get task messages (history)
    const messages = this.getTaskMessages(stored.id)

    // Get task artifacts
    const storedArtifacts = this.artifactStorage.getArtifactsByTask(stored.id)
    const artifacts = this.artifactStorage.toA2AArtifacts(storedArtifacts)

    // Build status message if exists
    let statusMessage: A2A.Message | undefined
    if (stored.statusMessageId) {
      statusMessage = this.getStatusMessage(stored.statusMessageId)
    }

    const task: A2A.Task = {
      id: stored.id,
      kind: "task",
      contextId: stored.contextId,
      status: {
        state: stored.statusState,
        timestamp: stored.statusTimestamp,
        message: statusMessage,
      },
      history: messages,
      metadata: stored.metadata,
    }

    if (artifacts.length > 0) {
      task.artifacts = artifacts
    }

    return task
  }

  // Get messages that belong to this task
  private getTaskMessages(taskId: string): A2A.Message[] {
    const db = getDb()
    const rows = db.prepare(`
      SELECT id, context_id, role, parts, timestamp FROM messages WHERE task_id = ? ORDER BY timestamp ASC
    `).all(taskId) as {
      id: string
      context_id: string
      role: string
      parts: string
      timestamp: number
    }[]
    return rows.map((row) => ({
      kind: "message" as const,
      messageId: row.id,
      contextId: row.context_id,
      taskId: taskId,
      role: row.role as "user" | "agent",
      parts: JSON.parse(row.parts),
      metadata: {
        timestamp: new Date(row.timestamp * 1000).toISOString(),
      },
    }))
  }

  // Get status message by ID
  private getStatusMessage(messageId: string): A2A.Message | undefined {
    const db = getDb()
    const row = db.prepare(`
      SELECT id, context_id, task_id, role, parts, timestamp FROM messages WHERE id = ?
    `).get(messageId) as
      | {
        id: string
        context_id: string
        task_id: string | null
        role: string
        parts: string
        timestamp: number
      }
      | undefined
    if (!row) return undefined
    return {
      kind: "message" as const,
      messageId: row.id,
      contextId: row.context_id,
      taskId: row.task_id || undefined,
      role: row.role as "user" | "agent",
      parts: JSON.parse(row.parts),
    }
  }

  // Utility method to clean up old completed tasks
  cleanupOldTasks(olderThanDays: number = 7): number {
    const db = getDb()
    const cutoffTime = (Date.now() / 1000) - (olderThanDays * 24 * 60 * 60)

    const stmt = db.prepare(`
      DELETE FROM tasks 
      WHERE updated_at < ? 
      AND status_state IN ('completed', 'failed', 'canceled')
    `)

    const result = stmt.run(cutoffTime)
    return getChanges(result)
  }
}
