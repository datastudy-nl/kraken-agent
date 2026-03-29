import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import {
  getSoul,
  getUserModel,
  setSoul,
  getAgentsMd,
  setAgentsMd,
  linkIdentity,
  listIdentityLinks,
} from "../services/identity.js";
import { config } from "../config.js";

export const identityRouter = new Hono();

// --- Schemas ---
const updateSoulSchema = z.object({
  content: z.string().min(1).max(config.KRAKEN_MAX_SOUL_CHARS),
});

const updateAgentsMdSchema = z.object({
  content: z.string().min(1).max(4000),
});

const linkIdentitySchema = z.object({
  canonical_user_id: z.string().min(1),
  provider: z.string().min(1),
  provider_user_id: z.string().min(1),
  display_name: z.string().optional(),
});

// --- GET /v1/identity/soul ---
identityRouter.get("/soul", async (c) => {
  const soul = await getSoul();
  return c.json({ content: soul.content, updated_at: soul.updatedAt });
});

// --- PUT /v1/identity/soul ---
identityRouter.put(
  "/soul",
  zValidator("json", updateSoulSchema),
  async (c) => {
    const body = c.req.valid("json");
    const soul = await setSoul(body.content);
    return c.json({ content: soul.content, updated_at: soul.updatedAt });
  },
);

// --- GET /v1/identity/user-model ---
identityRouter.get("/user-model", async (c) => {
  const userModel = await getUserModel();
  return c.json({ content: userModel.content, updated_at: userModel.updatedAt });
});

// --- GET /v1/identity/agents-md ---
identityRouter.get("/agents-md", async (c) => {
  const agentsMd = await getAgentsMd();
  return c.json({ content: agentsMd.content, updated_at: agentsMd.updatedAt });
});

// --- PUT /v1/identity/agents-md ---
identityRouter.put(
  "/agents-md",
  zValidator("json", updateAgentsMdSchema),
  async (c) => {
    const body = c.req.valid("json");
    const agentsMd = await setAgentsMd(body.content);
    return c.json({ content: agentsMd.content, updated_at: agentsMd.updatedAt });
  },
);

// --- POST /v1/identity/links ---
identityRouter.post(
  "/links",
  zValidator("json", linkIdentitySchema),
  async (c) => {
    const body = c.req.valid("json");
    const link = await linkIdentity({
      canonicalUserId: body.canonical_user_id,
      provider: body.provider,
      providerUserId: body.provider_user_id,
      displayName: body.display_name,
    });
    return c.json(
      {
        id: link.id,
        canonical_user_id: link.canonicalUserId,
        provider: link.provider,
        provider_user_id: link.providerUserId,
        display_name: link.displayName,
      },
      201,
    );
  },
);

// --- GET /v1/identity/links ---
identityRouter.get("/links", async (c) => {
  const canonicalUserId = c.req.query("canonical_user_id");
  const links = await listIdentityLinks(canonicalUserId);
  return c.json({ links });
});
