import * as log from "@std/log"
import { getDb } from "./db.ts"
import { selectDefaultModel } from "./model-registry.ts"
import { ProviderService } from "./provider-service.ts"
import { Capability, isA2ACapability, isMCPCapability, isPrebuiltCapability } from "./capability-types.ts"

// Types for agent configuration
interface AgentInfoRow {
  name: string
  description: string
  model_name: string
  model_parameters: string
  capabilities: string
}

// Legacy tool type - keeping for backward compatibility during migration
type LegacyToolConfig = {
  name: string
  type: string
  tool_schema: Record<string, unknown>
}

export type AgentInfo = {
  name: string
  description: string
  model_name: string
  model_parameters: Record<string, unknown>
  capabilities: Capability[]
}

export class AgentConfigService {
  private db = getDb()

  constructor(configFileData?: AgentInfo | null) {
    if (configFileData) {
      try {
        this.updateAgentInfo(configFileData)
      } catch (error) {
        log.error("Failed to initialize database from config file:", error)
        throw new Error(
          `Failed to initialize from config file: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      }
    }

    // Ensure a valid model is selected after initialization
    this.ensureValidModel()
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
        log.error("No agent info found for model validation")
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
          log.info(
            `Auto-selecting default model: ${defaultModel.name} (${defaultModel.id})`,
          )
          log.info(
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

          log.info("Successfully updated agent with default model")
        } else {
          log.warn(
            "No models are available for auto-selection. Please configure at least one AI provider.",
          )
        }
      } else {
        log.info(`Current model '${currentModelName}' is available and valid`)
      }
    } catch (error) {
      log.error("Error in ensureValidModel():", error)
    }

    // Ensure a valid model is selected after initialization
    this.ensureValidModel()
  }

  getAgentInfo(): AgentInfo {
    try {
      this.ensureValidModel()

      const stmt = this.db.prepare(`
        SELECT name, description, model_name, model_parameters, tools as capabilities 
        FROM agent_info WHERE key = 1
      `)

      const row = stmt.get() as AgentInfoRow | undefined
      if (!row) {
        log.error("No agent info found in database")
        throw new Error("Agent info not found")
      }

      const capabilities = JSON.parse(row.capabilities || "[]")
      const modelParameters = JSON.parse(row.model_parameters || "{}")

      const result = {
        name: row.name,
        description: row.description,
        model_name: row.model_name,
        model_parameters: modelParameters,
        capabilities: capabilities,
      }

      log.debug("AgentConfigService.getAgentInfo() returning:", {
        name: result.name,
        model_name: result.model_name,
        capabilityCount: result.capabilities.length,
      })

      return result
    } catch (error) {
      log.error("Error in AgentConfigService.getAgentInfo():", error)
      throw error
    }
  }

  updateAgentInfo(info: AgentInfo): AgentInfo {
    try {
      // Validate capabilities using new type system
      this.validateCapabilities(info.capabilities)

      log.info("Preparing database update...")
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO agent_info(key, name, description, model_name, model_parameters, tools) 
        VALUES(1, ?, ?, ?, ?, ?)
      `)

      log.info("Executing database update...")
      stmt.run(
        info.name,
        info.description,
        info.model_name,
        JSON.stringify(info.model_parameters),
        JSON.stringify(info.capabilities),
      )

      log.info("Database update completed successfully")
      return info
    } catch (error) {
      log.error("Error in AgentConfigService.updateAgentInfo():", error)
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

  // Validate capabilities using the new type system
  private validateCapabilities(capabilities: Capability[]): void {
    for (const capability of capabilities) {
      if (!capability.name || typeof capability.name !== "string") {
        throw new Error(`Capability is missing a valid name`)
      }

      if (typeof capability.enabled !== "boolean") {
        throw new Error(`Capability '${capability.name}' is missing enabled state`)
      }

      if (isA2ACapability(capability)) {
        log.info("Validating A2A capability:", capability.name)
        if (!capability.agentUrl || typeof capability.agentUrl !== "string") {
          throw new Error(
            `A2A capability '${capability.name}' is missing or has invalid agentUrl`,
          )
        }
        try {
          new URL(capability.agentUrl)
        } catch {
          throw new Error(
            `A2A capability '${capability.name}' has invalid URL: ${capability.agentUrl}`,
          )
        }
      } else if (isMCPCapability(capability)) {
        log.info("Validating MCP capability:", capability.name)
        if (!capability.serverUrl || typeof capability.serverUrl !== "string") {
          throw new Error(
            `MCP capability '${capability.name}' is missing or has invalid serverUrl`,
          )
        }
        try {
          new URL(capability.serverUrl)
        } catch {
          throw new Error(
            `MCP capability '${capability.name}' has invalid URL: ${capability.serverUrl}`,
          )
        }
      } else if (isPrebuiltCapability(capability)) {
        log.info("Validating prebuilt capability:", capability.name)
        if (
          !capability.subtype ||
          !["file_access", "brave_search", "memory"].includes(capability.subtype)
        ) {
          throw new Error(
            `Prebuilt capability '${capability.name}' has invalid subtype: ${capability.subtype}`,
          )
        }
      } else {
        throw new Error(`Capability '${capability.name}' has invalid type`)
      }
    }
  }
}
