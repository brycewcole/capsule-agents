import { getDb } from "../infrastructure/db.ts"
import { getChanges } from "./sqlite-utils.ts"

export interface StoredContext {
  id: string
  metadata: Record<string, unknown>
  createdAt: number
  updatedAt: number
}

export class ContextRepository {
  createContext(id?: string, metadata: Record<string, unknown> = {}): string {
    const db = getDb()
    const contextId = id || crypto.randomUUID()
    const now = Date.now() / 1000
    const stmt = db.prepare(
      `INSERT INTO contexts (id, metadata, created_at, updated_at) VALUES (?, ?, ?, ?)`,
    )
    stmt.run(contextId, JSON.stringify(metadata), now, now)
    return contextId
  }

  getContext(id: string): StoredContext | undefined {
    const db = getDb()
    const row = db.prepare(
      `SELECT id, metadata, created_at, updated_at FROM contexts WHERE id = ?`,
    ).get(id) as
      | { id: string; metadata: string; created_at: number; updated_at: number }
      | undefined
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
    const res = db.prepare(
      `UPDATE contexts SET metadata = ?, updated_at = ? WHERE id = ?`,
    ).run(
      JSON.stringify(metadata),
      now,
      id,
    )
    return getChanges(res) > 0
  }

  deleteContext(id: string): boolean {
    const db = getDb()
    const res = db.prepare(`DELETE FROM contexts WHERE id = ?`).run(id)
    return getChanges(res) > 0
  }

  getAllContexts(): StoredContext[] {
    const db = getDb()
    const rows = db.prepare(
      `SELECT id, metadata, created_at, updated_at FROM contexts ORDER BY updated_at DESC`,
    ).all() as {
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
    db.prepare(`UPDATE contexts SET updated_at = ? WHERE id = ?`).run(now, id)
  }
}

export const contextRepository = new ContextRepository()
