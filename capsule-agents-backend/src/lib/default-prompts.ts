import { parse as parseYaml } from "jsr:@std/yaml@1.0.10"

export type ModelFilterConfig = {
  /**
   * List of case-insensitive model id patterns that should enable this prompt.
   * Supports '*' as a wildcard suffix/prefix.
   */
  include?: string[]
}

export interface BuiltInPromptDefinition {
  id: string
  title: string
  text: string
  modelFilter?: ModelFilterConfig
  priority: number
}

export interface BuiltInPromptUsage extends BuiltInPromptDefinition {
  matchesModel: boolean
}

interface FrontMatterMetadata {
  id: string
  title: string
  models?: string | string[]
  priority?: number
}

function parseFrontMatter(content: string): {
  metadata: FrontMatterMetadata
  text: string
  modelFilter?: ModelFilterConfig
  priority: number
} {
  const frontMatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/
  const match = content.match(frontMatterRegex)

  if (!match) {
    throw new Error("No YAML front matter found in prompt file")
  }

  const [, yamlContent, promptText] = match
  const metadata = parseYaml(yamlContent) as FrontMatterMetadata

  if (!metadata.id || !metadata.title) {
    throw new Error("Front matter must include 'id' and 'title' fields")
  }

  // Convert simple 'models' field to ModelFilterConfig
  let modelFilter: ModelFilterConfig | undefined
  if (metadata.models) {
    const patterns = Array.isArray(metadata.models)
      ? metadata.models
      : [metadata.models]
    modelFilter = { include: patterns }
  }

  // Default priority is 0 if not specified (lower numbers = higher priority)
  const priority = metadata.priority ?? 0

  return {
    metadata,
    text: promptText.trim(),
    modelFilter,
    priority,
  }
}

function loadPromptFile(filename: string): BuiltInPromptDefinition {
  const url = new URL(`./built-in-prompts/${filename}`, import.meta.url)
  try {
    const content = Deno.readTextFileSync(url)
    const { metadata, text, modelFilter, priority } = parseFrontMatter(content)
    return {
      id: metadata.id,
      title: metadata.title,
      text,
      modelFilter,
      priority,
    }
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to load built-in prompt '${filename}': ${details}`)
  }
}

function loadAllPrompts(): BuiltInPromptDefinition[] {
  const promptsDir = new URL("./built-in-prompts/", import.meta.url)
  const prompts: BuiltInPromptDefinition[] = []

  try {
    for (const entry of Deno.readDirSync(promptsDir)) {
      if (entry.isFile && entry.name.endsWith(".txt")) {
        prompts.push(loadPromptFile(entry.name))
      }
    }
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to load built-in prompts: ${details}`)
  }

  return prompts
}

const BUILT_IN_PROMPTS: BuiltInPromptDefinition[] = loadAllPrompts()

function escapeForRegex(pattern: string): string {
  return pattern.replace(/[-[\]{}()+?.\\^$|]/g, "\\$&")
}

function patternToRegex(pattern: string): RegExp {
  const escaped = escapeForRegex(pattern).replace(/\*/g, ".*")
  return new RegExp(`^${escaped}$`, "i")
}

function matchesPattern(value: string, pattern: string): boolean {
  const regex = patternToRegex(pattern)
  return regex.test(value)
}

export function modelMatchesFilter(
  modelId: string | undefined,
  filter?: ModelFilterConfig,
): boolean {
  if (!filter || !filter.include || filter.include.length === 0) {
    return true
  }

  const effectiveId = (modelId || "").toLowerCase()
  const includeList = filter.include.map((pattern) => pattern.toLowerCase())

  return includeList.some((pattern) => matchesPattern(effectiveId, pattern))
}

export function getBuiltInPromptUsage(
  modelId: string | undefined,
): BuiltInPromptUsage[] {
  return BUILT_IN_PROMPTS.map((prompt) => ({
    ...prompt,
    matchesModel: modelMatchesFilter(modelId, prompt.modelFilter),
  }))
}

export function buildSystemPrompt(options: {
  userPrompt?: string
  modelId?: string
  enabled: boolean
}): { prompt: string; prompts: BuiltInPromptUsage[] } {
  const usage = getBuiltInPromptUsage(options.modelId)
  const trimmedUserPrompt = options.userPrompt?.trim() ?? ""

  const activePromptTexts = options.enabled
    ? usage.filter((prompt) => prompt.matchesModel)
      .sort((a, b) => a.priority - b.priority) // Sort by priority (lower = earlier)
      .map((prompt) => prompt.text.trim())
      .filter((text) => text.length > 0)
    : []

  const segments = [...activePromptTexts]
  if (trimmedUserPrompt.length > 0) {
    segments.push(trimmedUserPrompt)
  }

  const combined = segments.join("\n\n").trim()

  return {
    prompt: combined,
    prompts: usage,
  }
}

export function listBuiltInPromptDefinitions(): BuiltInPromptDefinition[] {
  return [...BUILT_IN_PROMPTS]
}
