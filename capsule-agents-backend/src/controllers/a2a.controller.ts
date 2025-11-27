import { JsonRpcTransportHandler } from "@a2a-js/sdk/server"
import { APICallError } from "ai"
import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { CapsuleAgentA2ARequestHandler } from "../lib/a2a-request-handler.ts"

function isAsyncGenerator(
  value: unknown,
): value is AsyncGenerator<unknown, void, undefined> {
  return Boolean(
    value && typeof value === "object" && value !== null &&
      (Symbol.asyncIterator in value),
  )
}

async function handleStreamError(
  error: unknown,
  stream: { writeSSE: (data: { data: string; id: string }) => Promise<void> },
  requestId: unknown,
): Promise<void> {
  if (APICallError.isInstance(error)) {
    console.error("AI API Call Error details:", {
      url: error.url,
      statusCode: error.statusCode,
      responseBody: error.responseBody,
    })
    await stream.writeSSE({
      data: JSON.stringify({
        jsonrpc: "2.0",
        id: requestId,
        error: { code: -32603, message: error.message },
      }),
      id: "error",
    })
  } else {
    await stream.writeSSE({
      data: JSON.stringify({
        jsonrpc: "2.0",
        id: requestId,
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : "Internal error",
        },
      }),
      id: "error",
    })
  }
}

export function createA2AController(deps: {
  jsonRpcHandler: JsonRpcTransportHandler
  a2aRequestHandler: CapsuleAgentA2ARequestHandler
}) {
  const router = new Hono()

  // Agent card endpoints
  const getAgentCardHandler = async (c) => {
    const path = c.req.path
    console.info(`GET ${path} - Getting agent card`)
    try {
      const agentCard = await deps.a2aRequestHandler.getAgentCard()
      console.info("Agent card retrieved successfully:", {
        name: agentCard.name,
        skillCount: agentCard.skills.length,
      })
      return c.json(agentCard)
    } catch (error) {
      console.error("Failed to get agent card:", error)
      return c.json({ error: "Failed to get agent card" }, 500)
    }
  }

  router.get("/.well-known/agent.json", getAgentCardHandler)
  router.get("/.well-known/agent-card.json", getAgentCardHandler)

  // Main A2A JSON-RPC endpoint at root
  router.post("/", async (c) => {
    console.info("POST / - A2A JSON-RPC endpoint called")

    let body
    try {
      body = await c.req.json()
    } catch (_error) {
      return c.json({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error" },
      }, 400)
    }

    try {
      const result = await deps.jsonRpcHandler.handle(body)
      if (isAsyncGenerator(result)) {
        return streamSSE(c, async (stream) => {
          let eventId = 0
          try {
            for await (const event of result) {
              await stream.writeSSE({
                data: JSON.stringify(event),
                id: String(eventId++),
              })
            }
          } catch (iterationError) {
            // Extract the actual error if it's wrapped in an error property
            const error =
              iterationError && typeof iterationError === "object" &&
                "error" in iterationError
                ? iterationError.error
                : iterationError
            await handleStreamError(error, stream, body.id)
          }
        }, async (e, stream) => {
          await handleStreamError(e, stream, body.id)
        })
      } else {
        // Non-streaming response (e.g., cancelTask, getTask)
        return c.json(result)
      }
    } catch (_error) {
      return c.json({
        jsonrpc: "2.0",
        id: body.id,
        error: { code: -32603, message: "Internal error" },
      }, 500)
    }
  })

  return router
}
