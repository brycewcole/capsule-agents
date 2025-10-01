import { Hono } from "hono"

export function createHealthController() {
  const router = new Hono()
  router.get("/health", (c) => c.json({ status: "ok" }))
  return router
}
