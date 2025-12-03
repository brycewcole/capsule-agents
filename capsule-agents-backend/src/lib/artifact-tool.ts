import type { Tool } from "ai"
import { tool } from "ai"
import { z } from "zod"
import {
  extractStringFieldsFromBuffer,
  parsePartialObjectFromStream,
} from "./streaming-json.ts"

export const artifactInputSchema = z.object({
  name: z.string().describe("Artifact name/title"),
  description: z.string().optional().describe(
    "Brief description of the artifact",
  ),
  content: z.string().describe("The artifact content"),
  contentType: z.enum(["html", "markdown", "code", "text"]).describe(
    "Content type",
  ),
})

export type ArtifactInput = z.infer<typeof artifactInputSchema>

/**
 * Callback type for artifact streaming updates
 */
export type ArtifactStreamCallback = (update: {
  toolCallId: string
  artifactId: string
  name: string
  description?: string
  content: string
  isComplete: boolean
}) => void

/**
 * State tracked per artifact tool call for streaming
 */
type ArtifactStreamingState = {
  artifactId: string
  inputBuffer: string
  name: string
  description?: string
  content: string
}

/**
 * Return type for artifact tool execution
 */
export type ArtifactExecutionResult = {
  success: boolean
  message: string
  contentType: string
  contentLength: number
}

// Type alias for the artifact tool
type ArtifactTool = Tool<ArtifactInput, ArtifactExecutionResult>

/**
 * Create artifact tool with real-time streaming support via onInputDelta hooks.
 * This bypasses fullStream buffering by emitting updates directly from the hook.
 */
export function createArtifactTool(
  onArtifactUpdate?: ArtifactStreamCallback,
) {
  // Track streaming state per tool call
  const streamingStates = new Map<string, ArtifactStreamingState>()

  return tool({
    description:
      "Create an artifact for visual content, interactive demos, or formatted documents. Use this for HTML pages, code examples, diagrams, or any content that should be presented separately from the conversation.",
    inputSchema: artifactInputSchema,

    // Called when tool input streaming starts
    onInputStart: ({ toolCallId }) => {
      streamingStates.set(toolCallId, {
        artifactId: crypto.randomUUID(),
        inputBuffer: "",
        name: "Artifact",
        content: "",
      })
    },

    // Called for each chunk of tool input - this is the key to real-time streaming!
    onInputDelta: ({ toolCallId, inputTextDelta }) => {
      const state = streamingStates.get(toolCallId)
      if (!state || !onArtifactUpdate) return

      state.inputBuffer += inputTextDelta

      // Track previous values to detect actual changes
      const prevName = state.name
      const prevDescription = state.description
      const prevContentLen = state.content.length

      // Try to parse streaming fields from buffer
      const parsedInput = parsePartialObjectFromStream<ArtifactInput>(
        state.inputBuffer,
        ["name", "description", "content", "contentType"],
      )
      if (parsedInput) {
        if (parsedInput.name) state.name = parsedInput.name
        if (parsedInput.description) state.description = parsedInput.description
        if (parsedInput.content) state.content = parsedInput.content
      }

      const streamingFields = extractStringFieldsFromBuffer<ArtifactInput>(
        state.inputBuffer,
        ["content", "name", "description"],
      )
      if (streamingFields) {
        if (streamingFields.name) state.name = streamingFields.name
        if (streamingFields.description) {
          state.description = streamingFields.description
        }
        if (streamingFields.content) state.content = streamingFields.content
      }

      // Only emit if something actually changed
      const nameChanged = state.name !== prevName
      const descriptionChanged = state.description !== prevDescription
      const contentChanged = state.content.length !== prevContentLen

      if (nameChanged || descriptionChanged || contentChanged) {
        onArtifactUpdate({
          toolCallId,
          artifactId: state.artifactId,
          name: state.name,
          description: state.description,
          content: state.content,
          isComplete: false,
        })
      }
    },

    // Called when input is fully available
    onInputAvailable: ({ toolCallId, input }) => {
      const state = streamingStates.get(toolCallId)
      if (!onArtifactUpdate) return

      const typedInput = input as ArtifactInput

      onArtifactUpdate({
        toolCallId,
        artifactId: state?.artifactId ?? crypto.randomUUID(),
        name: typedInput.name,
        description: typedInput.description,
        content: typedInput.content,
        isComplete: true,
      })

      // Clean up state
      streamingStates.delete(toolCallId)
    },

    // Execute function to ensure tool_result is generated
    execute: ({ name, description: _description, content, contentType }) => {
      return {
        success: true,
        message: `Artifact "${name}" created successfully`,
        contentType,
        contentLength: content.length,
      }
    },
  })
}

/**
 * Static artifact tool for non-streaming use cases
 */
export const artifactTool = tool({
  description:
    "Create an artifact for visual content, interactive demos, or formatted documents. Use this for HTML pages, code examples, diagrams, or any content that should be presented separately from the conversation.",
  inputSchema: artifactInputSchema,
  execute: ({ name, description: _description, content, contentType }) => {
    return {
      success: true,
      message: `Artifact "${name}" created successfully`,
      contentType,
      contentLength: content.length,
    }
  },
})
