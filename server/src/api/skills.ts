import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import {
  createSkill,
  deleteSkill,
  getSkill,
  listSkills,
  updateSkill,
} from "../services/skills.js";

export const skillsRouter = new Hono();

// --- Schemas ---
const createSkillSchema = z.object({
  name: z.string().min(1),
  content: z.string().min(1),
  tags: z.array(z.string()).optional(),
});

const updateSkillSchema = z.object({
  content: z.string().min(1).optional(),
  tags: z.array(z.string()).optional(),
});

// --- GET /v1/skills ---
skillsRouter.get("/", async (c) => {
  const tag = c.req.query("tag");
  const search = c.req.query("search");
  return c.json(await listSkills({ tag, search }));
});

// --- POST /v1/skills ---
skillsRouter.post("/", zValidator("json", createSkillSchema), async (c) => {
  const body = c.req.valid("json");
  return c.json(await createSkill(body), 201);
});

// --- GET /v1/skills/:id ---
skillsRouter.get("/:id", async (c) => {
  const id = String(c.req.param("id"));
  const skill = await getSkill(id);
  if (!skill) return c.json({ error: "Skill not found" }, 404);
  return c.json(skill);
});

// --- PATCH /v1/skills/:id ---
skillsRouter.patch(
  "/:id",
  zValidator("json", updateSkillSchema),
  async (c) => {
    const id = String(c.req.param("id"));
    const body = c.req.valid("json");
    const skill = await updateSkill(id, body);
    if (!skill) return c.json({ error: "Skill not found" }, 404);
    return c.json(skill);
  },
);

// --- DELETE /v1/skills/:id ---
skillsRouter.delete("/:id", async (c) => {
  const id = String(c.req.param("id"));
  const deleted = await deleteSkill(id);
  return c.json({ deleted, id });
});
