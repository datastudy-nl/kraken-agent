import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import {
  createSchedule,
  deleteSchedule,
  getSchedule,
  listSchedules,
  updateSchedule,
} from "../services/schedules.js";

export const schedulesRouter = new Hono();

// --- Schemas ---
const createScheduleSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  cron_expression: z.string().min(1),
  task_prompt: z.string().min(1),
  origin_session_id: z.string().optional(),
  max_runs: z.number().int().positive().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const updateScheduleSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  cron_expression: z.string().min(1).optional(),
  task_prompt: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  max_runs: z.number().int().positive().nullable().optional(),
});

// --- GET /v1/schedules ---
schedulesRouter.get("/", async (c) => {
  const limit = parseInt(c.req.query("limit") ?? "20", 10);
  const offset = parseInt(c.req.query("offset") ?? "0", 10);
  return c.json(await listSchedules(limit, offset));
});

// --- POST /v1/schedules ---
schedulesRouter.post(
  "/",
  zValidator("json", createScheduleSchema),
  async (c) => {
    const body = c.req.valid("json");
    try {
      const schedule = await createSchedule({
        name: body.name,
        description: body.description,
        cronExpression: body.cron_expression,
        taskPrompt: body.task_prompt,
        originSessionId: body.origin_session_id,
        maxRuns: body.max_runs,
        metadata: body.metadata,
      });
      return c.json(schedule, 201);
    } catch (err: any) {
      return c.json({ error: err.message }, 400);
    }
  },
);

// --- GET /v1/schedules/:id ---
schedulesRouter.get("/:id", async (c) => {
  const id = String(c.req.param("id"));
  const schedule = await getSchedule(id);
  if (!schedule) return c.json({ error: "Schedule not found" }, 404);
  return c.json(schedule);
});

// --- PATCH /v1/schedules/:id ---
schedulesRouter.patch(
  "/:id",
  zValidator("json", updateScheduleSchema),
  async (c) => {
    const id = String(c.req.param("id"));
    const body = c.req.valid("json");
    try {
      const schedule = await updateSchedule(id, {
        name: body.name,
        description: body.description,
        cronExpression: body.cron_expression,
        taskPrompt: body.task_prompt,
        enabled: body.enabled,
        maxRuns: body.max_runs,
      });
      if (!schedule) return c.json({ error: "Schedule not found" }, 404);
      return c.json(schedule);
    } catch (err: any) {
      return c.json({ error: err.message }, 400);
    }
  },
);

// --- DELETE /v1/schedules/:id ---
schedulesRouter.delete("/:id", async (c) => {
  const id = String(c.req.param("id"));
  const deleted = await deleteSchedule(id);
  return c.json({ deleted, id });
});
