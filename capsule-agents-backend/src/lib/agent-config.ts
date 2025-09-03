import * as log from "@std/log"
import { getDb } from "./db.ts"
import { selectDefaultModel } from "./model-registry.ts"
import { ProviderService } from "./provider-service.ts"
import { Tool, isA2ATool, isMCPTool, isPrebuiltTool } from "./tool-types.ts"

// Types for agent configuration
interface AgentInfoRow {
  name: string
  description: string
  model_name: string
  model_parameters: string
  tools: string
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
  tools: Tool[]
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
  }

  getAgentInfo(): AgentInfo {
    try {
      this.ensureValidModel()

      const stmt = this.db.prepare(`
        SELECT name, description, model_name, model_parameters, tools 
        FROM agent_info WHERE key = 1
      `)

      const row = stmt.get() as AgentInfoRow | undefined
      if (!row) {
        log.error("No agent info found in database")
        throw new Error("Agent info not found")
      }

      const tools = JSON.parse(row.tools || "[]")
      const modelParameters = JSON.parse(row.model_parameters || "{}")

      const result = {
        name: row.name,
        description: row.description,
        model_name: row.model_name,
        model_parameters: modelParameters,
        tools: tools,
      }

      log.debug("AgentConfigService.getAgentInfo() returning:", {
        name: result.name,
        model_name: result.model_name,
        toolCount: result.tools.length,
      })

      return result
    } catch (error) {
      log.error("Error in AgentConfigService.getAgentInfo():", error)
      throw error
    }
  }

  updateAgentInfo(info: AgentInfo): AgentInfo {
    try {
      // Validate tools using new type system
      this.validateTools(info.tools)

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
        JSON.stringify(info.tools),
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

  // Validate tools using the new type system
  private validateTools(tools: Tool[]): void {
    for (const tool of tools) {
      if (!tool.name || typeof tool.name !== "string") {
        throw new Error(`Tool is missing a valid name`)
      }

      if (typeof tool.enabled !== "boolean") {
        throw new Error(`Tool '${tool.name}' is missing enabled state`)
      }

      if (isA2ATool(tool)) {
        log.info("Validating A2A tool:", tool.name)
        if (!tool.agentUrl || typeof tool.agentUrl !== "string") {
          throw new Error(`A2A tool '${tool.name}' is missing or has invalid agentUrl`)
        }
        try {
          new URL(tool.agentUrl)
        } catch {
          throw new Error(`A2A tool '${tool.name}' has invalid URL: ${tool.agentUrl}`)
        }
      } else if (isMCPTool(tool)) {
        log.info("Validating MCP tool:", tool.name)
        if (!tool.serverUrl || typeof tool.serverUrl !== "string") {
          throw new Error(`MCP tool '${tool.name}' is missing or has invalid serverUrl`)
        }
        try {
          new URL(tool.serverUrl)
        } catch {
          throw new Error(`MCP tool '${tool.name}' has invalid URL: ${tool.serverUrl}`)
        }
      } else if (isPrebuiltTool(tool)) {
        log.info("Validating prebuilt tool:", tool.name)
        if (!tool.subtype || !["file_access", "brave_search", "memory"].includes(tool.subtype)) {
          throw new Error(`Prebuilt tool '${tool.name}' has invalid subtype: ${tool.subtype}`)
        }
      } else {
        throw new Error(`Tool '${tool.name}' has invalid type`)
      }
    }
  }

}
