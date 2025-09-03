import { anthropic } from "@ai-sdk/anthropic"
import { google } from "@ai-sdk/google"
import { openai } from "@ai-sdk/openai"
import { loadApiKey } from "@ai-sdk/provider-utils"
import * as log from "@std/log"
import process from "node:process"
import { getModelsForProvider, ModelEntry } from "./model-registry.ts"

// Export ModelEntry from model-registry for compatibility
export type { ModelEntry } from "./model-registry.ts"

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
      log.info(
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
      log.debug(`Provider ${description} not available: ${error}`)
      return false
    }
  }

  getAvailableProviders(): ProviderInfo[] {
    const providers: ProviderInfo[] = []

    // OpenAI Provider
    const openaiAvailable = this.checkProviderAvailability(
      "OPENAI_API_KEY",
      "OpenAI API key",
    )
    const models = openaiAvailable ? getModelsForProvider("openai") : []
    providers.push({
      id: "openai",
      name: "OpenAI",
      available: openaiAvailable,
      models,
      requiredEnvVars: ["OPENAI_API_KEY"],
    })

    // Anthropic Provider
    const anthropicAvailable = this.checkProviderAvailability(
      "ANTHROPIC_API_KEY",
      "Anthropic API key",
    )
    const anthropicModels = anthropicAvailable
      ? getModelsForProvider("anthropic")
      : []
    providers.push({
      id: "anthropic",
      name: "Anthropic",
      available: anthropicAvailable,
      models: anthropicModels,
      requiredEnvVars: ["ANTHROPIC_API_KEY"],
    })

    const googleAvailable = this.checkProviderAvailability(
      "GOOGLE_GENERATIVE_AI_API_KEY",
      "Google Generative AI API key",
    )
    const googleModels = googleAvailable ? getModelsForProvider("google") : []
    providers.push({
      id: "google",
      name: "Google",
      available: googleAvailable,
      models: googleModels,
      requiredEnvVars: ["GOOGLE_GENERATIVE_AI_API_KEY"],
    })

    const availableCount = providers.filter((p) => p.available).length
    log.info(
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
    return {
      openai: this.checkProviderAvailability(
        "OPENAI_API_KEY",
        "OpenAI API key",
      ),
      anthropic: this.checkProviderAvailability(
        "ANTHROPIC_API_KEY",
        "Anthropic API key",
      ),
      google: this.checkProviderAvailability(
        "GOOGLE_API_KEY",
        "Google API key",
      ) || this.checkProviderAvailability(
        "GOOGLE_GENERATIVE_AI_API_KEY",
        "Google Generative AI API key",
      ),
    }
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
      log.info("Registered OpenAI provider")
    }

    if (status.anthropic) {
      providers.anthropic = anthropic
      log.info("Registered Anthropic provider")
    }

    if (status.google) {
      providers.google = google
      log.info("Registered Google provider")
    }

    return providers
  }

  isModelAvailable(modelName: string): boolean {
    const availableModels = this.getAllAvailableModels()
    return availableModels.some((model: ModelEntry) => model.id === modelName)
  }
}
