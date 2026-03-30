import { Hono } from "hono";
import {
  listFilesInSandbox,
  readFileFromSandbox,
  readBinaryFromSandbox,
  writeFileInSandbox,
  writeBinaryInSandbox,
} from "../services/sandbox.js";

export const workspacesRouter = new Hono();

// --- GET /v1/sessions/:id/workspace --- List files
workspacesRouter.get("/:id/workspace", async (c) => {
  const sessionId = String(c.req.param("id"));
  const dir = c.req.query("dir") ?? "";

  try {
    const files = await listFilesInSandbox(sessionId, dir || undefined);
    return c.json({ session_id: sessionId, directory: dir || ".", files });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// --- GET /v1/sessions/:id/workspace/* --- Read a file
workspacesRouter.get("/:id/workspace/*", async (c) => {
  const sessionId = String(c.req.param("id"));
  // Extract file path from the wildcard portion of the URL
  const url = new URL(c.req.url);
  const prefix = `/${sessionId}/workspace/`;
  const idx = url.pathname.indexOf(prefix);
  const filePath = idx >= 0 ? decodeURIComponent(url.pathname.slice(idx + prefix.length)) : "";

  if (!filePath) {
    return c.json({ error: "File path required" }, 400);
  }

  const encoding = c.req.query("encoding");

  try {
    if (encoding === "base64") {
      const result = await readBinaryFromSandbox(sessionId, filePath);
      return c.json({
        session_id: sessionId,
        path: filePath,
        content: result.base64,
        encoding: "base64",
        size: result.size,
      });
    }

    const content = await readFileFromSandbox(sessionId, filePath);
    return c.json({
      session_id: sessionId,
      path: filePath,
      content,
      size: content.length,
    });
  } catch (err: any) {
    if (err.code === "ENOENT") {
      return c.json({ error: "File not found" }, 404);
    }
    return c.json({ error: err.message }, 500);
  }
});

// --- PUT /v1/sessions/:id/workspace/* --- Write a file
workspacesRouter.put("/:id/workspace/*", async (c) => {
  const sessionId = String(c.req.param("id"));
  const url = new URL(c.req.url);
  const prefix = `/${sessionId}/workspace/`;
  const idx = url.pathname.indexOf(prefix);
  const filePath = idx >= 0 ? decodeURIComponent(url.pathname.slice(idx + prefix.length)) : "";

  if (!filePath) {
    return c.json({ error: "File path required" }, 400);
  }

  try {
    const body = await c.req.json<{ content: string; encoding?: string }>();

    if (typeof body.content !== "string") {
      return c.json({ error: "Missing 'content' field" }, 400);
    }

    if (body.encoding === "base64") {
      const buf = Buffer.from(body.content, "base64");
      await writeBinaryInSandbox(sessionId, filePath, buf);
      return c.json({
        session_id: sessionId,
        path: filePath,
        size: buf.length,
      });
    }

    await writeFileInSandbox(sessionId, filePath, body.content);

    return c.json({
      session_id: sessionId,
      path: filePath,
      size: body.content.length,
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});
