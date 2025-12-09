import type { OpenAIResponsesProviderOptions } from "@ai-sdk/openai"
import type { ProviderOptions } from "@ai-sdk/provider-utils"

type ProviderOptionDefinitions = {
  openai: OpenAIResponsesProviderOptions
}

class ProviderOptionsRegistry {
  private readonly registry: ProviderOptions = {}

  register<K extends keyof ProviderOptionDefinitions>(
    provider: K,
    options: ProviderOptionDefinitions[K],
  ): void {
    this.registry[provider] = options
  }

  getAll(): ProviderOptions {
    return { ...this.registry }
  }

  get<K extends keyof ProviderOptionDefinitions>(
    provider: K,
  ): ProviderOptionDefinitions[K] | undefined {
    return this.registry[provider] as
      | ProviderOptionDefinitions[K]
      | undefined
  }
}

const registry = new ProviderOptionsRegistry()

registry.register(
  "openai",
  {
    reasoningEffort: "minimal",
  } satisfies OpenAIResponsesProviderOptions,
)

export function getProviderOptions(): ProviderOptions {
  return registry.getAll()
}

export function getProviderOptionsFor<
  K extends keyof ProviderOptionDefinitions,
>(
  provider: K,
): ProviderOptionDefinitions[K] | undefined {
  return registry.get(provider)
}
