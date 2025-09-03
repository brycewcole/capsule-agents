import * as log from "@std/log"
import { createProviderRegistry } from "ai"
import { ProviderService } from "./provider-service.ts"

export class ModelRegistry {
  private static instance: ModelRegistry | null = null
  private registry: ReturnType<typeof createProviderRegistry> | null = null

  static getInstance(): ModelRegistry {
    if (!this.instance) {
      this.instance = new ModelRegistry()
    }
    return this.instance
  }

  private constructor() {
    this.initializeRegistry()
  }

  private initializeRegistry() {
    const providerService = ProviderService.getInstance()
    const providers = providerService.createProviderInstances()

    if (Object.keys(providers).length === 0) {
      throw new Error(
        "No providers available - no API keys found. Please configure at least one provider (OPENAI_API_KEY, ANTHROPIC_API_KEY, or GOOGLE_API_KEY)",
      )
    }

    this.registry = createProviderRegistry(providers)
    log.info(
      `Provider registry initialized with: ${
        Object.keys(providers).join(", ")
      }`,
    )
  }

  getModel(modelName: string) {
    if (!this.registry) {
      throw new Error("Provider registry not initialized")
    }

    // Parse the model name to extract provider and model
    const [provider, ...modelParts] = modelName.split("/")
    const model = modelParts.join("/")

    if (!provider || !model) {
      throw new Error(
        `Invalid model name format: ${modelName}. Expected format: provider/model`,
      )
    }
    log.info(
      `Getting model ${modelName} (provider: ${provider}, model: ${model})`,
    )

    return this.registry.languageModel(`${provider}:${model}`)
  }

  // Refresh the registry if environment variables change
  refresh() {
    log.info("Refreshing provider registry...")
    this.initializeRegistry()
  }

  async isModelSupported(modelName: string): Promise<boolean> {
    const providerService = ProviderService.getInstance()
    return await providerService.isModelAvailable(modelName)
  }
}
