import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { transcribe, synthesize, type VoiceId, type AudioFormat } from "../services/voice.js";

export const voiceRouter = new Hono();

// --- POST /v1/voice/transcribe ---
voiceRouter.post("/transcribe", async (c) => {
  const body = await c.req.parseBody();
  const file = body["file"];

  if (!file || !(file instanceof File)) {
    return c.json({ error: "Missing 'file' field (multipart audio upload)" }, 400);
  }

  const maxSize = 25 * 1024 * 1024; // 25 MB (OpenAI Whisper limit)
  if (file.size > maxSize) {
    return c.json({ error: "Audio file exceeds 25 MB limit" }, 413);
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const result = await transcribe(buffer, file.name || "audio.webm");
  return c.json(result);
});

// --- POST /v1/voice/synthesize ---
const synthesizeSchema = z.object({
  text: z.string().min(1).max(4096),
  voice: z
    .enum(["alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer"])
    .optional()
    .default("nova"),
  speed: z.number().min(0.25).max(4.0).optional().default(1.0),
  response_format: z
    .enum(["mp3", "opus", "aac", "flac", "wav", "pcm"])
    .optional()
    .default("opus"),
});

voiceRouter.post("/synthesize", zValidator("json", synthesizeSchema), async (c) => {
  const body = c.req.valid("json");

  const audioBuffer = await synthesize(body.text, {
    voice: body.voice as VoiceId,
    speed: body.speed,
    response_format: body.response_format as AudioFormat,
  });

  const mimeTypes: Record<string, string> = {
    mp3: "audio/mpeg",
    opus: "audio/opus",
    aac: "audio/aac",
    flac: "audio/flac",
    wav: "audio/wav",
    pcm: "audio/L16",
  };

  c.header("Content-Type", mimeTypes[body.response_format] ?? "audio/opus");
  c.header("Content-Length", audioBuffer.length.toString());
  return c.body(new Uint8Array(audioBuffer));
});
