import { getDb } from "../infrastructure/db.ts"

export interface Schedule {
  id: string
  name: string
  prompt: string
  cronExpression: string
  enabled: boolean
  contextId?: string
  backoffEnabled: boolean
  backoffSchedule?: number[]
  lastRunAt?: number
  nextRunAt?: number
  runCount: number
  failureCount: number
  createdAt: number
  updatedAt: number
}

export interface ScheduleInput {
  name: string
  prompt: string
  cronExpression: string
  enabled?: boolean
  contextId?: string
  backoffEnabled?: boolean
  backoffSchedule?: number[]
}

interface ScheduleRow {
  id: string
  name: string
  prompt: string
  cron_expression: string
  enabled: number
  context_id: string | null
  backoff_enabled: number
  backoff_schedule: string | null
  last_run_at: number | null
  next_run_at: number | null
  run_count: number
  failure_count: number
  created_at: number
  updated_at: number
}

export class ScheduleRepository {
  private db = getDb()

  private rowToSchedule(row: ScheduleRow): Schedule {
    return {
      id: row.id,
      name: row.name,
      prompt: row.prompt,
      cronExpression: row.cron_expression,
      enabled: row.enabled === 1,
      contextId: row.context_id || undefined,
      backoffEnabled: row.backoff_enabled === 1,
      backoffSchedule: row.backoff_schedule
        ? JSON.parse(row.backoff_schedule)
        : undefined,
      lastRunAt: row.last_run_at || undefined,
      nextRunAt: row.next_run_at || undefined,
      runCount: row.run_count,
      failureCount: row.failure_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  createSchedule(input: ScheduleInput): Schedule {
    const id = crypto.randomUUID()
    const now = Date.now()

    const stmt = this.db.prepare(`
      INSERT INTO schedules (
        id, name, prompt, cron_expression, enabled, context_id,
        backoff_enabled, backoff_schedule, run_count, failure_count,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
    `)

    stmt.run(
      id,
      input.name,
      input.prompt,
      input.cronExpression,
      input.enabled !== false ? 1 : 0,
      input.contextId || null,
      input.backoffEnabled ? 1 : 0,
      input.backoffSchedule ? JSON.stringify(input.backoffSchedule) : null,
      now,
      now,
    )

    const schedule = this.getSchedule(id)
    if (!schedule) {
      throw new Error("Failed to create schedule")
    }

    return schedule
  }

  getSchedule(id: string): Schedule | null {
    const stmt = this.db.prepare(
      "SELECT * FROM schedules WHERE id = ?",
    )
    const row = stmt.get(id) as ScheduleRow | undefined

    return row ? this.rowToSchedule(row) : null
  }

  getAllSchedules(): Schedule[] {
    const stmt = this.db.prepare(
      "SELECT * FROM schedules ORDER BY created_at DESC",
    )
    const rows = stmt.all() as ScheduleRow[]

    return rows.map((row) => this.rowToSchedule(row))
  }

  getEnabledSchedules(): Schedule[] {
    const stmt = this.db.prepare(
      "SELECT * FROM schedules WHERE enabled = 1 ORDER BY created_at DESC",
    )
    const rows = stmt.all() as ScheduleRow[]

    return rows.map((row) => this.rowToSchedule(row))
  }

  updateSchedule(id: string, input: Partial<ScheduleInput>): boolean {
    const existing = this.getSchedule(id)
    if (!existing) return false

    const updates: string[] = []
    const values: (string | number | null)[] = []

    if (input.name !== undefined) {
      updates.push("name = ?")
      values.push(input.name)
    }
    if (input.prompt !== undefined) {
      updates.push("prompt = ?")
      values.push(input.prompt)
    }
    if (input.cronExpression !== undefined) {
      updates.push("cron_expression = ?")
      values.push(input.cronExpression)
    }
    if (input.enabled !== undefined) {
      updates.push("enabled = ?")
      values.push(input.enabled ? 1 : 0)
    }
    if (input.contextId !== undefined) {
      updates.push("context_id = ?")
      values.push(input.contextId || null)
    }
    if (input.backoffEnabled !== undefined) {
      updates.push("backoff_enabled = ?")
      values.push(input.backoffEnabled ? 1 : 0)
    }
    if (input.backoffSchedule !== undefined) {
      updates.push("backoff_schedule = ?")
      values.push(
        input.backoffSchedule ? JSON.stringify(input.backoffSchedule) : null,
      )
    }

    if (updates.length === 0) return true

    updates.push("updated_at = ?")
    values.push(Date.now())

    values.push(id)

    const stmt = this.db.prepare(
      `UPDATE schedules SET ${updates.join(", ")} WHERE id = ?`,
    )
    stmt.run(...values)

    return true
  }

  deleteSchedule(id: string): boolean {
    const stmt = this.db.prepare("DELETE FROM schedules WHERE id = ?")
    stmt.run(id)
    return true
  }

  recordExecution(
    id: string,
    success: boolean,
    nextRunAt?: number,
  ): void {
    const now = Date.now()
    const updates = success
      ? "run_count = run_count + 1, last_run_at = ?, updated_at = ?"
      : "failure_count = failure_count + 1, last_run_at = ?, updated_at = ?"

    if (nextRunAt !== undefined) {
      const stmt = this.db.prepare(
        `UPDATE schedules SET ${updates}, next_run_at = ? WHERE id = ?`,
      )
      stmt.run(now, now, nextRunAt, id)
    } else {
      const stmt = this.db.prepare(
        `UPDATE schedules SET ${updates} WHERE id = ?`,
      )
      stmt.run(now, now, id)
    }
  }

  upsertScheduleByName(input: ScheduleInput): Schedule {
    const existing = this.getScheduleByName(input.name)

    if (existing) {
      this.updateSchedule(existing.id, input)
      const updated = this.getSchedule(existing.id)
      if (!updated) {
        throw new Error("Failed to retrieve updated schedule")
      }
      return updated
    } else {
      return this.createSchedule(input)
    }
  }

  private getScheduleByName(name: string): Schedule | null {
    const stmt = this.db.prepare(
      "SELECT * FROM schedules WHERE name = ?",
    )
    const row = stmt.get(name) as ScheduleRow | undefined

    return row ? this.rowToSchedule(row) : null
  }
}
