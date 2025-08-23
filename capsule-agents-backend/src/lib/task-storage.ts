import { getDb } from "./db.ts"
import type * as A2A from "@a2a-js/sdk"
import type { TaskStore } from "@a2a-js/sdk/server"

export class TaskStorage implements TaskStore {
  private taskCounter = 0

  createTaskId(): string {
    return `task-${++this.taskCounter}-${Date.now()}`
  }

  // deno-lint-ignore require-await
  async save(task: A2A.Task): Promise<void> {
    this.setTask(task.id, task)
  }

  // deno-lint-ignore require-await
  async load(taskId: string): Promise<A2A.Task | undefined> {
    const taskWithTimestamps = this.getTask(taskId)
    if (!taskWithTimestamps) return undefined

    // Return just the Task without our additional timestamp fields
    const { created_at: _createdAt, updated_at: _updatedAt, ...task } =
      taskWithTimestamps
    return task
  }

  setTask(id: string, task: A2A.Task): void {
    const db = getDb()
    const now = Date.now() / 1000

    const stmt = db.prepare(`
      INSERT OR REPLACE INTO a2a_tasks 
      (id, context_id, status, history, metadata, created_at, updated_at) 
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)

    // Check if task already exists to preserve created_at
    const existing = this.getTask(id)
    const createdAt = existing ? existing.created_at : now

    stmt.run(
      id,
      task.contextId,
      JSON.stringify(task.status),
      JSON.stringify(task.history || []),
      JSON.stringify(task.metadata || {}),
      createdAt,
      now,
    )
  }

  getTask(
    id: string,
  ): (A2A.Task & { created_at: number; updated_at: number }) | undefined {
    const db = getDb()
    const stmt = db.prepare(`
      SELECT id, context_id, status, history, metadata, created_at, updated_at 
      FROM a2a_tasks 
      WHERE id = ?
    `)

    const row = stmt.get(id) as {
      id: string
      context_id: string
      status: string
      history: string
      metadata: string
      created_at: number
      updated_at: number
    } | undefined

    if (!row) return undefined

    return {
      id: row.id,
      kind: "task" as const,
      contextId: row.context_id,
      status: JSON.parse(row.status),
      history: JSON.parse(row.history),
      metadata: JSON.parse(row.metadata),
      created_at: row.created_at,
      updated_at: row.updated_at,
    }
  }

  getAllTasks(): (A2A.Task & { created_at: number; updated_at: number })[] {
    const db = getDb()
    const stmt = db.prepare(`
      SELECT id, context_id, status, history, metadata, created_at, updated_at 
      FROM a2a_tasks 
      ORDER BY created_at DESC
    `)

    const rows = stmt.all() as {
      id: string
      context_id: string
      status: string
      history: string
      metadata: string
      created_at: number
      updated_at: number
    }[]

    return rows.map((row) => ({
      id: row.id,
      kind: "task" as const,
      contextId: row.context_id,
      status: JSON.parse(row.status),
      history: JSON.parse(row.history),
      metadata: JSON.parse(row.metadata),
      created_at: row.created_at,
      updated_at: row.updated_at,
    }))
  }

  getTasksByContext(
    contextId: string,
  ): (A2A.Task & { created_at: number; updated_at: number })[] {
    const db = getDb()
    const stmt = db.prepare(`
      SELECT id, context_id, status, history, metadata, created_at, updated_at 
      FROM a2a_tasks 
      WHERE context_id = ?
      ORDER BY created_at ASC
    `)

    const rows = stmt.all(contextId) as {
      id: string
      context_id: string
      status: string
      history: string
      metadata: string
      created_at: number
      updated_at: number
    }[]

    return rows.map((row) => ({
      id: row.id,
      kind: "task" as const,
      contextId: row.context_id,
      status: JSON.parse(row.status),
      history: JSON.parse(row.history),
      metadata: JSON.parse(row.metadata),
      created_at: row.created_at,
      updated_at: row.updated_at,
    }))
  }

  deleteTask(id: string): boolean {
    const db = getDb()
    const stmt = db.prepare("DELETE FROM a2a_tasks WHERE id = ?")
    const result = stmt.run(id) as unknown as { changes: number }
    return result.changes > 0
  }

  // Utility method to clean up old completed tasks
  cleanupOldTasks(olderThanDays: number = 7): number {
    const db = getDb()
    const cutoffTime = (Date.now() / 1000) - (olderThanDays * 24 * 60 * 60)

    const stmt = db.prepare(`
      DELETE FROM a2a_tasks 
      WHERE updated_at < ? 
      AND JSON_EXTRACT(status, '$.state') IN ('completed', 'failed', 'canceled')
    `)

    const result = stmt.run(cutoffTime) as unknown as { changes: number }
    return result.changes
  }
}
