import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock heavy side-effect modules before importing compaction
vi.mock("../config.js", () => ({
  config: {
    KRAKEN_COMPACTION_THRESHOLD_TOKENS: 1000,
    KRAKEN_COMPACTION_KEEP_RECENT: 10,
    KRAKEN_PRE_FLUSH_ENABLED: true,
  },
}));

vi.mock("./llm.js", () => ({
  defaultModel: {},
  extractionModel: {},
  embeddingModel: {},
  resolveModel: () => ({}),
  runChat: async () => ({ text: "" }),
}));

vi.mock("./builtinTools.js", () => ({
  getBuiltinTools: () => ({}),
}));

vi.mock("./memory.js", () => ({
  storeMessage: async () => {},
}));

import { shouldCompact } from "./compaction.js";

describe("shouldCompact", () => {
  it("returns false when history is well under threshold", () => {
    const messages = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there!" },
    ];
    // "Hello" = 5 chars → ceil(5/4) = 2 tokens + 4 overhead = 6
    // "Hi there!" = 9 chars → ceil(9/4) = 3 tokens + 4 overhead = 7
    // total history = 13, system = 10 → 23 < 1000
    expect(shouldCompact(messages, 10)).toBe(false);
  });

  it("returns true when history exceeds threshold", () => {
    // Create messages that will exceed 1000 tokens
    // Each message: 4000 chars → 1000 tokens + 4 overhead = 1004 tokens
    const messages = [{ role: "user", content: "x".repeat(4000) }];
    // historyTokens = 1000 + 4 = 1004, systemPromptTokens = 0 → 1004 > 1000
    expect(shouldCompact(messages, 0)).toBe(true);
  });

  it("considers system prompt tokens in threshold", () => {
    // History alone: 500 tokens + system: 600 tokens = 1100 > 1000
    const messages = [{ role: "user", content: "x".repeat(2000) }];
    // historyTokens = ceil(2000/4) + 4 = 504
    // With system = 600 → 1104 > 1000
    expect(shouldCompact(messages, 600)).toBe(true);
  });

  it("returns false at exactly threshold", () => {
    // Need messages + system = exactly 1000
    // message: content of 3960 chars → ceil(3960/4) = 990 tokens + 4 overhead = 994
    // system = 6 → total = 1000 → NOT > 1000
    const messages = [{ role: "user", content: "x".repeat(3960) }];
    expect(shouldCompact(messages, 6)).toBe(false);
  });

  it("returns true above threshold by 1", () => {
    const messages = [{ role: "user", content: "x".repeat(3960) }];
    // historyTokens = 994, system = 7 → 1001 > 1000
    expect(shouldCompact(messages, 7)).toBe(true);
  });

  it("handles empty message array", () => {
    expect(shouldCompact([], 500)).toBe(false);
  });

  it("accumulates tokens across multiple messages", () => {
    // 100 messages of 36 chars each → ceil(36/4) = 9 + 4 = 13 per message
    // 100 * 13 = 1300 > 1000
    const messages = Array.from({ length: 100 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: "x".repeat(36),
    }));
    expect(shouldCompact(messages, 0)).toBe(true);
  });
});
