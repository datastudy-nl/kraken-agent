/**
 * Context compaction service — prevents context window overflow.
 *
 * When conversation history exceeds a token threshold:
 * 1. Pre-flush: silent agentic turn that persists important context to memory
 * 2. Compaction: summarizes old messages, keeps recent ones verbatim
 *
 * The summary is stored as a special message so future loads start from it.
 */
import { config } from "../config.js";
import { runChat } from "./llm.js";
import { getBuiltinTools } from "./builtinTools.js";
import { storeMessage } from "./memory.js";

/** Rough token estimation: ~4 chars per token. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function estimateHistoryTokens(
  messages: Array<{ role: string; content: string }>,
): number {
  return messages.reduce(
    (sum, m) => sum + estimateTokens(m.content) + 4, // 4 tokens overhead per message
    0,
  );
}

// ---------------------------------------------------------------------------
// Should compact?
// ---------------------------------------------------------------------------

export function shouldCompact(
  messages: Array<{ role: string; content: string }>,
  systemPromptTokens: number,
): boolean {
  const historyTokens = estimateHistoryTokens(messages);
  return historyTokens + systemPromptTokens > config.KRAKEN_COMPACTION_THRESHOLD_TOKENS;
}

// ---------------------------------------------------------------------------
// Pre-compaction flush — silent agentic turn
// ---------------------------------------------------------------------------

/**
 * Run a silent LLM turn that asks the agent to persist important context
 * before old messages are summarized away. Uses only memory/skill tools
 * (no side effects like shell_exec or browser). The exchange is stored
 * with metadata.type = "flush" so it can be filtered from user-facing queries.
 */
export async function preCompactionFlush(
  sessionId: string,
  messages: Array<{ role: string; content: string }>,
): Promise<void> {
  if (!config.KRAKEN_PRE_FLUSH_ENABLED) return;

  const allTools = getBuiltinTools(sessionId);

  // Only expose memory/skill tools — no side-effectful tools
  const safeTools: Record<string, (typeof allTools)[keyof typeof allTools]> = {
    create_skill: allTools.create_skill,
    create_tool: allTools.create_tool,
    search_skills: allTools.search_skills,
    search_tools: allTools.search_tools,
  };

  const flushSystem = `You are about to lose older conversation context due to compaction.
Review the conversation and write any important facts, decisions, task state,
user preferences, or learned procedures to memory using the available tools.
Focus on information that would be LOST if old messages were summarized.
Do NOT reply to the user — just persist important information silently.
If there is nothing important to persist, do nothing.`;

  const flushMessages: Array<{ role: "user" | "assistant" | "system"; content: string }> = [
    ...messages.slice(-20).map((m) => ({
      role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
      content: m.content,
    })),
    {
      role: "user" as const,
      content: "[SYSTEM] Context compaction is imminent. Persist any important information now.",
    },
  ];

  try {
    const result = await runChat({
      system: flushSystem,
      messages: flushMessages,
      tools: safeTools,
      maxSteps: 8,
    });

    // Store the flush exchange with metadata so it's filterable
    if (result.text) {
      await storeMessage({
        sessionId,
        role: "system",
        content: `[Pre-compaction flush] ${result.text}`,
        metadata: { type: "flush" },
      });
    }
  } catch (err) {
    // Non-fatal — compaction proceeds even if flush fails
    console.error("[compaction] Pre-flush failed:", err);
  }
}

// ---------------------------------------------------------------------------
// Compact history
// ---------------------------------------------------------------------------

/**
 * Summarizes old messages and keeps recent ones verbatim.
 * Returns the compacted message array to use for the LLM call.
 */
export async function compactHistory(
  sessionId: string,
  messages: Array<{ role: string; content: string }>,
): Promise<Array<{ role: string; content: string }>> {
  const keepRecent = config.KRAKEN_COMPACTION_KEEP_RECENT;
  if (messages.length <= keepRecent) return messages;

  const oldMessages = messages.slice(0, -keepRecent);
  const recentMessages = messages.slice(-keepRecent);

  // Build a condensed representation of old messages for summarization.
  // Strip verbose tool results to reduce summarization input size.
  const condensed = oldMessages.map((m) => {
    let content = m.content;
    // Truncate very long individual messages to keep the summary input manageable
    if (content.length > 2000) {
      content = content.slice(0, 2000) + "...[truncated]";
    }
    return `${m.role.toUpperCase()}: ${content}`;
  }).join("\n\n");

  const summaryPrompt = `Summarize this conversation history into a concise summary that preserves:
- Key decisions and conclusions
- Important facts and context
- User preferences expressed
- Task progress and current state
- Any errors encountered and how they were resolved

Be concise but comprehensive. This summary replaces the original messages in the context window.

Conversation:
${condensed}`;

  try {
    const result = await runChat({
      system: "You are a conversation summarizer. Output only the summary, no preamble.",
      messages: [{ role: "user" as const, content: summaryPrompt }],
    });

    const summary = result.text.trim();

    // Store the compaction summary for future reference
    await storeMessage({
      sessionId,
      role: "system",
      content: summary,
      metadata: { type: "compaction_summary", originalMessageCount: oldMessages.length },
    });

    console.log(
      `[compaction] Summarized ${oldMessages.length} messages into ${estimateTokens(summary)} tokens, ` +
      `keeping ${recentMessages.length} recent messages`,
    );

    return [
      { role: "system", content: `[Previous conversation summary]\n\n${summary}` },
      ...recentMessages,
    ];
  } catch (err) {
    console.error("[compaction] Summarization failed, falling back to truncation:", err);
    // Fallback: just keep recent messages without summary
    return recentMessages;
  }
}
