import { anthropic } from "@ai-sdk/anthropic"
import { google } from "@ai-sdk/google"
import { openai } from "@ai-sdk/openai"
import { loadApiKey } from "@ai-sdk/provider-utils"
import process from "node:process"
import { getAllProviderConfigs, ModelEntry } from "../lib/model-registry.ts"

// Export types from model-registry for compatibility
export type { ModelEntry, ProviderConfig } from "../lib/model-registry.ts"

export type ProviderInfo = {
  id: string
  name: string
  available: boolean
  models: ModelEntry[]
  requiredEnvVars: string[]
}

export class ProviderService {
  private static instance: ProviderService | null = null

  static getInstance(): ProviderService {
    if (!this.instance) {
      this.instance = new ProviderService()
    }
    return this.instance
  }

  private checkProviderAvailability(
    envVar: string,
    description: string,
  ): boolean {
    try {
      console.debug(
        `Checking availability of ${envVar} for ${description} with result ${
          process.env[envVar] ? "FOUND" : "NOT FOUND"
        }`,
      )
      loadApiKey({
        apiKey: undefined, // Let it load from environment
        environmentVariableName: envVar,
        description: description,
      })
      return true
    } catch (error) {
      console.debug(`Provider ${description} not available: ${error}`)
      return false
    }
  }

  getAvailableProviders(): ProviderInfo[] {
    const providers: ProviderInfo[] = []
    const providerConfigs = getAllProviderConfigs()

    for (const config of providerConfigs) {
      // Check if any of the required environment variables are available
      const isAvailable = config.requiredEnvVars.some((envVar) =>
        this.checkProviderAvailability(envVar, `${config.name} API key`)
      )

      const models = isAvailable ? config.models : []

      providers.push({
        id: config.id,
        name: config.name,
        available: isAvailable,
        models,
        requiredEnvVars: config.requiredEnvVars,
      })
    }

    const availableCount = providers.filter((p) => p.available).length
    console.debug(
      `Found ${availableCount}/${providers.length} available providers: ${
        providers.filter((p) => p.available).map((p) => p.name).join(", ")
      }`,
    )
    return providers
  }

  getAllAvailableModels(): ModelEntry[] {
    const providers = this.getAvailableProviders()
    return providers
      .filter((provider) => provider.available)
      .flatMap((provider) => provider.models)
  }

  getProviderStatus(): Record<string, boolean> {
    const status: Record<string, boolean> = {}
    const providerConfigs = getAllProviderConfigs()

    for (const config of providerConfigs) {
      // Check if any of the required environment variables are available
      status[config.id] = config.requiredEnvVars.some((envVar) =>
        this.checkProviderAvailability(envVar, `${config.name} API key`)
      )
    }

    return status
  }

  // Create provider instances using AI SDK's direct provider imports
  // These will automatically load API keys from environment variables
  createProviderInstances(): Record<
    string,
    typeof openai | typeof anthropic | typeof google
  > {
    const providers: Record<
      string,
      typeof openai | typeof anthropic | typeof google
    > = {}
    const status = this.getProviderStatus()

    if (status.openai) {
      providers.openai = openai
      console.info("Registered OpenAI provider")
    }

    if (status.anthropic) {
      providers.anthropic = anthropic
      console.info("Registered Anthropic provider")
    }

    if (status.google) {
      providers.google = google
      console.info("Registered Google provider")
    }

    return providers
  }

  isModelAvailable(modelName: string): boolean {
    const availableModels = this.getAllAvailableModels()
    return availableModels.some((model: ModelEntry) => model.id === modelName)
  }
}
