import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { bearerAuth } from "hono/bearer-auth";

import { chatRouter } from "./api/chat.js";
import { sessionsRouter } from "./api/sessions.js";
import { memoryRouter } from "./api/memory.js";
import { skillsRouter } from "./api/skills.js";
import { toolsRouter } from "./api/tools.js";
import { identityRouter } from "./api/identity.js";
import { healthRouter } from "./api/health.js";
import { schedulesRouter } from "./api/schedules.js";
import { workspacesRouter } from "./api/workspaces.js";
import { sandboxesRouter } from "./api/sandboxes.js";
import { modelsRouter } from "./api/models.js";
import { secretsRouter } from "./api/secrets.js";
import { voiceRouter } from "./api/voice.js";
import { bootstrap } from "./bootstrap.js";
import { config } from "./config.js";

const app = new Hono();

function getAllowedOrigins(): string[] {
  return config.KRAKEN_ALLOWED_ORIGINS
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const allowedOrigins = getAllowedOrigins();
const allowAllOrigins = config.NODE_ENV !== "production" && allowedOrigins.length === 0;

// --- Middleware ---
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: (origin) => {
      // Non-browser requests (no Origin header)
      if (!origin) return origin;

      // Development/test convenience only; production defaults closed.
      if (allowAllOrigins) return origin;

      return allowedOrigins.includes(origin) ? origin : "";
    },
  }),
);

// --- Routes ---
app.route("/health", healthRouter);
app.route("/v1/models", modelsRouter);

// Auth: require for all /v1/* except models
const apiKey = process.env.KRAKEN_API_KEY;
if (apiKey) {
  app.use("/v1/*", bearerAuth({ token: apiKey }));
}

app.route("/v1/chat", chatRouter);
app.route("/v1/sessions", sessionsRouter);
app.route("/v1/memory", memoryRouter);
app.route("/v1/skills", skillsRouter);
app.route("/v1/tools", toolsRouter);
app.route("/v1/identity", identityRouter);
app.route("/v1/schedules", schedulesRouter);
app.route("/v1/sandboxes", sandboxesRouter);
app.route("/v1/secrets", secretsRouter);
app.route("/v1/voice", voiceRouter);
// Workspace endpoints (/:id/workspace/*) are mounted under the same /v1/sessions
// prefix because they are session-scoped operations, but live in a separate router
// for code organization. See api/workspaces.ts.
app.route("/v1/sessions", workspacesRouter);

// --- Static frontend (served from ./public) ---
app.use("/assets/*", serveStatic({ root: "./public" }));
app.get("/favicon.ico", serveStatic({ root: "./public", path: "/favicon.ico" }));

// SPA fallback: serve index.html for non-API routes
app.get("*", async (c, next) => {
  // Don't serve SPA fallback for API routes
  if (c.req.path.startsWith("/v1/") || c.req.path === "/health") {
    return next();
  }
  return serveStatic({ root: "./public", path: "/index.html" })(c, next);
});

// --- Start ---
const port = config.PORT;

await bootstrap();

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Kraken API listening on http://localhost:${info.port}`);
});

export default app;
