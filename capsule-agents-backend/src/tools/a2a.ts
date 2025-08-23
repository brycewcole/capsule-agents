import { tool } from "ai"
import { z } from "zod"
import type * as A2A from "@a2a-js/sdk"
import * as log from "@std/log"

interface A2AToolInput {
  agentUrl: string
  message: string
  contextId?: string
}

interface A2AToolResult {
  success?: boolean
  error?: string
  response?: string
  taskId?: string
  status?: A2A.TaskStatus
  contextId?: string
  messageId?: string
  message?: string
  result?: unknown
  note?: string
  suggestion?: string
  code?: number
  data?: unknown
  agentUrl?: string
  method?: string
}

interface JsonRpcRequest {
  jsonrpc: "2.0"
  method: string
  params: unknown
  id: string
}

async function processStreamingResponse(
  response: Response,
  agentUrl: string,
): Promise<A2AToolResult> {
  try {
    const reader = response.body?.getReader()
    if (!reader) {
      return {
        error: "No response body reader available",
        agentUrl,
      }
    }

    const decoder = new TextDecoder()
    let buffer = ""
    let finalResponse = ""
    let taskId = ""
    let contextId = ""

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() || "" // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const eventData = line.slice(6) // Remove "data: " prefix
            if (eventData.trim() === "") continue // Skip empty data lines

            log.info(`Raw streaming event data:`, { eventData })
            const event = JSON.parse(eventData)
            log.info(`Parsed streaming event:`, {
              kind: event.kind,
              type: typeof event,
            })

            // Handle A2A event types (same format as our own sendMessageStream)
            if (event.kind === "task") {
              taskId = event.id
              contextId = event.contextId
              log.info(`Task started:`, { taskId, contextId })
            } else if (event.kind === "message") {
              // Extract response text from message parts
              const textParts = event.parts?.filter((part: unknown) =>
                part && typeof part === "object" && "kind" in part &&
                part.kind === "text"
              ) || []
              const responseText = textParts.map((part: unknown) =>
                part && typeof part === "object" && "text" in part
                  ? part.text
                  : ""
              ).join("\n")
              if (responseText) {
                finalResponse = responseText
                log.info(`Received response message:`, {
                  length: responseText.length,
                  text: responseText,
                })
              }
            } else if (event.kind === "status-update") {
              log.debug(`Task status update:`, { status: event.status })
            } else {
              log.debug(`Unknown event kind:`, { kind: event.kind })
            }
          } catch (parseError) {
            log.warn(`Failed to parse streaming event:`, {
              line,
              error: parseError,
            })
          }
        }
      }
    }

    // Return the final response
    if (finalResponse) {
      return {
        success: true,
        response: finalResponse,
        taskId,
        contextId,
      }
    } else if (taskId) {
      return {
        success: true,
        taskId,
        contextId,
        message: "Task completed but no response content received",
      }
    } else {
      return {
        success: true,
        note: "Stream completed but no content received",
      }
    }
  } catch (error) {
    log.error("Error processing streaming response:", error)
    return {
      error: `Failed to process streaming response: ${
        error instanceof Error ? error.message : String(error)
      }`,
      agentUrl,
    }
  }
}

export async function executeA2ACall(
  input: A2AToolInput,
): Promise<A2AToolResult> {
  const { agentUrl, message, contextId } = input

  try {
    log.info(`Attempting to communicate with agent at ${agentUrl}`)

    // First, get the agent's capabilities to ensure it's a valid A2A agent
    try {
      const agentCardResponse = await fetch(
        `${agentUrl}/.well-known/agent.json`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        },
      )

      if (!agentCardResponse.ok) {
        return {
          error:
            `Failed to get agent card from ${agentUrl} (status: ${agentCardResponse.status})`,
          suggestion:
            "Make sure the agent URL is correct and the agent is running",
        }
      }

      const agentCard: A2A.AgentCard = await agentCardResponse.json()
      log.info(`Successfully retrieved agent card from ${agentUrl}:`, {
        name: agentCard.name,
      })
    } catch (error) {
      return {
        error: `Failed to connect to agent at ${agentUrl}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        suggestion: "Check that the agent is running and accessible",
      }
    }

    // Send message using A2A protocol with streaming
    const messageParams: A2A.MessageSendParams = {
      message: {
        kind: "message",
        messageId: `msg_${crypto.randomUUID()}`,
        role: "user",
        parts: [
          {
            kind: "text",
            text: message,
          },
        ],
        contextId: contextId || crypto.randomUUID(),
      },
    }

    log.info(`Sending A2A streaming message to ${agentUrl}`, {
      contextId: messageParams.message.contextId,
      messageLength: message.length,
    })

    const jsonRpcRequest: JsonRpcRequest = {
      jsonrpc: "2.0",
      method: "message/stream",
      params: messageParams,
      id: crypto.randomUUID(),
    }

    const response = await fetch(agentUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
      },
      body: JSON.stringify(jsonRpcRequest),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return {
        error:
          `A2A request failed with status ${response.status}: ${errorText}`,
        agentUrl,
        method: "message/stream",
      }
    }

    // Process the streaming response
    return await processStreamingResponse(response, agentUrl)
  } catch (error) {
    log.error("A2A tool execution error:", error)
    return {
      error: `Failed to communicate with agent: ${
        error instanceof Error ? error.message : String(error)
      }`,
      agentUrl,
    }
  }
}

export const a2aTool = tool({
  description:
    "Communicate with other agents using the Agent-to-Agent (A2A) protocol. Send messages to other agents and get their responses.",
  inputSchema: z.object({
    agentUrl: z.string().describe(
      "The URL of the agent to communicate with (e.g., http://localhost:8080)",
    ),
    message: z.string().describe("The message to send to the agent"),
    contextId: z.string().optional().describe(
      "Optional context ID for conversation continuity",
    ),
  }),
  execute: executeA2ACall,
})

export const a2aMetadata: A2A.AgentSkill = {
  id: "a2a-communication",
  name: "Agent Communication",
  description:
    "Communicate with other agents using the Agent-to-Agent (A2A) protocol for collaboration",
  tags: ["communication", "agents", "collaboration", "a2a", "json-rpc"],
  examples: [
    "Communicate with other agents",
    "Delegate tasks to specialized agents",
    "Coordinate multi-agent workflows",
    "Send JSON-RPC requests to agents",
    "Collaborate on complex tasks",
  ],
  inputModes: ["text/plain"],
  outputModes: ["application/json"],
}
