import type * as A2A from "@a2a-js/sdk"
import { getRepository } from "./repository.ts"

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
    const repo = getRepository()
    const now = Date.now() / 1000
    const id = `artifact_${crypto.randomUUID()}`
    repo.insertArtifact({
      id,
      task_id: taskId,
      name: artifact.name ?? null,
      description: artifact.description ?? null,
      parts: JSON.stringify(artifact.parts),
      created_at: now,
    })

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
    const repo = getRepository()
    const row = repo.getArtifact(id)
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
    const repo = getRepository()
    const rows = repo.listArtifactsByTask(taskId)

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
    const repo = getRepository()
    return repo.updateArtifact(id, {
      name: updates.name ?? null,
      description: updates.description ?? null,
      parts: updates.parts ? JSON.stringify(updates.parts) : undefined,
    })
  }

  deleteArtifact(id: string): boolean {
    const repo = getRepository()
    return repo.deleteArtifact(id)
  }

  deleteArtifactsByTask(taskId: string): number {
    const repo = getRepository()
    return repo.deleteArtifactsByTask(taskId)
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
