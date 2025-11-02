import type { AgentInfo } from "./agent-config.ts"
import {
  ConfigFileSchema,
  type ScheduleConfig,
  transformConfigToAgentInfo,
} from "./config-schema.ts"

export interface ConfigFileResult {
  agentInfo: AgentInfo | null
  schedules: ScheduleConfig[]
  workspaceFiles: string[]
}

export class ConfigFileService {
  private static readonly DEFAULT_CONFIG_PATH = "/app/agent.config.json"

  /**
   * Load and parse a configuration file from the specified path
   */
  static async loadConfigFile(
    configPath?: string,
  ): Promise<ConfigFileResult> {
    const filePath = configPath ||
      Deno.env.get("AGENT_CONFIG_FILE") ||
      ConfigFileService.DEFAULT_CONFIG_PATH

    try {
      console.info(`Attempting to load config file from: ${filePath}`)

      try {
        await Deno.stat(filePath)
      } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
          console.info(
            `Config file not found at ${filePath}, using database defaults`,
          )
          return { agentInfo: null, schedules: [], workspaceFiles: [] }
        }
        throw error
      }

      const fileContent = await Deno.readTextFile(filePath)

      let parsedJson: unknown
      try {
        parsedJson = JSON.parse(fileContent)
      } catch (parseError) {
        console.error(`Failed to parse JSON from config file: ${parseError}`)
        throw new Error(
          `Invalid JSON in config file ${filePath}: ${parseError}`,
        )
      }

      // Validate against schema
      const validationResult = ConfigFileSchema.safeParse(parsedJson)
      if (!validationResult.success) {
        console.error(
          "Config file validation failed:",
          validationResult.error.issues,
        )
        const errorMessage = validationResult.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join(", ")
        throw new Error(`Config file validation failed: ${errorMessage}`)
      }

      const configFile = validationResult.data
      console.info(
        `Successfully loaded and validated config file: ${configFile.agent.name}`,
      )

      const agentInfo = transformConfigToAgentInfo(
        configFile.agent,
        configFile.mcpServers,
      )
      const schedules = configFile.schedules || []
      const workspaceFiles = configFile.workspaceFiles || []

      if (schedules.length > 0) {
        console.info(`Loaded ${schedules.length} schedules from config file`)
      }

      if (workspaceFiles.length > 0) {
        console.info(
          `Loaded ${workspaceFiles.length} workspace files from config file`,
        )
      }

      return { agentInfo, schedules, workspaceFiles }
    } catch (error) {
      console.error(`Failed to load config file from ${filePath}:`, error)
      throw new Error(
        `Failed to load config file: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
  }
}
