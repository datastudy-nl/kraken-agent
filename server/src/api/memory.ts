import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import {
  addEntity,
  addRelationship,
  getCommunities,
  getGraph,
  queryMemory,
  removeEntity,
} from "../services/memory.js";
import { listEntities } from "../services/graph.js";

export const memoryRouter = new Hono();

// --- Schemas ---
const querySchema = z.object({
  query: z.string().min(1),
  mode: z.enum(["auto", "local", "global", "drift", "basic"]).default("auto"),
  limit: z.number().int().positive().default(10),
  time_range: z
    .object({
      start: z.string().datetime().optional(),
      end: z.string().datetime().optional(),
    })
    .optional(),
  entity_filter: z.array(z.string()).optional(),
});

const entitySchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  properties: z.record(z.unknown()).optional(),
});

const relationshipSchema = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
  type: z.string().min(1),
  properties: z.record(z.unknown()).optional(),
});

// --- POST /v1/memory/query ---
memoryRouter.post("/query", zValidator("json", querySchema), async (c) => {
  const body = c.req.valid("json");
  return c.json(
    await queryMemory({
      query: body.query,
      mode: body.mode,
      limit: body.limit,
      entityFilter: body.entity_filter,
    }),
  );
});

// --- GET /v1/memory/entities ---
memoryRouter.get("/entities", async (c) => {
  const type = c.req.query("type");
  const search = c.req.query("search");
  const limit = parseInt(c.req.query("limit") ?? "50", 10);
  const result = await listEntities({ type, search, limit });
  return c.json({
    entities: result.entities.map((entity) => ({
      id: entity.id,
      name: entity.name,
      type: entity.type,
      properties: entity.properties,
      created_at: entity.createdAt,
    })),
    total: result.total,
    limit,
  });
});

// --- POST /v1/memory/entities ---
memoryRouter.post("/entities", zValidator("json", entitySchema), async (c) => {
  const body = c.req.valid("json");
  return c.json(await addEntity(body), 201);
});

// --- DELETE /v1/memory/entities/:id ---
memoryRouter.delete("/entities/:id", async (c) => {
  const id = String(c.req.param("id"));
  return c.json(await removeEntity(id));
});

// --- POST /v1/memory/relationships ---
memoryRouter.post(
  "/relationships",
  zValidator("json", relationshipSchema),
  async (c) => {
    const body = c.req.valid("json");
    return c.json(await addRelationship(body), 201);
  },
);

// --- GET /v1/memory/communities ---
memoryRouter.get("/communities", async (c) => {
  const level = parseInt(c.req.query("level") ?? "0", 10);
  return c.json(await getCommunities(level));
});

// --- GET /v1/memory/graph ---
memoryRouter.get("/graph", async (c) => {
  const depth = parseInt(c.req.query("depth") ?? "2", 10);
  const center = c.req.query("center");
  return c.json(await getGraph(center, depth));
});
