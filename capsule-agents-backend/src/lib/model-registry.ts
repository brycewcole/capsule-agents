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
    id: "anthropic/claude-sonnet-4",
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
      "Next-gen model with superior speed, native tool use, and 1M token context",
    pricing: { input: 0.00015, output: 0.0006 },
  },
]

// Combined model registry
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

