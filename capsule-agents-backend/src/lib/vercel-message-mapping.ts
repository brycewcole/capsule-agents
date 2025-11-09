import type { UIDataTypes, UIMessagePart, UITools } from "ai"

// Type alias for our specific UIMessagePart implementation
type MyUIMessagePart = UIMessagePart<UIDataTypes, UITools>

export interface DBMessagePart {
  id: string
  messageId: string
  type: string
  orderIndex: number
  createdAt: number

  // Text parts
  text_text?: string

  // Reasoning parts
  reasoning_text?: string

  // File parts
  file_mediaType?: string
  file_filename?: string
  file_url?: string

  // Source URL parts
  source_url_sourceId?: string
  source_url_url?: string
  source_url_title?: string

  // Source document parts
  source_document_sourceId?: string
  source_document_mediaType?: string
  source_document_title?: string
  source_document_filename?: string

  // Tool call shared columns
  tool_toolCallId?: string
  tool_toolName?: string
  tool_state?: string
  tool_errorText?: string
  tool_input?: string
  tool_output?: string

  // Provider metadata
  provider_metadata?: string
}

export function mapUIMessagePartsToDBParts(
  messageParts: MyUIMessagePart[],
  messageId: string,
): Omit<DBMessagePart, "id" | "createdAt">[] {
  return messageParts.map((part, index) => {
    const basePart = {
      messageId,
      orderIndex: index,
      type: part.type,
    }

    switch (part.type) {
      case "text": {
        const textPart = part as Extract<MyUIMessagePart, { type: "text" }>
        return {
          ...basePart,
          text_text: textPart.text,
        }
      }

      case "reasoning": {
        const reasoningPart = part as Extract<
          MyUIMessagePart,
          { type: "reasoning" }
        >
        return {
          ...basePart,
          reasoning_text: reasoningPart.text,
          provider_metadata: reasoningPart.providerMetadata
            ? JSON.stringify(reasoningPart.providerMetadata)
            : undefined,
        }
      }

      case "file": {
        const filePart = part as Extract<MyUIMessagePart, { type: "file" }>
        return {
          ...basePart,
          file_mediaType: filePart.mediaType,
          file_filename: filePart.filename,
          file_url: filePart.url,
        }
      }

      case "source-url": {
        const sourcePart = part as Extract<
          MyUIMessagePart,
          { type: "source-url" }
        >
        return {
          ...basePart,
          source_url_sourceId: sourcePart.sourceId,
          source_url_url: sourcePart.url,
          source_url_title: sourcePart.title,
          provider_metadata: sourcePart.providerMetadata
            ? JSON.stringify(sourcePart.providerMetadata)
            : undefined,
        }
      }

      case "source-document": {
        const docPart = part as Extract<
          MyUIMessagePart,
          { type: "source-document" }
        >
        return {
          ...basePart,
          source_document_sourceId: docPart.sourceId,
          source_document_mediaType: docPart.mediaType,
          source_document_title: docPart.title,
          source_document_filename: docPart.filename,
          provider_metadata: docPart.providerMetadata
            ? JSON.stringify(docPart.providerMetadata)
            : undefined,
        }
      }

      case "step-start":
        return basePart

      default:
        // Handle tool calls generically
        if (part.type.startsWith("tool-") || part.type === "dynamic-tool") {
          const toolPart = part as {
            type: string
            toolCallId: string
            toolName?: string
            state: string
            input?: unknown
            output?: unknown
            errorText?: string
          }

          // Extract tool name from type if not explicitly provided
          // For static tools: "tool-exec" -> "exec"
          // For dynamic tools: use toolName property
          const toolName = part.type === "dynamic-tool"
            ? toolPart.toolName
            : (toolPart.toolName || part.type.replace(/^tool-/, ""))

          return {
            ...basePart,
            tool_toolCallId: toolPart.toolCallId,
            tool_toolName: toolName,
            tool_state: toolPart.state,
            tool_input: toolPart.state === "input-available" ||
                toolPart.state === "output-available" ||
                toolPart.state === "output-error"
              ? JSON.stringify(toolPart.input)
              : undefined,
            tool_output: toolPart.state === "output-available"
              ? JSON.stringify(toolPart.output)
              : undefined,
            tool_errorText: toolPart.state === "output-error"
              ? toolPart.errorText
              : undefined,
          }
        }

        // Fallback for unknown types
        return basePart
    }
  })
}

export function mapDBPartToUIMessagePart(part: DBMessagePart): MyUIMessagePart {
  console.debug("Mapping DB part to UIMessagePart:", JSON.stringify(part))
  switch (part.type) {
    case "text":
      return {
        type: "text",
        text: part.text_text!,
      }

    case "reasoning":
      return {
        type: "reasoning",
        text: part.reasoning_text!,
        providerMetadata: part.provider_metadata
          ? JSON.parse(part.provider_metadata)
          : undefined,
      }

    case "file":
      return {
        type: "file",
        mediaType: part.file_mediaType!,
        filename: part.file_filename,
        url: part.file_url!,
      }

    case "source-url":
      return {
        type: "source-url",
        sourceId: part.source_url_sourceId!,
        url: part.source_url_url!,
        title: part.source_url_title,
        providerMetadata: part.provider_metadata
          ? JSON.parse(part.provider_metadata)
          : undefined,
      }

    case "source-document":
      return {
        type: "source-document",
        sourceId: part.source_document_sourceId!,
        mediaType: part.source_document_mediaType!,
        title: part.source_document_title!,
        filename: part.source_document_filename,
        providerMetadata: part.provider_metadata
          ? JSON.parse(part.provider_metadata)
          : undefined,
      }

    case "step-start":
      return {
        type: "step-start",
      }

    default:
      // Handle tool calls generically
      if (part.type.startsWith("tool-") || part.type == "dynamic-tool") {
        if (!part.tool_state) {
          throw new Error(`Tool state is undefined for type: ${part.type}`)
        }

        const baseInput = part.tool_input ? JSON.parse(part.tool_input) : {}

        // Handle dynamic tools separately
        if (part.type === "dynamic-tool") {
          if (!part.tool_toolName) {
            throw new Error("Dynamic tool must have toolName")
          }

          const baseDynamicTool = {
            type: "dynamic-tool" as const,
            toolCallId: part.tool_toolCallId!,
            toolName: part.tool_toolName,
          }

          switch (part.tool_state) {
            case "input-streaming":
              return {
                ...baseDynamicTool,
                state: "input-streaming",
                input: baseInput,
              }

            case "input-available":
              return {
                ...baseDynamicTool,
                state: "input-available",
                input: baseInput,
              }

            case "output-available":
              return {
                ...baseDynamicTool,
                state: "output-available",
                input: baseInput,
                output: part.tool_output
                  ? JSON.parse(part.tool_output)
                  : undefined,
              }

            case "output-error":
              return {
                ...baseDynamicTool,
                state: "output-error",
                input: baseInput,
                errorText: part.tool_errorText || "Unknown error",
              }

            default:
              throw new Error(`Unknown tool state: ${part.tool_state}`)
          }
        }

        // Handle static tools
        const baseStaticTool = {
          type: part.type as `tool-${string}`,
          toolCallId: part.tool_toolCallId!,
        }

        switch (part.tool_state) {
          case "input-streaming":
            return {
              ...baseStaticTool,
              state: "input-streaming",
              input: baseInput,
            }

          case "input-available":
            return {
              ...baseStaticTool,
              state: "input-available",
              input: baseInput,
            }

          case "output-available":
            return {
              ...baseStaticTool,
              state: "output-available",
              input: baseInput,
              output: part.tool_output
                ? JSON.parse(part.tool_output)
                : undefined,
            }

          case "output-error":
            return {
              ...baseStaticTool,
              state: "output-error",
              input: baseInput,
              errorText: part.tool_errorText || "Unknown error",
            }

          default:
            throw new Error(`Unknown tool state: ${part.tool_state}`)
        }
      }

      throw new Error(`Unsupported part type: ${part.type}`)
  }
}
