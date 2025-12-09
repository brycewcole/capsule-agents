import type { Context, Next } from "hono"
import { HTTPException } from "hono/http-exception"

/**
 * Basic authentication middleware for Hono
 * Validates credentials against ADMIN_PASSWORD environment variable
 * Username must be 'admin'
 */
export async function basicAuth(c: Context, next: Next) {
  const adminPassword = Deno.env.get("ADMIN_PASSWORD")

  if (!adminPassword) {
    throw new HTTPException(503, {
      message: "Authentication not configured",
    })
  }

  const authHeader = c.req.header("Authorization")

  if (!authHeader || !authHeader.startsWith("Basic ")) {
    throw new HTTPException(401, {
      message: "Invalid authentication credentials",
      res: new Response("Unauthorized", {
        status: 401,
        headers: {
          "WWW-Authenticate": 'Basic realm="Admin Access"',
        },
      }),
    })
  }

  try {
    const base64Credentials = authHeader.slice(6)
    const credentials = atob(base64Credentials)
    const [username, password] = credentials.split(":")

    // Use constant-time comparison to prevent timing attacks
    const isCorrectUsername = timingSafeEqual(username, "admin")
    const isCorrectPassword = timingSafeEqual(password, adminPassword)

    if (!isCorrectUsername || !isCorrectPassword) {
      throw new HTTPException(401, {
        message: "Invalid authentication credentials",
        res: new Response("Unauthorized", {
          status: 401,
          headers: {
            "WWW-Authenticate": 'Basic realm="Admin Access"',
          },
        }),
      })
    }

    // Authentication successful, proceed to next middleware/handler
    await next()
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error
    }
    throw new HTTPException(401, {
      message: "Invalid authentication credentials",
      res: new Response("Unauthorized", {
        status: 401,
        headers: {
          "WWW-Authenticate": 'Basic realm="Admin Access"',
        },
      }),
    })
  }
}

/**
 * Timing-safe string comparison to prevent timing attacks
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false
  }

  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }

  return result === 0
}
