import { getDb } from "../infrastructure/db.ts"
import {
  Capability,
  isA2ACapability,
  isMCPCapability,
  isPrebuiltCapability,
} from "../lib/capability-types.ts"
import { expandEnvVarsInObject } from "../lib/env-expansion.ts"
import { selectDefaultModel } from "../lib/model-registry.ts"
import {
  AgentConfigSchema,
  transformConfigToAgentInfo,
} from "./config-schema.ts"
import { ProviderService } from "./provider-service.ts"

// Types for agent configuration
interface AgentInfoRow {
  name: string
  description: string
  model_name: string
  model_parameters: string
  capabilities: string
  built_in_prompts_enabled: number | null
  hooks: string | null
}

export type AgentInfo = {
  name: string
  description: string
  model_name?: string
  model_parameters?: Record<string, unknown>
  capabilities: Capability[]
  built_in_prompts_enabled: boolean
  hooks?: unknown[] // Will be validated as HookConfig[] when used
}

export class AgentConfigService {
  private db = getDb()
  private modelValidated = false

  constructor(configFileData?: AgentInfo | null) {
    if (configFileData) {
      try {
        this.updateAgentInfo(configFileData)
      } catch (error) {
        console.error("Failed to initialize database from config file:", error)
        throw new Error(
          `Failed to initialize from config file: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      }
    }

    // Ensure a valid model is selected after initialization
    this.ensureValidModel()
    this.modelValidated = true
  }

  private ensureValidModel(): void {
    try {
      const providerService = ProviderService.getInstance()
      const availableModels = providerService.getAllAvailableModels()

      // Get current agent info to check model
      const stmt = this.db.prepare(`
        SELECT model_name FROM agent_info WHERE key = 1
      `)
      const row = stmt.get() as { model_name: string } | undefined

      if (!row) {
        console.debug("No agent info found yet, skipping model validation")
        return
      }

      const currentModelName = row.model_name
      const isCurrentModelAvailable = availableModels.some((model) =>
        model.id === currentModelName
      )

      // If no model selected or current model is unavailable, auto-select best default
      if (!currentModelName || !isCurrentModelAvailable) {
        const defaultModel = selectDefaultModel(availableModels)

        if (defaultModel) {
          console.info(
            `Auto-selecting default model: ${defaultModel.name} (${defaultModel.id})`,
          )
          console.info(
            `Reason: ${
              !currentModelName
                ? "No model was selected"
                : `Previous model '${currentModelName}' is no longer available`
            }`,
          )

          // Update the database with the new model
          const updateStmt = this.db.prepare(`
            UPDATE agent_info
            SET model_name = ?
            WHERE key = 1
          `)
          updateStmt.run(defaultModel.id)

          console.info("Successfully updated agent with default model")
        } else {
          console.warn(
            "No models are available for auto-selection. Please configure at least one AI provider.",
          )
        }
      } else {
        console.info(
          `Current model '${currentModelName}' is available and valid`,
        )
      }
    } catch (error) {
      console.error("Error in ensureValidModel():", error)
    }
  }

  getAgentInfo(): AgentInfo {
    try {
      const stmt = this.db.prepare(`
        SELECT name, description, model_name, model_parameters, tools as capabilities, built_in_prompts_enabled, hooks
        FROM agent_info WHERE key = 1
      `)

      const row = stmt.get() as AgentInfoRow | undefined
      if (!row) {
        console.info("No agent info found, creating default configuration")

        // Use Zod schema defaults to create clean default configuration
        const defaultConfig = AgentConfigSchema.parse({})
        const defaultAgentInfo = transformConfigToAgentInfo(defaultConfig)

        console.info("Created default agent config:", {
          name: defaultAgentInfo.name,
          description: defaultAgentInfo.description,
          capabilityCount: defaultAgentInfo.capabilities.length,
        })

        // Use existing updateAgentInfo logic to create defaults
        this.updateAgentInfo(defaultAgentInfo)

        // Recursive call to get the newly created info
        return this.getAgentInfo()
      }

      const capabilities = JSON.parse(row.capabilities || "[]")
      const modelParameters = JSON.parse(row.model_parameters || "{}")
      const hooks = row.hooks ? JSON.parse(row.hooks) : undefined

      const expandedCapabilities = expandEnvVarsInObject(capabilities)
      const builtInPromptsEnabled = row.built_in_prompts_enabled !== 0

      const result = {
        name: row.name,
        description: row.description,
        model_name: row.model_name,
        model_parameters: modelParameters,
        capabilities: expandedCapabilities,
        built_in_prompts_enabled: builtInPromptsEnabled,
        hooks: hooks,
      }

      console.debug("AgentConfigService.getAgentInfo() returning:", {
        name: result.name,
        model_name: result.model_name,
        capabilityCount: result.capabilities.length,
      })

      return result
    } catch (error) {
      console.error(
        "Error in AgentConfigService.getAgentInfo():",
        error instanceof Error ? error.message : String(error),
      )
      if (error instanceof Error && error.stack) {
        console.error("Stack trace:", error.stack)
      }
      throw error
    }
  }

  updateAgentInfo(info: AgentInfo): AgentInfo {
    try {
      // Validate capabilities using new type system
      this.validateCapabilities(info.capabilities)
      const builtInPromptsEnabled = info.built_in_prompts_enabled !== false

      console.info("Preparing database update...")
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO agent_info(key, name, description, model_name, model_parameters, tools, built_in_prompts_enabled, hooks)
        VALUES(1, ?, ?, ?, ?, ?, ?, ?)
      `)

      console.info("Executing database update...")
      stmt.run(
        info.name,
        info.description,
        info.model_name || null,
        JSON.stringify(info.model_parameters || {}),
        JSON.stringify(info.capabilities),
        builtInPromptsEnabled ? 1 : 0,
        info.hooks ? JSON.stringify(info.hooks) : null,
      )

      console.info("Database update completed successfully")

      // Re-validate model after configuration update
      this.ensureValidModel()
      this.modelValidated = true

      return {
        ...info,
        built_in_prompts_enabled: builtInPromptsEnabled,
      }
    } catch (error) {
      console.error(
        "Error in AgentConfigService.updateAgentInfo():",
        error instanceof Error ? error.message : String(error),
      )
      if (error instanceof Error && error.stack) {
        console.error("Stack trace:", error.stack)
      }
      throw error
    }
  }

  getAvailableModels() {
    const providerService = ProviderService.getInstance()
    return providerService.getAllAvailableModels()
  }

  getProviderInfo() {
    const providerService = ProviderService.getInstance()
    return {
      providers: providerService.getAvailableProviders(),
      status: providerService.getProviderStatus(),
    }
  }

  /**
   * Force revalidation of the current model configuration.
   * Useful when environment variables or provider availability changes.
   */
  revalidateModel(): void {
    this.ensureValidModel()
    this.modelValidated = true
  }

  private validateCapabilities(capabilities: Capability[]): void {
    for (const cap of capabilities) {
      if (
        !isPrebuiltCapability(cap) && !isA2ACapability(cap) &&
        !isMCPCapability(cap)
      ) {
        throw new Error(`Unknown capability type: ${JSON.stringify(cap)}`)
      }
    }
  }
}
