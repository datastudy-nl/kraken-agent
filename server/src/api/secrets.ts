import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { listSecrets, createSecret, updateSecret, deleteSecret } from "../services/secrets.js";

export const secretsRouter = new Hono();

// GET /v1/secrets — list all (never returns values)
secretsRouter.get("/", async (c) => {
  const result = await listSecrets();
  return c.json({ secrets: result });
});

// POST /v1/secrets — create
const createSchema = z.object({
  name: z.string().min(1).max(256),
  value: z.string().min(1),
  description: z.string().max(1000).optional(),
  allowed_tools: z.array(z.string()).optional(),
});

secretsRouter.post("/", zValidator("json", createSchema), async (c) => {
  const body = c.req.valid("json");
  const result = await createSecret({
    name: body.name,
    value: body.value,
    description: body.description,
    allowedTools: body.allowed_tools,
  });
  return c.json(result, 201);
});

// PATCH /v1/secrets/:id — update
const updateSchema = z.object({
  value: z.string().min(1).optional(),
  description: z.string().max(1000).optional(),
  allowed_tools: z.array(z.string()).optional(),
});

secretsRouter.patch("/:id", zValidator("json", updateSchema), async (c) => {
  const id = c.req.param("id");
  const body = c.req.valid("json");
  try {
    const result = await updateSecret(id, {
      value: body.value,
      description: body.description,
      allowedTools: body.allowed_tools,
    });
    return c.json(result);
  } catch {
    return c.json({ error: "Secret not found" }, 404);
  }
});

// DELETE /v1/secrets/:id
secretsRouter.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const deleted = await deleteSecret(id);
  if (!deleted) return c.json({ error: "Secret not found" }, 404);
  return c.json({ deleted: true });
});
