export interface ModelEntry {
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

export interface ProviderConfig {
  id: string
  name: string
  models: ModelEntry[]
  requiredEnvVars: string[]
  description: string
}

// OpenAI Models
export const OPENAI_MODELS: ModelEntry[] = [
  {
    id: "openai/gpt-5",
    name: "GPT-5",
    description:
      "Full-scale reasoning model, state-of-the-art for coding and agentic tasks",
    pricing: { input: 0.01, output: 0.03 },
  },
  {
    id: "openai/gpt-5-mini",
    name: "GPT-5 Mini",
    description:
      "Smaller version of GPT-5 reasoning model, faster and more affordable",
    pricing: { input: 0.002, output: 0.008 },
  },
]

// Anthropic Models
export const ANTHROPIC_MODELS: ModelEntry[] = [
  {
    id: "anthropic/claude-sonnet-4-20250514",
    name: "Claude 4 Sonnet",
    description:
      "Hybrid model with instant responses and extended thinking, 1M context window",
    pricing: { input: 0.003, output: 0.015 },
  },
]

// Google Models
export const GOOGLE_MODELS: ModelEntry[] = [
  {
    id: "google/gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    description:
      "Latest Flash model with thinking capabilities, optimized for cost and performance",
    pricing: { input: 0.0001, output: 0.0004 },
  },
  {
    id: "google/gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    description:
      "Next-gen model with superior speed, native capability use, and 1M token context",
    pricing: { input: 0.00015, output: 0.0006 },
  },
]

// Centralized provider configuration
export const PROVIDER_CONFIGS: ProviderConfig[] = [
  {
    id: "openai",
    name: "OpenAI",
    models: OPENAI_MODELS,
    requiredEnvVars: ["OPENAI_API_KEY"],
    description: "OpenAI's GPT models including GPT-5 and GPT-5 Mini",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    models: ANTHROPIC_MODELS,
    requiredEnvVars: ["ANTHROPIC_API_KEY"],
    description:
      "Anthropic's Claude models with advanced reasoning capabilities",
  },
  {
    id: "google",
    name: "Google",
    models: GOOGLE_MODELS,
    requiredEnvVars: ["GOOGLE_GENERATIVE_AI_API_KEY"],
    description: "Google's Gemini models with multimodal capabilities",
  },
]

// Combined model registry (for backward compatibility)
export const MODEL_REGISTRY: Record<string, ModelEntry[]> = {
  openai: OPENAI_MODELS,
  anthropic: ANTHROPIC_MODELS,
  google: GOOGLE_MODELS,
}

// Helper functions
export function getModelsForProvider(providerId: string): ModelEntry[] {
  return MODEL_REGISTRY[providerId] || []
}

export function getAllModels(): ModelEntry[] {
  return Object.values(MODEL_REGISTRY).flat()
}

export function findModelById(modelId: string): ModelEntry | undefined {
  return getAllModels().find((model) => model.id === modelId)
}

// New helper functions for centralized provider configs
export function getProviderConfig(
  providerId: string,
): ProviderConfig | undefined {
  return PROVIDER_CONFIGS.find((config) => config.id === providerId)
}

export function getAllProviderConfigs(): ProviderConfig[] {
  return PROVIDER_CONFIGS
}

// Smart default model selection function
export function selectDefaultModel(
  availableModels: ModelEntry[],
): ModelEntry | null {
  if (availableModels.length === 0) return null

  const priorityOrder = [
    "openai/gpt-5-mini",
    "google/gemini-2.5-flash",
    "anthropic/claude-sonnet-4-latest",
    "openai/gpt-5",
    "google/gemini-2.0-flash",
  ]

  for (const preferredId of priorityOrder) {
    const preferredModel = availableModels.find((m) => m.id === preferredId)
    if (preferredModel) {
      return preferredModel
    }
  }

  // Fallback to first available model
  return availableModels[0]
}
