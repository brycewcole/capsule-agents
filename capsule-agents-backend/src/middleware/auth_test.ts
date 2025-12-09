import { assertEquals } from "@std/assert"
import { Hono } from "hono"
import { basicAuth } from "./auth.ts"

Deno.test("basicAuth middleware - should reject requests without auth header", async () => {
  // Set up test environment
  Deno.env.set("ADMIN_PASSWORD", "testpass")

  const app = new Hono()
  app.use("/protected/*", basicAuth)
  app.get("/protected/resource", (c) => c.json({ success: true }))

  const req = new Request("http://localhost/protected/resource")
  const res = await app.fetch(req)

  assertEquals(res.status, 401)
  assertEquals(
    res.headers.get("WWW-Authenticate"),
    'Basic realm="Admin Access"',
  )
})

Deno.test("basicAuth middleware - should reject requests with invalid credentials", async () => {
  Deno.env.set("ADMIN_PASSWORD", "testpass")

  const app = new Hono()
  app.use("/protected/*", basicAuth)
  app.get("/protected/resource", (c) => c.json({ success: true }))

  const credentials = btoa("admin:wrongpass")
  const req = new Request("http://localhost/protected/resource", {
    headers: {
      "Authorization": `Basic ${credentials}`,
    },
  })
  const res = await app.fetch(req)

  assertEquals(res.status, 401)
})

Deno.test("basicAuth middleware - should reject requests with wrong username", async () => {
  Deno.env.set("ADMIN_PASSWORD", "testpass")

  const app = new Hono()
  app.use("/protected/*", basicAuth)
  app.get("/protected/resource", (c) => c.json({ success: true }))

  const credentials = btoa("wronguser:testpass")
  const req = new Request("http://localhost/protected/resource", {
    headers: {
      "Authorization": `Basic ${credentials}`,
    },
  })
  const res = await app.fetch(req)

  assertEquals(res.status, 401)
})

Deno.test("basicAuth middleware - should accept requests with valid credentials", async () => {
  Deno.env.set("ADMIN_PASSWORD", "testpass")

  const app = new Hono()
  app.use("/protected/*", basicAuth)
  app.get("/protected/resource", (c) => c.json({ success: true }))

  const credentials = btoa("admin:testpass")
  const req = new Request("http://localhost/protected/resource", {
    headers: {
      "Authorization": `Basic ${credentials}`,
    },
  })
  const res = await app.fetch(req)

  assertEquals(res.status, 200)
  const data = await res.json()
  assertEquals(data, { success: true })
})

Deno.test("basicAuth middleware - should return 503 if ADMIN_PASSWORD not configured", async () => {
  // Clear the env var
  Deno.env.delete("ADMIN_PASSWORD")

  const app = new Hono()
  app.use("/protected/*", basicAuth)
  app.get("/protected/resource", (c) => c.json({ success: true }))

  const credentials = btoa("admin:anypass")
  const req = new Request("http://localhost/protected/resource", {
    headers: {
      "Authorization": `Basic ${credentials}`,
    },
  })
  const res = await app.fetch(req)

  assertEquals(res.status, 503)

  // Restore for other tests
  Deno.env.set("ADMIN_PASSWORD", "testpass")
})
