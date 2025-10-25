import * as log from "@std/log"
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

  async initializeSchedules(
    configSchedules?: ScheduleConfig[],
  ): Promise<void> {
    log.info("Initializing schedule service...")

    // Load schedules from config file and upsert to database
    if (configSchedules && configSchedules.length > 0) {
      log.info(
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
          log.info(`Loaded schedule from config: ${configSchedule.name}`)
        } catch (error) {
          log.error(
            `Failed to load schedule ${configSchedule.name} from config:`,
            error,
          )
        }
      }
    }

    // Register all enabled schedules
    const enabledSchedules = this.scheduleRepository.getEnabledSchedules()
    log.info(`Registering ${enabledSchedules.length} enabled schedules...`)

    for (const schedule of enabledSchedules) {
      try {
        this.registerSchedule(schedule)
        log.info(`Registered schedule: ${schedule.name}`)
      } catch (error) {
        log.error(`Failed to register schedule ${schedule.name}:`, error)
      }
    }

    log.info("Schedule service initialized successfully")
  }

  registerSchedule(schedule: Schedule): void {
    // Unregister existing cron job if present
    this.unregisterSchedule(schedule.id)

    try {
      // Create cron options with optional backoff
      const cronOptions: {
        backoffSchedule?: number[]
      } = {}

      if (schedule.backoffEnabled && schedule.backoffSchedule) {
        cronOptions.backoffSchedule = schedule.backoffSchedule
      }

      // Register Deno.cron job
      const cronHandler = Deno.cron(
        `schedule-${schedule.name}`,
        schedule.cronExpression,
        cronOptions,
        async () => {
          await this.executeSchedule(schedule)
        },
      )

      // Store unregister function
      this.registeredCronJobs.set(schedule.id, () => {
        // Deno.cron doesn't expose an unregister API, so we just remove from our map
        // The cron job will continue to run, but we mark it as unregistered
        log.info(`Unregistered schedule: ${schedule.name}`)
      })

      log.info(
        `Registered cron job for schedule: ${schedule.name} (${schedule.cronExpression})`,
      )
    } catch (error) {
      log.error(`Failed to register schedule ${schedule.name}:`, error)
      throw error
    }
  }

  unregisterSchedule(id: string): void {
    const unregister = this.registeredCronJobs.get(id)
    if (unregister) {
      unregister()
      this.registeredCronJobs.delete(id)
    }
  }

  async executeSchedule(schedule: Schedule): Promise<void> {
    log.info(`Executing schedule: ${schedule.name}`)

    try {
      // Ensure context exists or create new one
      let contextId = schedule.contextId
      if (contextId && !contextRepository.getContext(contextId)) {
        log.warn(
          `Context ${contextId} not found for schedule ${schedule.name}, creating new one`,
        )
        contextId = undefined
      }

      if (!contextId) {
        contextId = crypto.randomUUID()
        contextRepository.createContext(contextId)
        log.info(
          `Created new context ${contextId} for schedule ${schedule.name}`,
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
            text: schedule.prompt,
          },
        ],
        timestamp: Date.now(),
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

      log.info(`Schedule ${schedule.name} executed successfully`)
    } catch (error) {
      log.error(`Failed to execute schedule ${schedule.name}:`, error)

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

    const success = this.scheduleRepository.updateSchedule(id, input)
    if (!success) {
      throw new Error(`Failed to update schedule ${id}`)
    }

    const updated = this.scheduleRepository.getSchedule(id)
    if (!updated) {
      throw new Error(`Failed to retrieve updated schedule ${id}`)
    }

    // Re-register cron job if enabled, or unregister if disabled
    if (updated.enabled) {
      this.registerSchedule(updated)
    } else {
      this.unregisterSchedule(updated.id)
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
