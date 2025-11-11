import type * as A2A from "@a2a-js/sdk"
import { getDb } from "../infrastructure/db.ts"
import { getChanges } from "./sqlite-utils.ts"

const buildArtifactMetadata = (createdAtSeconds: number) => ({
  timestamp: new Date(createdAtSeconds * 1000).toISOString(),
})

export interface StoredArtifact {
  id: string
  taskId: string
  name?: string
  description?: string
  parts: A2A.Part[]
  createdAt: number
}

export class ArtifactRepository {
  createArtifact(
    taskId: string,
    artifact: Omit<A2A.Artifact, "artifactId">,
  ): StoredArtifact {
    const db = getDb()
    const now = Date.now() / 1000
    const id = `artifact_${crypto.randomUUID()}`
    db.prepare(
      `INSERT INTO artifacts (id, task_id, name, description, parts, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      taskId,
      artifact.name ?? null,
      artifact.description ?? null,
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
    const row = db.prepare(
      `SELECT id, task_id, name, description, parts, created_at FROM artifacts WHERE id = ?`,
    ).get(id) as
      | {
        id: string
        task_id: string
        name: string | null
        description: string | null
        parts: string
        created_at: number
      }
      | undefined
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
    const rows = db.prepare(
      `SELECT id, task_id, name, description, parts, created_at FROM artifacts WHERE task_id = ? ORDER BY created_at ASC`,
    ).all(taskId) as {
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
      values.push(
        (updates.parts ? JSON.stringify(updates.parts) : "[]") as string,
      )
    }
    if (fields.length === 0) return false
    values.push(id)
    const res = db.prepare(
      `UPDATE artifacts SET ${fields.join(", ")} WHERE id = ?`,
    ).run(
      ...values,
    )
    return getChanges(res) > 0
  }

  deleteArtifact(id: string): boolean {
    const db = getDb()
    const res = db.prepare(`DELETE FROM artifacts WHERE id = ?`).run(id)
    return getChanges(res) > 0
  }

  deleteArtifactsByTask(taskId: string): number {
    const db = getDb()
    const res = db.prepare(`DELETE FROM artifacts WHERE task_id = ?`).run(
      taskId,
    )
    return getChanges(res)
  }

  // Convert stored artifacts to A2A Artifact format
  toA2AArtifacts(artifacts: StoredArtifact[]): A2A.Artifact[] {
    return artifacts.map((artifact) => this.toA2AArtifact(artifact))
  }

  toA2AArtifact(artifact: StoredArtifact): A2A.Artifact {
    return {
      artifactId: artifact.id,
      name: artifact.name,
      description: artifact.description,
      parts: artifact.parts,
      metadata: buildArtifactMetadata(artifact.createdAt),
    }
  }
}
