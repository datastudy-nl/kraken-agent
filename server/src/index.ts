import { serve } from "@hono/node-server";
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
import { modelsRouter } from "./api/models.js";
import { bootstrap } from "./bootstrap.js";
import { config } from "./config.js";

const app = new Hono();

// --- Middleware ---
app.use("*", logger());
app.use("*", cors());

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
app.route("/v1/sessions", workspacesRouter);

// --- Start ---
const port = config.PORT;

await bootstrap();

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Kraken API listening on http://localhost:${info.port}`);
});

export default app;
