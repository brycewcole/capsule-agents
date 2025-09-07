import { getDb } from "./db.ts"
import type * as A2A from "@a2a-js/sdk"

export interface StoredArtifact {
  id: string
  taskId: string
  name?: string
  description?: string
  parts: A2A.Part[]
  createdAt: number
}

export class ArtifactStorage {
  createArtifact(
    taskId: string,
    artifact: Omit<A2A.Artifact, "artifactId">,
  ): StoredArtifact {
    const db = getDb()
    const now = Date.now() / 1000
    const id = `artifact_${crypto.randomUUID()}`

    const stmt = db.prepare(`
      INSERT INTO artifacts (id, task_id, name, description, parts, created_at) 
      VALUES (?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      id,
      taskId,
      artifact.name || null,
      artifact.description || null,
      JSON.stringify(artifact.parts),
      now,
    )

    return {
      id,
      taskId,
      name: artifact.name,
      description: artifact.description,
      parts: artifact.parts,
      createdAt: now,
    }
  }

  getArtifact(id: string): StoredArtifact | undefined {
    const db = getDb()
    const stmt = db.prepare(`
      SELECT id, task_id, name, description, parts, created_at 
      FROM artifacts 
      WHERE id = ?
    `)

    const row = stmt.get(id) as {
      id: string
      task_id: string
      name: string | null
      description: string | null
      parts: string
      created_at: number
    } | undefined

    if (!row) return undefined

    return {
      id: row.id,
      taskId: row.task_id,
      name: row.name || undefined,
      description: row.description || undefined,
      parts: JSON.parse(row.parts),
      createdAt: row.created_at,
    }
  }

  getArtifactsByTask(taskId: string): StoredArtifact[] {
    const db = getDb()
    const stmt = db.prepare(`
      SELECT id, task_id, name, description, parts, created_at 
      FROM artifacts 
      WHERE task_id = ?
      ORDER BY created_at ASC
    `)

    const rows = stmt.all(taskId) as {
      id: string
      task_id: string
      name: string | null
      description: string | null
      parts: string
      created_at: number
    }[]

    return rows.map((row) => ({
      id: row.id,
      taskId: row.task_id,
      name: row.name || undefined,
      description: row.description || undefined,
      parts: JSON.parse(row.parts),
      createdAt: row.created_at,
    }))
  }

  updateArtifact(
    id: string,
    updates: Partial<Pick<StoredArtifact, "name" | "description" | "parts">>,
  ): boolean {
    const db = getDb()
    const fields: string[] = []
    const values: (string | number)[] = []

    if (updates.name !== undefined) {
      fields.push("name = ?")
      values.push(updates.name)
    }
    if (updates.description !== undefined) {
      fields.push("description = ?")
      values.push(updates.description)
    }
    if (updates.parts !== undefined) {
      fields.push("parts = ?")
      values.push(JSON.stringify(updates.parts))
    }

    if (fields.length === 0) return false

    values.push(id)

    const stmt = db.prepare(`
      UPDATE artifacts 
      SET ${fields.join(", ")} 
      WHERE id = ?
    `)

    const result = stmt.run(...values) as unknown as { changes: number }
    return result.changes > 0
  }

  deleteArtifact(id: string): boolean {
    const db = getDb()
    const stmt = db.prepare("DELETE FROM artifacts WHERE id = ?")
    const result = stmt.run(id) as unknown as { changes: number }
    return result.changes > 0
  }

  deleteArtifactsByTask(taskId: string): number {
    const db = getDb()
    const stmt = db.prepare("DELETE FROM artifacts WHERE task_id = ?")
    const result = stmt.run(taskId) as unknown as { changes: number }
    return result.changes
  }

  // Convert stored artifacts to A2A Artifact format
  toA2AArtifacts(artifacts: StoredArtifact[]): A2A.Artifact[] {
    return artifacts.map((artifact) => ({
      artifactId: artifact.id,
      name: artifact.name,
      description: artifact.description,
      parts: artifact.parts,
    }))
  }
}
