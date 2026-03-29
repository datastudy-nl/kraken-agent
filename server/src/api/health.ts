import { Hono } from "hono";
import { db } from "../db/index.js";
import { sql } from "drizzle-orm";
import { redis } from "../services/queue.js";
import { getDriver } from "../services/graph.js";

export const healthRouter = new Hono();

healthRouter.get("/", (c) => {
  return c.json({
    status: "ok",
    version: "0.1.0",
    uptime: process.uptime(),
  });
});

healthRouter.get("/ready", async (c) => {
  try {
    await db.execute(sql`select 1`);
    await redis.ping();
    await getDriver().verifyConnectivity();

    return c.json({
      status: "ready",
      postgres: true,
      redis: true,
      neo4j: true,
    });
  } catch (error) {
    return c.json(
      {
        status: "not-ready",
        error: error instanceof Error ? error.message : "unknown error",
      },
      503,
    );
  }
});
