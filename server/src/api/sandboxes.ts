import { Hono } from "hono";
import {
  listSandboxes,
  getSandboxInfo,
  addPortForward,
  removePortForward,
  getPortForwards,
  listProcesses,
} from "../services/sandbox.js";

export const sandboxesRouter = new Hono();

// --- GET /v1/sandboxes --- List all running sandboxes
sandboxesRouter.get("/", async (c) => {
  try {
    const sandboxes = await listSandboxes();
    return c.json({ sandboxes, count: sandboxes.length });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// --- GET /v1/sandboxes/:sessionId --- Get sandbox info
sandboxesRouter.get("/:sessionId", async (c) => {
  const sessionId = String(c.req.param("sessionId"));
  try {
    const info = await getSandboxInfo(sessionId);
    if (!info) {
      return c.json({ error: "Sandbox not found" }, 404);
    }
    return c.json(info);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// --- GET /v1/sandboxes/:sessionId/ports --- List port forwards
sandboxesRouter.get("/:sessionId/ports", async (c) => {
  const sessionId = String(c.req.param("sessionId"));
  const info = await getSandboxInfo(sessionId);
  if (!info) {
    return c.json({ error: "Sandbox not found" }, 404);
  }
  const ports = getPortForwards(sessionId);
  return c.json({ session_id: sessionId, ports });
});

// --- POST /v1/sandboxes/:sessionId/ports --- Add port forward
sandboxesRouter.post("/:sessionId/ports", async (c) => {
  const sessionId = String(c.req.param("sessionId"));
  const body = await c.req.json<{ containerPort: number; hostPort?: number }>();

  if (!body.containerPort || typeof body.containerPort !== "number") {
    return c.json({ error: "containerPort is required and must be a number" }, 400);
  }

  try {
    const result = await addPortForward(sessionId, body.containerPort, body.hostPort);
    return c.json(result, 201);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// --- DELETE /v1/sandboxes/:sessionId/ports/:port --- Remove port forward
sandboxesRouter.delete("/:sessionId/ports/:port", async (c) => {
  const sessionId = String(c.req.param("sessionId"));
  const containerPort = parseInt(String(c.req.param("port")), 10);

  if (isNaN(containerPort)) {
    return c.json({ error: "Invalid port number" }, 400);
  }

  try {
    const removed = await removePortForward(sessionId, containerPort);
    if (!removed) {
      return c.json({ error: "Port forward not found" }, 404);
    }
    return c.json({ status: "removed", containerPort });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// --- GET /v1/sandboxes/:sessionId/processes --- List processes
sandboxesRouter.get("/:sessionId/processes", async (c) => {
  const sessionId = String(c.req.param("sessionId"));
  const info = await getSandboxInfo(sessionId);
  if (!info) {
    return c.json({ error: "Sandbox not found" }, 404);
  }
  try {
    const output = await listProcesses(sessionId);
    return c.json({ session_id: sessionId, processes: output });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});
