import { anthropic } from "@ai-sdk/anthropic"
import { gateway, GatewayModelEntry } from "@ai-sdk/gateway"
import { google } from "@ai-sdk/google"
import { openai } from "@ai-sdk/openai"
import { loadApiKey } from "@ai-sdk/provider-utils"
import * as log from "@std/log"
import process from "node:process"

// Vercel's model format from gateway.getAvailableModels()
export interface GatewayModel {
  id: string
  name: string
  description?: string
  pricing?: {
    input: number
    output: number
    cachedInputTokens?: number
    cacheCreationInputTokens?: number
  }
}

export type ProviderInfo = {
  id: string
  name: string
  available: boolean
  models: GatewayModelEntry[]
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
          process.env[envVar]
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

  async getAvailableProviders(): Promise<ProviderInfo[]> {
    const providers: ProviderInfo[] = []

    // OpenAI Provider
    const openaiAvailable = this.checkProviderAvailability(
      "OPENAI_API_KEY",
      "OpenAI API key",
    )
    if (openaiAvailable) {
      const models = await this.getModelsForProvider("openai")
      providers.push({
        id: "openai",
        name: "OpenAI",
        available: true,
        models,
      })
    }

    // Anthropic Provider
    const anthropicAvailable = this.checkProviderAvailability(
      "ANTHROPIC_API_KEY",
      "Anthropic API key",
    )
    if (anthropicAvailable) {
      const models = await this.getModelsForProvider("anthropic")
      providers.push({
        id: "anthropic",
        name: "Anthropic",
        available: true,
        models,
      })
    }

    // Google Provider
    const googleAvailable = this.checkProviderAvailability(
      "GOOGLE_API_KEY",
      "Google API key",
    )
    if (googleAvailable) {
      const models = await this.getModelsForProvider("google")
      providers.push({
        id: "google",
        name: "Google",
        available: true,
        models,
      })
    }

    log.info(
      `Found ${providers.length} available providers: ${
        providers.map((p) => p.name).join(", ")
      }`,
    )
    return providers
  }

  private async getModelsForProvider(
    providerId: string,
  ): Promise<GatewayModelEntry[]> {
    try {
      const availableModels = await gateway.getAvailableModels()
      const providerModels = availableModels.models.filter((
        model: GatewayModelEntry,
      ) => model.id.startsWith(`${providerId}/`))

      return providerModels
    } catch (error) {
      log.error(
        `Failed to fetch models for provider ${providerId}: ${
          JSON.stringify(error)
        }`,
      )
      throw error
    }
  }

  async getAllAvailableModels(): Promise<GatewayModelEntry[]> {
    const providers = await this.getAvailableProviders()
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

  async isModelAvailable(modelName: string): Promise<boolean> {
    const availableModels = await this.getAllAvailableModels()
    return availableModels.some((model: GatewayModelEntry) =>
      model.id === modelName
    )
  }
}
