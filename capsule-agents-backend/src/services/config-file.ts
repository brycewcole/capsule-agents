import {
  ConfigFileSchema,
  transformConfigToAgentInfo,
} from "./config-schema.ts"
import type { AgentInfo } from "./agent-config.ts"
import * as log from "https://deno.land/std@0.203.0/log/mod.ts"

export class ConfigFileService {
  private static readonly DEFAULT_CONFIG_PATH = "/app/agent.config.json"

  /**
   * Load and parse a configuration file from the specified path
   */
  static async loadConfigFile(configPath?: string): Promise<AgentInfo | null> {
    const filePath = configPath ||
      Deno.env.get("AGENT_CONFIG_FILE") ||
      ConfigFileService.DEFAULT_CONFIG_PATH

    try {
      log.info(`Attempting to load config file from: ${filePath}`)

      try {
        await Deno.stat(filePath)
      } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
          log.info(
            `Config file not found at ${filePath}, using database defaults`,
          )
          return null
        }
        throw error
      }

      const fileContent = await Deno.readTextFile(filePath)

      let parsedJson: unknown
      try {
        parsedJson = JSON.parse(fileContent)
      } catch (parseError) {
        log.error(`Failed to parse JSON from config file: ${parseError}`)
        throw new Error(
          `Invalid JSON in config file ${filePath}: ${parseError}`,
        )
      }

      // Validate against schema
      const validationResult = ConfigFileSchema.safeParse(parsedJson)
      if (!validationResult.success) {
        log.error(
          "Config file validation failed:",
          validationResult.error.issues,
        )
        const errorMessage = validationResult.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join(", ")
        throw new Error(`Config file validation failed: ${errorMessage}`)
      }

      const configFile = validationResult.data
      log.info(
        `Successfully loaded and validated config file: ${configFile.agent.name}`,
      )

      return transformConfigToAgentInfo(configFile.agent, configFile.mcpServers)
    } catch (error) {
      log.error(`Failed to load config file from ${filePath}:`, error)
      throw new Error(
        `Failed to load config file: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
  }
}
