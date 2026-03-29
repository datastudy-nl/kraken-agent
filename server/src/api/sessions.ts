import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import {
  createSession,
  deleteSession,
  getSession,
  getSessionByKey,
  getSessionMessages,
  listSessions,
  updateSessionPersonality,
} from "../services/memory.js";
import { compactHistory } from "../services/compaction.js";

export const sessionsRouter = new Hono();

// --- Schemas ---
const createSessionSchema = z.object({
  metadata: z.record(z.unknown()).optional(),
  session_key: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
});

// --- GET /v1/sessions ---
sessionsRouter.get("/", async (c) => {
  const limit = parseInt(c.req.query("limit") ?? "20", 10);
  const offset = parseInt(c.req.query("offset") ?? "0", 10);
  return c.json(await listSessions(limit, offset));
});

// --- POST /v1/sessions ---
sessionsRouter.post("/", zValidator("json", createSessionSchema), async (c) => {
  const body = c.req.valid("json");
  return c.json(
    await createSession({
      metadata: body.metadata,
      sessionKey: body.session_key,
      name: body.name,
    }),
    201,
  );
});

sessionsRouter.get("/by-key/:sessionKey", async (c) => {
  const sessionKey = String(c.req.param("sessionKey"));
  const session = await getSessionByKey(sessionKey);
  if (!session) return c.json({ error: "Session not found" }, 404);
  return c.json(session);
});

// --- GET /v1/sessions/:id ---
sessionsRouter.get("/:id", async (c) => {
  const id = String(c.req.param("id"));
  const session = await getSession(id);
  if (!session) return c.json({ error: "Session not found" }, 404);
  return c.json(session);
});

// --- DELETE /v1/sessions/:id ---
sessionsRouter.delete("/:id", async (c) => {
  const id = String(c.req.param("id"));
  const deleted = await deleteSession(id);
  return c.json({ deleted, id });
});

// --- GET /v1/sessions/:id/messages ---
sessionsRouter.get("/:id/messages", async (c) => {
  const id = String(c.req.param("id"));
  const limit = parseInt(c.req.query("limit") ?? "50", 10);
  const offset = parseInt(c.req.query("offset") ?? "0", 10);
  return c.json(await getSessionMessages(id, limit, offset));
});

// --- Schemas ---
const updatePersonalitySchema = z.object({
  personality: z.string().min(1),
});

// --- PUT /v1/sessions/:id/personality ---
sessionsRouter.put(
  "/:id/personality",
  zValidator("json", updatePersonalitySchema),
  async (c) => {
    const id = String(c.req.param("id"));
    const body = c.req.valid("json");
    const session = await updateSessionPersonality(id, body.personality);
    if (!session) return c.json({ error: "Session not found" }, 404);
    return c.json(session);
  },
);

// --- POST /v1/sessions/:id/compact ---
sessionsRouter.post("/:id/compact", async (c) => {
  const id = String(c.req.param("id"));
  const session = await getSession(id);
  if (!session) return c.json({ error: "Session not found" }, 404);

  const result = await getSessionMessages(id, 200, 0);
  const history = result.messages.map((m: { role: string; content: string }) => ({
    role: m.role,
    content: m.content,
  }));

  const compacted = await compactHistory(id, history);
  return c.json({
    session_id: id,
    original_count: history.length,
    compacted_count: compacted.length,
    summary: compacted[0]?.content ?? null,
  });
});
