import type { Database } from "better-sqlite3"
import { getDb } from "./db.ts"

// Low-level typed row definitions that mirror the SQLite schema
// NOTE: JSON fields are stored as strings at the DB layer

export type DbContextRow = {
  id: string
  metadata: string // JSON string
  created_at: number // unix seconds
  updated_at: number // unix seconds
}

export type DbMessageRow = {
  id: string
  context_id: string
  task_id: string | null
  role: "user" | "agent"
  parts: string // JSON string
  timestamp: number // unix seconds
}

export type DbTaskRow = {
  id: string
  context_id: string
  status_state:
    | "submitted"
    | "working"
    | "input-required"
    | "completed"
    | "canceled"
    | "failed"
    | "rejected"
    | "auth-required"
    | "unknown"
  status_timestamp: string // ISO timestamp
  status_message_id: string | null
  metadata: string // JSON string
  created_at: number // unix seconds
  updated_at: number // unix seconds
}

export type DbArtifactRow = {
  id: string
  task_id: string
  name: string | null
  description: string | null
  parts: string // JSON string
  created_at: number // unix seconds
}

export class Repository {
  private db: Database

  constructor(db?: Database) {
    this.db = db ?? getDb()
  }

  // CONTEXTS
  insertContext(row: Omit<DbContextRow, "created_at" | "updated_at"> & {
    created_at?: number
    updated_at?: number
  }): DbContextRow {
    const now = Date.now() / 1000
    const created = row.created_at ?? now
    const updated = row.updated_at ?? created
    const stmt = this.db.prepare(
      `INSERT INTO contexts (id, metadata, created_at, updated_at) VALUES (?, ?, ?, ?)`,
    )
    stmt.run(row.id, row.metadata, created, updated)
    return { id: row.id, metadata: row.metadata, created_at: created, updated_at: updated }
  }

  getContext(id: string): DbContextRow | undefined {
    const stmt = this.db.prepare(
      `SELECT id, metadata, created_at, updated_at FROM contexts WHERE id = ?`,
    )
    return stmt.get(id) as DbContextRow | undefined
  }

  updateContextMetadata(id: string, metadata: string): boolean {
    const now = Date.now() / 1000
    const stmt = this.db.prepare(
      `UPDATE contexts SET metadata = ?, updated_at = ? WHERE id = ?`,
    )
    const res = stmt.run(metadata, now, id) as unknown as { changes: number }
    return res.changes > 0
  }

  deleteContext(id: string): boolean {
    const stmt = this.db.prepare(`DELETE FROM contexts WHERE id = ?`)
    const res = stmt.run(id) as unknown as { changes: number }
    return res.changes > 0
  }

  listContextsByUpdatedDesc(): DbContextRow[] {
    const stmt = this.db.prepare(
      `SELECT id, metadata, created_at, updated_at FROM contexts ORDER BY updated_at DESC`,
    )
    return stmt.all() as DbContextRow[]
  }

  touchContext(id: string): void {
    const now = Date.now() / 1000
    const stmt = this.db.prepare(`UPDATE contexts SET updated_at = ? WHERE id = ?`)
    stmt.run(now, id)
  }

  // MESSAGES
  insertMessage(row: Omit<DbMessageRow, "timestamp"> & { timestamp?: number }): DbMessageRow {
    const ts = row.timestamp ?? (Date.now() / 1000)
    const stmt = this.db.prepare(
      `INSERT INTO messages (id, context_id, task_id, role, parts, timestamp) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    stmt.run(row.id, row.context_id, row.task_id ?? null, row.role, row.parts, ts)
    return {
      id: row.id,
      context_id: row.context_id,
      task_id: row.task_id ?? null,
      role: row.role,
      parts: row.parts,
      timestamp: ts,
    }
  }

  getMessage(id: string): DbMessageRow | undefined {
    const stmt = this.db.prepare(
      `SELECT id, context_id, task_id, role, parts, timestamp FROM messages WHERE id = ?`,
    )
    return stmt.get(id) as DbMessageRow | undefined
  }

  listMessagesByContext(contextId: string, includeTaskMessages = false): DbMessageRow[] {
    const where = includeTaskMessages ? `context_id = ?` : `context_id = ? AND task_id IS NULL`
    const stmt = this.db.prepare(
      `SELECT id, context_id, task_id, role, parts, timestamp FROM messages WHERE ${where} ORDER BY timestamp ASC`,
    )
    return stmt.all(contextId) as DbMessageRow[]
  }

  listMessagesByTask(taskId: string): DbMessageRow[] {
    const stmt = this.db.prepare(
      `SELECT id, context_id, task_id, role, parts, timestamp FROM messages WHERE task_id = ? ORDER BY timestamp ASC`,
    )
    return stmt.all(taskId) as DbMessageRow[]
  }

  deleteMessage(id: string): boolean {
    const stmt = this.db.prepare(`DELETE FROM messages WHERE id = ?`)
    const res = stmt.run(id) as unknown as { changes: number }
    return res.changes > 0
  }

  deleteMessagesByContext(contextId: string): number {
    const stmt = this.db.prepare(`DELETE FROM messages WHERE context_id = ?`)
    const res = stmt.run(contextId) as unknown as { changes: number }
    return res.changes
  }

  deleteMessagesByTask(taskId: string): number {
    const stmt = this.db.prepare(`DELETE FROM messages WHERE task_id = ?`)
    const res = stmt.run(taskId) as unknown as { changes: number }
    return res.changes
  }

  // TASKS
  upsertTask(row: DbTaskRow): void {
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO tasks (id, context_id, status_state, status_timestamp, status_message_id, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    stmt.run(
      row.id,
      row.context_id,
      row.status_state,
      row.status_timestamp,
      row.status_message_id,
      row.metadata,
      row.created_at,
      row.updated_at,
    )
  }

  getTaskRow(id: string): DbTaskRow | undefined {
    const stmt = this.db.prepare(
      `SELECT id, context_id, status_state, status_timestamp, status_message_id, metadata, created_at, updated_at FROM tasks WHERE id = ?`,
    )
    return stmt.get(id) as DbTaskRow | undefined
  }

  listTasksByContext(contextId: string): DbTaskRow[] {
    const stmt = this.db.prepare(
      `SELECT id, context_id, status_state, status_timestamp, status_message_id, metadata, created_at, updated_at FROM tasks WHERE context_id = ? ORDER BY created_at ASC`,
    )
    return stmt.all(contextId) as DbTaskRow[]
  }

  listAllTasks(): DbTaskRow[] {
    const stmt = this.db.prepare(
      `SELECT id, context_id, status_state, status_timestamp, status_message_id, metadata, created_at, updated_at FROM tasks ORDER BY created_at DESC`,
    )
    return stmt.all() as DbTaskRow[]
  }

  deleteTask(id: string): boolean {
    const stmt = this.db.prepare(`DELETE FROM tasks WHERE id = ?`)
    const res = stmt.run(id) as unknown as { changes: number }
    return res.changes > 0
  }

  // ARTIFACTS
  insertArtifact(row: DbArtifactRow): DbArtifactRow {
    const stmt = this.db.prepare(
      `INSERT INTO artifacts (id, task_id, name, description, parts, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    stmt.run(row.id, row.task_id, row.name, row.description, row.parts, row.created_at)
    return row
  }

  listArtifactsByTask(taskId: string): DbArtifactRow[] {
    const stmt = this.db.prepare(
      `SELECT id, task_id, name, description, parts, created_at FROM artifacts WHERE task_id = ? ORDER BY created_at ASC`,
    )
    return stmt.all(taskId) as DbArtifactRow[]
  }

  getArtifact(id: string): DbArtifactRow | undefined {
    const stmt = this.db.prepare(
      `SELECT id, task_id, name, description, parts, created_at FROM artifacts WHERE id = ?`,
    )
    return stmt.get(id) as DbArtifactRow | undefined
  }

  updateArtifact(
    id: string,
    updates: Partial<Pick<DbArtifactRow, "name" | "description" | "parts">>,
  ): boolean {
    const fields: string[] = []
    const values: (string | null)[] = []
    if (Object.prototype.hasOwnProperty.call(updates, "name")) {
      fields.push("name = ?")
      values.push((updates.name ?? null) as string | null)
    }
    if (Object.prototype.hasOwnProperty.call(updates, "description")) {
      fields.push("description = ?")
      values.push((updates.description ?? null) as string | null)
    }
    if (Object.prototype.hasOwnProperty.call(updates, "parts")) {
      fields.push("parts = ?")
      values.push((updates.parts ?? "[]") as string)
    }
    if (fields.length === 0) return false
    values.push(id)
    const stmt = this.db.prepare(
      `UPDATE artifacts SET ${fields.join(", ")} WHERE id = ?`,
    )
    const res = stmt.run(...values) as unknown as { changes: number }
    return res.changes > 0
  }

  deleteArtifact(id: string): boolean {
    const stmt = this.db.prepare(`DELETE FROM artifacts WHERE id = ?`)
    const res = stmt.run(id) as unknown as { changes: number }
    return res.changes > 0
  }

  deleteArtifactsByTask(taskId: string): number {
    const stmt = this.db.prepare(`DELETE FROM artifacts WHERE task_id = ?`)
    const res = stmt.run(taskId) as unknown as { changes: number }
    return res.changes
  }
}

// Convenience singleton accessor
let repoInstance: Repository | null = null
export function getRepository(): Repository {
  if (!repoInstance) repoInstance = new Repository()
  return repoInstance
}
