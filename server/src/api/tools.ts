import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import {
  createTool,
  deleteTool,
  getTool,
  listTools,
  updateTool,
} from "../services/tools.js";

export const toolsRouter = new Hono();

const createToolSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  instructions: z.string().min(1),
  input_schema: z.record(z.unknown()).optional(),
  tags: z.array(z.string()).optional(),
});

const updateToolSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  instructions: z.string().min(1).optional(),
  input_schema: z.record(z.unknown()).optional(),
  tags: z.array(z.string()).optional(),
});

toolsRouter.get("/", async (c) => {
  const tag = c.req.query("tag");
  const search = c.req.query("search");
  const limit = parseInt(c.req.query("limit") ?? "100", 10);
  return c.json(await listTools({ tag, search, limit }));
});

toolsRouter.post("/", zValidator("json", createToolSchema), async (c) => {
  const body = c.req.valid("json");
  return c.json(
    await createTool({
      name: body.name,
      description: body.description,
      instructions: body.instructions,
      inputSchema: body.input_schema,
      tags: body.tags,
    }),
    201,
  );
});

toolsRouter.get("/:id", async (c) => {
  const id = String(c.req.param("id"));
  const tool = await getTool(id);
  if (!tool) return c.json({ error: "Tool not found" }, 404);
  return c.json(tool);
});

toolsRouter.patch("/:id", zValidator("json", updateToolSchema), async (c) => {
  const id = String(c.req.param("id"));
  const body = c.req.valid("json");
  const tool = await updateTool(id, {
    name: body.name,
    description: body.description,
    instructions: body.instructions,
    inputSchema: body.input_schema,
    tags: body.tags,
  });
  if (!tool) return c.json({ error: "Tool not found" }, 404);
  return c.json(tool);
});

toolsRouter.delete("/:id", async (c) => {
  const id = String(c.req.param("id"));
  const deleted = await deleteTool(id);
  return c.json({ deleted, id });
});
