import type * as A2A from "@a2a-js/sdk"
import type {
  HookConfig,
  HookExecutionResult,
  OutputHook,
  TaskCompletionPayload,
} from "./hook-types.ts"
import { DiscordHook } from "./integrations/discord.hook.ts"
import type { AgentConfigService } from "../services/agent-config.ts"
import { contextRepository } from "../repositories/context.repository.ts"
import { ScheduleRepository } from "../repositories/schedule.repository.ts"

export class HookExecutorService {
  private agentConfigService: AgentConfigService
  private scheduleRepository: ScheduleRepository

  constructor(agentConfigService: AgentConfigService) {
    this.agentConfigService = agentConfigService
    this.scheduleRepository = new ScheduleRepository()
  }

  /**
   * Execute all applicable hooks for a completed task
   * Fire-and-forget: does not block the response
   */
  executeHooksAsync(
    task: A2A.Task,
    artifacts: A2A.Artifact[],
    source?: TaskCompletionPayload["source"],
  ): void {
    // Don't await - fire and forget
    this.executeHooks(task, artifacts, source).catch((error) => {
      console.error("Hook execution failed:", error)
    })
  }

  /**
   * Execute hooks and return results (for testing/debugging)
   */
  async executeHooks(
    task: A2A.Task,
    artifacts: A2A.Artifact[],
    source?: TaskCompletionPayload["source"],
  ): Promise<HookExecutionResult[]> {
    const hooks = this.collectApplicableHooks(task.contextId, source?.scheduleId)

    if (hooks.length === 0) {
      return []
    }

    const payload: TaskCompletionPayload = {
      task,
      artifacts,
      contextId: task.contextId,
      completedAt: new Date().toISOString(),
      source,
    }

    console.info(`Executing ${hooks.length} hook(s) for task ${task.id}`)

    // Execute all hooks in parallel
    const results = await Promise.all(
      hooks.map((hookConfig) => this.executeHook(hookConfig, payload)),
    )

    // Log results
    for (const result of results) {
      if (result.success) {
        console.info(
          `Hook ${result.hookType} executed in ${result.executionTimeMs}ms`,
        )
      } else {
        console.error(`Hook ${result.hookType} failed: ${result.error}`)
      }
    }

    return results
  }

  /**
   * Collect hooks from all applicable sources (agent, context, schedule)
   */
  private collectApplicableHooks(
    contextId: string,
    scheduleId?: string,
  ): HookConfig[] {
    const hooks: HookConfig[] = []

    // 1. Agent-level hooks (from config - will be added when we update config schema)
    const agentHooks = this.getAgentHooks()
    hooks.push(...agentHooks.filter((h) => h.enabled))

    // 2. Per-context hooks (from context metadata)
    const contextHooks = this.getContextHooks(contextId)
    hooks.push(...contextHooks.filter((h) => h.enabled))

    // 3. Per-schedule hooks (if task came from a schedule)
    if (scheduleId) {
      const scheduleHooks = this.getScheduleHooks(scheduleId)
      hooks.push(...scheduleHooks.filter((h) => h.enabled))
    }

    return hooks
  }

  private getAgentHooks(): HookConfig[] {
    const agentInfo = this.agentConfigService.getAgentInfo()
    if (!agentInfo.hooks || !Array.isArray(agentInfo.hooks)) {
      return []
    }
    return agentInfo.hooks as HookConfig[]
  }

  private getContextHooks(contextId: string): HookConfig[] {
    const context = contextRepository.getContext(contextId)
    if (!context?.metadata?.hooks) {
      return []
    }

    // Metadata.hooks should be an array of HookConfig
    const hooks = context.metadata.hooks
    if (Array.isArray(hooks)) {
      return hooks as HookConfig[]
    }

    return []
  }

  private getScheduleHooks(scheduleId: string): HookConfig[] {
    const schedule = this.scheduleRepository.getSchedule(scheduleId)
    if (!schedule?.hooks || !Array.isArray(schedule.hooks)) {
      return []
    }
    return schedule.hooks as HookConfig[]
  }

  private executeHook(
    config: HookConfig,
    payload: TaskCompletionPayload,
  ): Promise<HookExecutionResult> {
    const hook = this.createHookInstance(config)
    return hook.execute(payload)
  }

  private createHookInstance(config: HookConfig): OutputHook {
    switch (config.type) {
      case "discord":
        return new DiscordHook(config)
      // Future integrations:
      // case "email":
      //   return new EmailHook(config)
      default:
        throw new Error(`Unknown hook type: ${(config as HookConfig).type}`)
    }
  }
}
