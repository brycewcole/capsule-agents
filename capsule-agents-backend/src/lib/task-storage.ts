// deno-lint-ignore-file require-await
import type * as A2A from "@a2a-js/sdk"
import type { TaskStore } from "@a2a-js/sdk/server"
import { ArtifactRepository } from "./artifact-storage.ts"
import { getDb } from "./db.ts"
import { getRepository, type DbTaskRow } from "./repository.ts"

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
    const repo = getRepository()
    const now = Date.now() / 1000
    const existing = this.getStoredTask(id)
    const createdAt = existing ? existing.createdAt : now
    const row: DbTaskRow = {
      id,
      context_id: task.contextId,
      status_state: task.status.state,
      status_timestamp: task.status.timestamp,
      status_message_id: task.status.message?.messageId || null,
      metadata: JSON.stringify(task.metadata || {}),
      created_at: createdAt,
      updated_at: now,
    }
    repo.upsertTask(row)
  }

  getTask(id: string): A2A.Task | undefined {
    const storedTask = this.getStoredTask(id)
    if (!storedTask) return undefined

    return this.buildA2ATask(storedTask)
  }

  getStoredTask(id: string): StoredTask | undefined {
    const repo = getRepository()
    const row = repo.getTaskRow(id)
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
    const repo = getRepository()
    const rows = repo.listAllTasks()
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
    const repo = getRepository()
    const rows = repo.listTasksByContext(contextId)
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
    const repo = getRepository()
    return repo.deleteTask(id)
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
    const repo = getRepository()
    const rows = repo.listMessagesByTask(taskId)
    return rows.map((row) => ({
      kind: "message" as const,
      messageId: row.id,
      contextId: row.context_id,
      taskId: taskId,
      role: row.role as "user" | "agent",
      parts: JSON.parse(row.parts),
      timestamp: new Date(row.timestamp * 1000).toISOString(),
    }))
  }

  // Get status message by ID
  private getStatusMessage(messageId: string): A2A.Message | undefined {
    const repo = getRepository()
    const row = repo.getMessage(messageId)
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

    const result = stmt.run(cutoffTime) as unknown as { changes: number }
    return result.changes
  }
}
