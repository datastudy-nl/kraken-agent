import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";

// We re-define the schema here to test it in isolation, since config.ts
// parses process.env on import and that side-effect is hard to control.
const envSchema = z.object({
  PORT: z.coerce.number().default(8080),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  KRAKEN_API_KEY: z.string().optional(),
  DATABASE_URL: z.string().default("postgresql://kraken:kraken@localhost:5432/kraken"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  NEO4J_URL: z.string().default("bolt://localhost:7687"),
  NEO4J_USER: z.string().default("neo4j"),
  NEO4J_PASSWORD: z.string().default("kraken"),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  KRAKEN_DEFAULT_MODEL: z.string().default("gpt-5.4"),
  KRAKEN_EXTRACTION_MODEL: z.string().default("gpt-5.4"),
  KRAKEN_MAX_CONTEXT_TOKENS: z.coerce.number().default(128000),
  KRAKEN_MAX_SOUL_CHARS: z.coerce.number().default(6000),
  KRAKEN_MAX_USER_MODEL_CHARS: z.coerce.number().default(2000),
  KRAKEN_MAX_SKILLS_PER_QUERY: z.coerce.number().default(3),
  KRAKEN_DREAM_CRON: z.string().default("*/15 * * * *"),
  KRAKEN_DREAM_MESSAGE_LIMIT: z.coerce.number().default(200),
  KRAKEN_SESSION_MAX_AGE_HOURS: z.coerce.number().default(24),
  KRAKEN_SESSION_IDLE_MINUTES: z.coerce.number().default(120),
  KRAKEN_MAX_HISTORY_MESSAGES: z.coerce.number().default(50),
  KRAKEN_SANDBOX_IMAGE: z.string().default("kraken-sandbox:latest"),
  KRAKEN_SANDBOX_TIMEOUT_MS: z.coerce.number().default(30000),
  KRAKEN_SANDBOX_MEMORY_MB: z.coerce.number().default(256),
  KRAKEN_SANDBOX_NETWORK: z.string().default("none"),
  KRAKEN_WORKSPACES_PATH: z.string().default("/app/workspaces"),
  KRAKEN_WORKSPACES_VOLUME: z.string().default("kraken-agent_kraken-workspaces"),
  KRAKEN_GIT_TOKEN: z.string().optional(),
  KRAKEN_BROWSER_CDP_URL: z.string().default("ws://chromium:3000"),
  KRAKEN_BROWSER_TIMEOUT_MS: z.coerce.number().default(30000),
  KRAKEN_BROWSER_HEADLESS: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .default("true"),
  KRAKEN_ALLOWED_ORIGINS: z.string().default(""),
  KRAKEN_COMPACTION_THRESHOLD_TOKENS: z.coerce.number().default(80000),
  KRAKEN_COMPACTION_KEEP_RECENT: z.coerce.number().default(10),
  KRAKEN_PRE_FLUSH_ENABLED: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .default("true"),
  KRAKEN_SKILL_AUTO_CREATE: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .default("true"),
  KRAKEN_SKILL_MIN_TOOL_CALLS: z.coerce.number().default(5),
});

describe("env config schema", () => {
  it("parses with all defaults from empty env", () => {
    const result = envSchema.parse({});
    expect(result.PORT).toBe(8080);
    expect(result.NODE_ENV).toBe("development");
    expect(result.DATABASE_URL).toBe("postgresql://kraken:kraken@localhost:5432/kraken");
    expect(result.KRAKEN_DEFAULT_MODEL).toBe("gpt-5.4");
    expect(result.KRAKEN_MAX_CONTEXT_TOKENS).toBe(128000);
    expect(result.KRAKEN_BROWSER_HEADLESS).toBe(true);
    expect(result.KRAKEN_PRE_FLUSH_ENABLED).toBe(true);
    expect(result.KRAKEN_SKILL_AUTO_CREATE).toBe(true);
    expect(result.KRAKEN_ALLOWED_ORIGINS).toBe("");
  });

  it("coerces PORT from string to number", () => {
    const result = envSchema.parse({ PORT: "3000" });
    expect(result.PORT).toBe(3000);
  });

  it("coerces numeric env vars from strings", () => {
    const result = envSchema.parse({
      KRAKEN_MAX_CONTEXT_TOKENS: "64000",
      KRAKEN_SANDBOX_MEMORY_MB: "512",
      KRAKEN_SESSION_MAX_AGE_HOURS: "48",
    });
    expect(result.KRAKEN_MAX_CONTEXT_TOKENS).toBe(64000);
    expect(result.KRAKEN_SANDBOX_MEMORY_MB).toBe(512);
    expect(result.KRAKEN_SESSION_MAX_AGE_HOURS).toBe(48);
  });

  it("transforms KRAKEN_BROWSER_HEADLESS string to boolean", () => {
    expect(envSchema.parse({ KRAKEN_BROWSER_HEADLESS: "true" }).KRAKEN_BROWSER_HEADLESS).toBe(true);
    expect(envSchema.parse({ KRAKEN_BROWSER_HEADLESS: "false" }).KRAKEN_BROWSER_HEADLESS).toBe(false);
  });

  it("transforms KRAKEN_PRE_FLUSH_ENABLED string to boolean", () => {
    expect(envSchema.parse({ KRAKEN_PRE_FLUSH_ENABLED: "true" }).KRAKEN_PRE_FLUSH_ENABLED).toBe(true);
    expect(envSchema.parse({ KRAKEN_PRE_FLUSH_ENABLED: "false" }).KRAKEN_PRE_FLUSH_ENABLED).toBe(false);
  });

  it("transforms KRAKEN_SKILL_AUTO_CREATE string to boolean", () => {
    expect(envSchema.parse({ KRAKEN_SKILL_AUTO_CREATE: "false" }).KRAKEN_SKILL_AUTO_CREATE).toBe(false);
  });

  it("rejects invalid NODE_ENV", () => {
    expect(() => envSchema.parse({ NODE_ENV: "staging" })).toThrow();
  });

  it("rejects invalid KRAKEN_BROWSER_HEADLESS value", () => {
    expect(() => envSchema.parse({ KRAKEN_BROWSER_HEADLESS: "yes" })).toThrow();
  });

  it("allows optional API keys to be undefined", () => {
    const result = envSchema.parse({});
    expect(result.KRAKEN_API_KEY).toBeUndefined();
    expect(result.OPENAI_API_KEY).toBeUndefined();
    expect(result.ANTHROPIC_API_KEY).toBeUndefined();
    expect(result.KRAKEN_GIT_TOKEN).toBeUndefined();
  });

  it("accepts API keys when provided", () => {
    const result = envSchema.parse({
      KRAKEN_API_KEY: "sk-test",
      OPENAI_API_KEY: "sk-openai",
    });
    expect(result.KRAKEN_API_KEY).toBe("sk-test");
    expect(result.OPENAI_API_KEY).toBe("sk-openai");
  });

  it("uses correct sandbox defaults", () => {
    const result = envSchema.parse({});
    expect(result.KRAKEN_SANDBOX_IMAGE).toBe("kraken-sandbox:latest");
    expect(result.KRAKEN_SANDBOX_TIMEOUT_MS).toBe(30000);
    expect(result.KRAKEN_SANDBOX_MEMORY_MB).toBe(256);
    expect(result.KRAKEN_SANDBOX_NETWORK).toBe("none");
  });

  it("allows overriding all config values", () => {
    const result = envSchema.parse({
      PORT: "9090",
      NODE_ENV: "production",
      KRAKEN_DEFAULT_MODEL: "claude-4",
      KRAKEN_ALLOWED_ORIGINS: "https://app.example.com,https://admin.example.com",
      KRAKEN_COMPACTION_THRESHOLD_TOKENS: "50000",
    });
    expect(result.PORT).toBe(9090);
    expect(result.NODE_ENV).toBe("production");
    expect(result.KRAKEN_DEFAULT_MODEL).toBe("claude-4");
    expect(result.KRAKEN_ALLOWED_ORIGINS).toBe("https://app.example.com,https://admin.example.com");
    expect(result.KRAKEN_COMPACTION_THRESHOLD_TOKENS).toBe(50000);
  });
});
