import type * as A2A from "@a2a-js/sdk"
import { contextRepository } from "../repositories/context.repository.ts"
import {
  Schedule,
  ScheduleInput,
  ScheduleRepository,
} from "../repositories/schedule.repository.ts"
import type { AgentConfigService } from "./agent-config.ts"
import type { ScheduleConfig } from "./config-schema.ts"

export class ScheduleService {
  private scheduleRepository = new ScheduleRepository()
  private registeredCronJobs = new Map<string, () => void>()
  private agentConfigService: AgentConfigService

  constructor(agentConfigService: AgentConfigService) {
    this.agentConfigService = agentConfigService
  }

  initializeSchedules(
    configSchedules?: ScheduleConfig[],
  ): void {
    console.info("Initializing schedule service...")

    // Load schedules from config file and upsert to database
    if (configSchedules && configSchedules.length > 0) {
      console.info(
        `Loading ${configSchedules.length} schedules from config file...`,
      )
      for (const configSchedule of configSchedules) {
        try {
          const scheduleInput: ScheduleInput = {
            name: configSchedule.name,
            prompt: configSchedule.prompt,
            cronExpression: configSchedule.cron_expression,
            enabled: configSchedule.enabled,
            contextId: configSchedule.context_id,
            backoffEnabled: configSchedule.backoff?.enabled || false,
            backoffSchedule: configSchedule.backoff?.schedule,
          }
          this.scheduleRepository.upsertScheduleByName(scheduleInput)
          console.info(`Loaded schedule from config: ${configSchedule.name}`)
        } catch (error) {
          console.error(
            `Failed to load schedule ${configSchedule.name} from config:`,
            error,
          )
        }
      }
    }

    // Register all enabled schedules
    const enabledSchedules = this.scheduleRepository.getEnabledSchedules()
    console.info(`Registering ${enabledSchedules.length} enabled schedules...`)

    for (const schedule of enabledSchedules) {
      try {
        this.registerSchedule(schedule)
        console.info(`Registered schedule: ${schedule.name}`)
      } catch (error) {
        console.error(
          `Failed to register schedule ${schedule.name} error ${
            JSON.stringify(error)
          }`,
        )
      }
    }

    console.info("Schedule service initialized successfully")
  }

  registerSchedule(schedule: Schedule): void {
    try {
      console.info(
        `Attempting to register schedule: ${schedule.name} with cron: ${schedule.cronExpression}`,
      )
      console.info(
        `Backoff enabled: ${schedule.backoffEnabled}, Schedule: ${
          JSON.stringify(schedule.backoffSchedule)
        }`,
      )

      // Use schedule ID for unique cron name to avoid conflicts
      // Deno.cron doesn't support unregistering, so we use unique IDs
      const cronName = `schedule-${schedule.id}`

      // Skip if already registered
      if (this.registeredCronJobs.has(schedule.id)) {
        console.info(
          `Schedule ${schedule.name} (${schedule.id}) already registered, skipping`,
        )
        return
      }

      // Register Deno.cron job with optional backoff
      if (schedule.backoffEnabled && schedule.backoffSchedule) {
        Deno.cron(
          cronName,
          schedule.cronExpression,
          {
            backoffSchedule: schedule.backoffSchedule,
          },
          async () => {
            await this.executeSchedule(schedule)
          },
        )
      } else {
        Deno.cron(
          cronName,
          schedule.cronExpression,
          async () => {
            await this.executeSchedule(schedule)
          },
        )
      }

      // Mark as registered
      this.registeredCronJobs.set(schedule.id, () => {
        // Deno.cron doesn't expose an unregister API
        // The cron job will continue to run for the process lifetime
        console.info(`Marked schedule as unregistered: ${schedule.name}`)
      })

      console.info(
        `Successfully registered cron job for schedule: ${schedule.name} (${schedule.cronExpression})`,
      )
    } catch (error) {
      console.error(`Failed to register schedule ${schedule.name}:`, error)
      console.error(
        `Error details: ${error instanceof Error ? error.message : "Unknown"}`,
      )
      console.error(
        `Error stack: ${error instanceof Error ? error.stack : "N/A"}`,
      )
      throw error
    }
  }

  unregisterSchedule(id: string): void {
    // NOTE: Deno.cron does not support dynamic unregistration
    // Cron jobs continue to run for the process lifetime
    // We keep the Map entry to prevent re-registration
    // Execution is controlled by the enabled check in executeSchedule
    const unregister = this.registeredCronJobs.get(id)
    if (unregister) {
      unregister()
      // DO NOT delete from the map - this prevents duplicate registrations
    }
  }

  async executeSchedule(schedule: Schedule): Promise<void> {
    console.info(`Executing schedule: ${schedule.name}`)

    // Check if schedule is still enabled and registered
    const currentSchedule = this.scheduleRepository.getSchedule(schedule.id)
    if (!currentSchedule || !currentSchedule.enabled) {
      console.info(
        `Schedule ${schedule.name} is disabled or deleted, skipping execution`,
      )
      return
    }

    // Check if still registered (not deleted)
    if (!this.registeredCronJobs.has(schedule.id)) {
      console.info(
        `Schedule ${schedule.name} is no longer registered, skipping execution`,
      )
      return
    }

    try {
      // Ensure context exists or create new one
      let contextId = currentSchedule.contextId
      if (contextId && !contextRepository.getContext(contextId)) {
        console.warn(
          `Context ${contextId} not found for schedule ${currentSchedule.name}, creating new one`,
        )
        contextId = undefined
      }

      if (!contextId) {
        contextId = crypto.randomUUID()
        contextRepository.createContext(contextId)
        console.info(
          `Created new context ${contextId} for schedule ${currentSchedule.name}`,
        )
      }

      // Create A2A message
      const message: A2A.Message = {
        kind: "message",
        messageId: crypto.randomUUID(),
        contextId,
        role: "user",
        parts: [
          {
            kind: "text",
            text: currentSchedule.prompt,
          },
        ],
      }

      // Import dynamically to avoid circular dependency
      const { CapsuleAgentA2ARequestHandler } = await import(
        "../lib/a2a-request-handler.ts"
      )
      const handler = new CapsuleAgentA2ARequestHandler(
        this.agentConfigService,
      )

      // Send message
      await handler.sendMessage({
        message,
      })

      // Record successful execution
      this.scheduleRepository.recordExecution(schedule.id, true)

      console.info(`Schedule ${schedule.name} executed successfully`)
    } catch (error) {
      console.error(`Failed to execute schedule ${schedule.name}:`, error)

      // Record failed execution
      this.scheduleRepository.recordExecution(schedule.id, false)

      // Re-throw to trigger backoff if configured
      throw error
    }
  }

  createSchedule(input: ScheduleInput): Schedule {
    const schedule = this.scheduleRepository.createSchedule(input)

    if (schedule.enabled) {
      this.registerSchedule(schedule)
    }

    return schedule
  }

  getSchedule(id: string): Schedule | null {
    return this.scheduleRepository.getSchedule(id)
  }

  getAllSchedules(): Schedule[] {
    return this.scheduleRepository.getAllSchedules()
  }

  updateSchedule(id: string, input: Partial<ScheduleInput>): Schedule {
    const existing = this.scheduleRepository.getSchedule(id)
    if (!existing) {
      throw new Error(`Schedule ${id} not found`)
    }

    // Check if cron expression or backoff settings are changing
    const cronChanging = input.cronExpression !== undefined &&
      input.cronExpression !== existing.cronExpression
    const backoffChanging = (input.backoffEnabled !== undefined &&
      input.backoffEnabled !== existing.backoffEnabled) ||
      (input.backoffSchedule !== undefined &&
        JSON.stringify(input.backoffSchedule) !==
          JSON.stringify(existing.backoffSchedule))

    // If cron or backoff is changing, we cannot update the Deno.cron job dynamically
    // Just update the database and warn that a restart is needed
    if (cronChanging || backoffChanging) {
      console.warn(
        `Schedule ${existing.name} cron/backoff settings changed. Server restart required for changes to take effect.`,
      )
      // Mark as unregistered so old cron job won't execute
      this.unregisterSchedule(id)
    }

    const success = this.scheduleRepository.updateSchedule(id, input)
    if (!success) {
      throw new Error(`Failed to update schedule ${id}`)
    }

    const updated = this.scheduleRepository.getSchedule(id)
    if (!updated) {
      throw new Error(`Failed to retrieve updated schedule ${id}`)
    }

    // Handle enabled/disabled toggle (only if cron/backoff didn't change)
    // NOTE: We don't actually re-register or unregister because Deno.cron
    // doesn't support dynamic unregistration. The enabled check in
    // executeSchedule will control whether the job actually runs.
    // We only need to register if it has never been registered before.
    if (!cronChanging && !backoffChanging) {
      if (updated.enabled && !this.registeredCronJobs.has(id)) {
        // Was never registered - register it now
        this.registerSchedule(updated)
      }
      // If disabled, the cron job keeps running but executeSchedule will skip it
    }

    return updated
  }

  deleteSchedule(id: string): boolean {
    this.unregisterSchedule(id)
    return this.scheduleRepository.deleteSchedule(id)
  }

  toggleSchedule(id: string, enabled: boolean): Schedule {
    return this.updateSchedule(id, { enabled })
  }

  async runScheduleNow(id: string): Promise<void> {
    const schedule = this.scheduleRepository.getSchedule(id)
    if (!schedule) {
      throw new Error(`Schedule ${id} not found`)
    }

    await this.executeSchedule(schedule)
  }
}
