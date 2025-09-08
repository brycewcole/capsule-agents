import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import * as log from "@std/log"
import { JsonRpcTransportHandler } from "@a2a-js/sdk/server"
import { CapsuleAgentA2ARequestHandler } from "../lib/a2a-request-handler.ts"

function isAsyncGenerator(value: unknown): value is AsyncGenerator<unknown, void, undefined> {
  return Boolean(value && typeof value === "object" && value !== null && (Symbol.asyncIterator in value))
}

export function createA2AController(deps: {
  jsonRpcHandler: JsonRpcTransportHandler
  a2aRequestHandler: CapsuleAgentA2ARequestHandler
}) {
  const router = new Hono()

  // Agent card endpoints
  const getAgentCardHandler = async (c) => {
    const path = c.req.path
    log.info(`GET ${path} - Getting agent card`)
    try {
      const agentCard = await deps.a2aRequestHandler.getAgentCard()
      log.info("Agent card retrieved successfully:", {
        name: agentCard.name,
        skillCount: agentCard.skills.length,
      })
      return c.json(agentCard)
    } catch (error) {
      log.error("Failed to get agent card:", error)
      return c.json({ error: "Failed to get agent card" }, 500)
    }
  }

  router.get("/.well-known/agent.json", getAgentCardHandler)
  router.get("/.well-known/agent-card.json", getAgentCardHandler)

  // Main A2A JSON-RPC endpoint at root
  router.post("/", async (c) => {
    log.info("POST / - A2A JSON-RPC endpoint called")

    let body
    try {
      body = await c.req.json()
    } catch (error) {
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
          try {
            let eventId = 0
            for await (const event of result) {
              await stream.writeSSE({ data: JSON.stringify(event), id: String(eventId++) })
            }
          } catch (err) {
            await stream.writeSSE({
              data: JSON.stringify({
                jsonrpc: "2.0",
                id: body.id,
                error: { code: -32603, message: "Streaming error" },
              }),
              id: "error",
            })
          }
        })
      }
      return c.json(result)
    } catch (error) {
      return c.json({
        jsonrpc: "2.0",
        id: body.id,
        error: { code: -32603, message: "Internal error" },
      }, 500)
    }
  })

  return router
}

