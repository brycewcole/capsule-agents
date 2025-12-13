import { Hono } from "hono"
import type { ScheduleService } from "../services/schedule.service.ts"
import type { ScheduleInput } from "../repositories/schedule.repository.ts"

export function createScheduleController(scheduleService: ScheduleService) {
  const app = new Hono()

  // GET /api/schedules - List all schedules
  app.get("/schedules", (c) => {
    try {
      const schedules = scheduleService.getAllSchedules()
      return c.json({ schedules })
    } catch (error) {
      console.error("Failed to get schedules:", error)
      return c.json(
        { error: "Failed to retrieve schedules" },
        500,
      )
    }
  })

  // POST /api/schedules - Create new schedule
  app.post("/schedules", async (c) => {
    try {
      const body = await c.req.json()

      // Validate required fields
      if (!body.name || !body.prompt || !body.cronExpression) {
        return c.json(
          { error: "Missing required fields: name, prompt, cronExpression" },
          400,
        )
      }

      const input: ScheduleInput = {
        name: body.name,
        prompt: body.prompt,
        cronExpression: body.cronExpression,
        enabled: body.enabled !== false,
        contextId: body.contextId,
        backoffEnabled: body.backoffEnabled || false,
        backoffSchedule: body.backoffSchedule,
        hooks: body.hooks,
      }

      const schedule = scheduleService.createSchedule(input)
      return c.json(schedule, 201)
    } catch (error) {
      console.error("Failed to create schedule:", error)
      return c.json(
        { error: "Failed to create schedule" },
        500,
      )
    }
  })

  // GET /api/schedules/:id - Get schedule details
  app.get("/schedules/:id", (c) => {
    try {
      const id = c.req.param("id")
      const schedule = scheduleService.getSchedule(id)

      if (!schedule) {
        return c.json({ error: "Schedule not found" }, 404)
      }

      return c.json(schedule)
    } catch (error) {
      console.error("Failed to get schedule:", error)
      return c.json(
        { error: "Failed to retrieve schedule" },
        500,
      )
    }
  })

  // PUT /api/schedules/:id - Update schedule
  app.put("/schedules/:id", async (c) => {
    try {
      const id = c.req.param("id")
      const body = await c.req.json()

      const input: Partial<ScheduleInput> = {}

      if (body.name !== undefined) input.name = body.name
      if (body.prompt !== undefined) input.prompt = body.prompt
      if (body.cronExpression !== undefined) {
        input.cronExpression = body.cronExpression
      }
      if (body.enabled !== undefined) input.enabled = body.enabled
      if (body.contextId !== undefined) input.contextId = body.contextId
      if (body.backoffEnabled !== undefined) {
        input.backoffEnabled = body.backoffEnabled
      }
      if (body.backoffSchedule !== undefined) {
        input.backoffSchedule = body.backoffSchedule
      }
      if (body.hooks !== undefined) {
        input.hooks = body.hooks
      }

      const schedule = scheduleService.updateSchedule(id, input)
      return c.json(schedule)
    } catch (error) {
      console.error("Failed to update schedule:", error)
      if (
        error instanceof Error && error.message.includes("not found")
      ) {
        return c.json({ error: error.message }, 404)
      }
      return c.json(
        { error: "Failed to update schedule" },
        500,
      )
    }
  })

  // DELETE /api/schedules/:id - Delete schedule
  app.delete("/schedules/:id", (c) => {
    try {
      const id = c.req.param("id")
      const success = scheduleService.deleteSchedule(id)

      if (!success) {
        return c.json({ error: "Schedule not found" }, 404)
      }

      return c.json({ success: true })
    } catch (error) {
      console.error("Failed to delete schedule:", error)
      return c.json(
        { error: "Failed to delete schedule" },
        500,
      )
    }
  })

  // POST /api/schedules/:id/toggle - Enable/disable schedule
  app.post("/schedules/:id/toggle", async (c) => {
    try {
      const id = c.req.param("id")
      const body = await c.req.json()

      if (body.enabled === undefined) {
        return c.json({ error: "Missing required field: enabled" }, 400)
      }

      const schedule = scheduleService.toggleSchedule(id, body.enabled)
      return c.json(schedule)
    } catch (error) {
      console.error("Failed to toggle schedule:", error)
      if (
        error instanceof Error && error.message.includes("not found")
      ) {
        return c.json({ error: error.message }, 404)
      }
      return c.json(
        { error: "Failed to toggle schedule" },
        500,
      )
    }
  })

  // POST /api/schedules/:id/run-now - Trigger immediate execution
  app.post("/schedules/:id/run-now", async (c) => {
    try {
      const id = c.req.param("id")
      await scheduleService.runScheduleNow(id)
      return c.json({ success: true })
    } catch (error) {
      console.error("Failed to run schedule:", error)
      if (
        error instanceof Error && error.message.includes("not found")
      ) {
        return c.json({ error: error.message }, 404)
      }
      return c.json(
        { error: "Failed to run schedule" },
        500,
      )
    }
  })

  return app
}
