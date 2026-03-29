import { Hono } from "hono";
import { streamText as honoStreamText } from "hono/streaming";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { streamText as aiStreamText } from "ai";
import { buildSystemPrompt } from "../services/context.js";
import {
  resolveSession,
  storeMessage,
} from "../services/memory.js";
import { runChat, resolveModel } from "../services/llm.js";
import { queuePostConversation } from "../services/queue.js";
import { getBuiltinTools } from "../services/builtinTools.js";
import { shouldCompact, preCompactionFlush, compactHistory } from "../services/compaction.js";
import { config } from "../config.js";

export const chatRouter = new Hono();

// --- Schemas ---
const chatRequestSchema = z.object({
  message: z.string().min(1),
  session_id: z.string().optional(),
  session_key: z.string().min(1).optional(),
  session_name: z.string().min(1).optional(),
  model: z.string().optional(),
  stream: z.boolean().optional().default(false),
  personality: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

// --- POST /v1/chat ---
chatRouter.post("/", zValidator("json", chatRequestSchema), async (c) => {
  const body = c.req.valid("json");

  const session = await resolveSession({
    sessionId: body.session_id,
    sessionKey: body.session_key,
    sessionName: body.session_name,
    metadata: body.metadata,
  });
  const sessionId = session.id;
  const history: Array<{ role: string; content: string }> =
    "messages" in session && Array.isArray(session.messages)
      ? session.messages.map((message) => ({
          role: message.role,
          content: message.content,
        }))
      : [];

  // Limit conversation history to prevent context overflow
  const maxHistory = config.KRAKEN_MAX_HISTORY_MESSAGES;
  const trimmedHistory = history.slice(-maxHistory);

  await storeMessage({
    sessionId,
    role: "user",
    content: body.message,
    metadata: body.metadata,
  });

  const sessionPersonality =
    "personality" in session ? (session as { personality?: string }).personality : undefined;

  const system = await buildSystemPrompt({
    message: body.message,
    sessionHistory: trimmedHistory.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    personality: sessionPersonality ?? body.personality,
  });

  let llmMessages: Array<{ role: "user" | "assistant" | "system"; content: string }> = [
    ...trimmedHistory.map((m) => ({
      role: (m.role === "system" ? "system" : m.role === "assistant" ? "assistant" : "user") as
        | "user"
        | "assistant"
        | "system",
      content: m.content,
    })),
    { role: "user" as const, content: body.message },
  ];

  // Context compaction — prevent context window overflow
  const systemTokenEstimate = Math.ceil(system.length / 4);
  if (shouldCompact(llmMessages, systemTokenEstimate)) {
    await preCompactionFlush(sessionId, llmMessages);
    llmMessages = (await compactHistory(sessionId, llmMessages)) as typeof llmMessages;
  }

  const tools = getBuiltinTools(sessionId);

  if (body.stream) {
    return honoStreamText(c, async (stream) => {
      const result = await runChat({
        system,
        messages: llmMessages,
        model: body.model ?? config.KRAKEN_DEFAULT_MODEL,
        tools,
      });

      const toolCallCount = result.toolCalls?.length ?? 0;
      const hasErrors = result.text?.toLowerCase().includes("error") && toolCallCount > 0;

      await storeMessage({
        sessionId,
        role: "assistant",
        content: result.text,
        model: body.model ?? config.KRAKEN_DEFAULT_MODEL,
        tokenCount: (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0),
      });

      await queuePostConversation(
        sessionId,
        [
          { role: "user", content: body.message },
          { role: "assistant", content: result.text },
        ],
        toolCallCount,
        hasErrors,
      );

      await stream.write(result.text);
    });
  }

  const result = await runChat({
    system,
    messages: llmMessages,
    model: body.model ?? config.KRAKEN_DEFAULT_MODEL,
    tools,
  });

  const toolCallCount = result.toolCalls?.length ?? 0;
  const hasErrors = result.text?.toLowerCase().includes("error") && toolCallCount > 0;

  await storeMessage({
    sessionId,
    role: "assistant",
    content: result.text,
    model: body.model ?? config.KRAKEN_DEFAULT_MODEL,
    tokenCount: (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0),
  });

  await queuePostConversation(
    sessionId,
    [
      { role: "user", content: body.message },
      { role: "assistant", content: result.text },
    ],
    toolCallCount,
    hasErrors,
  );

  return c.json({
    id: crypto.randomUUID(),
    session_id: sessionId,
    session_key: "session_key" in session ? session.session_key : null,
    role: "assistant",
    content: result.text,
    model: body.model ?? config.KRAKEN_DEFAULT_MODEL,
    tool_calls: (result.toolCalls ?? []).map((tc) => ({
      name: tc.toolName,
      arguments: tc.args ?? {},
    })),
    usage: {
      prompt_tokens: result.usage?.inputTokens ?? 0,
      completion_tokens: result.usage?.outputTokens ?? 0,
    },
    created_at: new Date().toISOString(),
  });
});

// --- OpenAI-compatible schemas ---
const openaiMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string(),
  name: z.string().optional(),
});

const openaiCompletionSchema = z.object({
  model: z.string().optional(),
  messages: z.array(openaiMessageSchema).min(1),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  max_tokens: z.number().int().positive().optional(),
  stream: z.boolean().optional().default(false),
  stop: z.union([z.string(), z.array(z.string())]).optional(),
  user: z.string().optional(),
  // Kraken extensions (optional)
  session_key: z.string().optional(),
});

// --- POST /v1/chat/completions  (OpenAI-compatible) ---
chatRouter.post(
  "/completions",
  zValidator("json", openaiCompletionSchema),
  async (c) => {
    const body = c.req.valid("json");
    const modelName = body.model ?? config.KRAKEN_DEFAULT_MODEL;
    const completionId = `chatcmpl-${crypto.randomUUID()}`;
    const created = Math.floor(Date.now() / 1000);

    // Resolve session if session_key provided, otherwise create a fresh transient one.
    // IMPORTANT: do NOT fall back to a shared key — that leaks memory across users.
    const session = body.session_key
      ? await resolveSession({ sessionKey: body.session_key })
      : await resolveSession({});
    const sessionId = session.id;

    // Separate system messages from conversation
    const systemContent = body.messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");

    const conversationMessages = body.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    // Build system prompt with Kraken context (memory, identity, skills)
    const lastUserMessage =
      [...body.messages].reverse().find((m) => m.role === "user")?.content ?? "";

    // Store the user message so it becomes part of episodic memory
    // (searchable across sessions via FTS/vector). OpenAI-compatible clients
    // re-send the full history each request, so we only persist the latest
    // user message to avoid duplicates.
    if (lastUserMessage) {
      await storeMessage({
        sessionId,
        role: "user",
        content: lastUserMessage,
      });
    }

    const krakenSystem = await buildSystemPrompt({
      message: lastUserMessage,
      sessionHistory: conversationMessages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    // Merge client system prompt with Kraken system prompt
    const fullSystem = systemContent
      ? `${krakenSystem}\n\n---\nAdditional instructions from client:\n${systemContent}`
      : krakenSystem;

    // Context compaction for completions endpoint
    const systemTokenEstimate = Math.ceil(fullSystem.length / 4);
    let compactedMessages = conversationMessages as Array<{ role: string; content: string }>;
    if (shouldCompact(compactedMessages, systemTokenEstimate)) {
      await preCompactionFlush(sessionId, compactedMessages);
      compactedMessages = await compactHistory(sessionId, compactedMessages);
    }
    const finalMessages = compactedMessages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    const tools = getBuiltinTools(sessionId);

    // --- Streaming path ---
    if (body.stream) {
      return honoStreamText(c, async (stream) => {
        c.header("Content-Type", "text/event-stream");
        c.header("Cache-Control", "no-cache");
        c.header("Connection", "keep-alive");

        const result = aiStreamText({
          model: resolveModel(modelName),
          system: fullSystem,
          messages: finalMessages,
          tools,
          maxSteps: tools ? 16 : undefined,
          temperature: body.temperature,
          topP: body.top_p,
          maxTokens: body.max_tokens,
        });

        let collectedText = "";

        for await (const chunk of result.textStream) {
          collectedText += chunk;
          const sseData = JSON.stringify({
            id: completionId,
            object: "chat.completion.chunk",
            created,
            model: modelName,
            choices: [
              {
                index: 0,
                delta: { content: chunk },
                finish_reason: null,
              },
            ],
          });
          await stream.write(`data: ${sseData}\n\n`);
        }

        // Final chunk
        const finalData = JSON.stringify({
          id: completionId,
          object: "chat.completion.chunk",
          created,
          model: modelName,
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: "stop",
            },
          ],
        });
        await stream.write(`data: ${finalData}\n\n`);
        await stream.write("data: [DONE]\n\n");

        // Store assistant response after stream completes
        const usage = await result.usage;
        await storeMessage({
          sessionId,
          role: "assistant",
          content: collectedText,
          model: modelName,
          tokenCount:
            (usage?.promptTokens ?? 0) + (usage?.completionTokens ?? 0),
        });

        if (lastUserMessage) {
          await queuePostConversation(
            sessionId,
            [
              { role: "user", content: lastUserMessage },
              { role: "assistant", content: collectedText },
            ],
          );
        }
      });
    }

    // --- Non-streaming path ---
    const result = await runChat({
      system: fullSystem,
      messages: finalMessages,
      model: modelName,
      tools,
    });

    const toolCallCount = result.toolCalls?.length ?? 0;
    const hasErrors = result.text?.toLowerCase().includes("error") && toolCallCount > 0;

    // Store assistant response
    await storeMessage({
      sessionId,
      role: "assistant",
      content: result.text,
      model: modelName,
      tokenCount: (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0),
    });

    if (lastUserMessage) {
      await queuePostConversation(
        sessionId,
        [
          { role: "user", content: lastUserMessage },
          { role: "assistant", content: result.text },
        ],
        toolCallCount,
        hasErrors,
      );
    }

    return c.json({
      id: completionId,
      object: "chat.completion",
      created,
      model: modelName,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: result.text,
          },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: result.usage?.inputTokens ?? 0,
        completion_tokens: result.usage?.outputTokens ?? 0,
        total_tokens: (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0),
      },
    });
  },
);
