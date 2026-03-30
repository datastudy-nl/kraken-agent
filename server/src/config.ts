import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(8080),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // Auth
  KRAKEN_API_KEY: z.string().optional(),

  // Database
  DATABASE_URL: z.string().default("postgresql://kraken:kraken@localhost:5432/kraken"),

  // Redis
  REDIS_URL: z.string().default("redis://localhost:6379"),

  // Neo4j
  NEO4J_URL: z.string().default("bolt://localhost:7687"),
  NEO4J_USER: z.string().default("neo4j"),
  NEO4J_PASSWORD: z.string().default("kraken"),

  // LLM
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  KRAKEN_DEFAULT_MODEL: z.string().default("gpt-5.4"),
  KRAKEN_EXTRACTION_MODEL: z.string().default("gpt-5.4"),

  // Budgets
  KRAKEN_MAX_CONTEXT_TOKENS: z.coerce.number().default(128000),
  KRAKEN_MAX_SOUL_CHARS: z.coerce.number().default(6000),
  KRAKEN_MAX_USER_MODEL_CHARS: z.coerce.number().default(2000),
  KRAKEN_MAX_SKILLS_PER_QUERY: z.coerce.number().default(3),
  KRAKEN_DREAM_CRON: z.string().default("*/15 * * * *"),
  KRAKEN_DREAM_MESSAGE_LIMIT: z.coerce.number().default(200),

  // Session lifecycle
  KRAKEN_SESSION_MAX_AGE_HOURS: z.coerce.number().default(24),
  KRAKEN_SESSION_IDLE_MINUTES: z.coerce.number().default(120),
  KRAKEN_MAX_HISTORY_MESSAGES: z.coerce.number().default(50),

  // Sandbox
  KRAKEN_SANDBOX_IMAGE: z.string().default("kraken-sandbox:latest"),
  KRAKEN_SANDBOX_TIMEOUT_MS: z.coerce.number().default(30000),
  KRAKEN_SANDBOX_MEMORY_MB: z.coerce.number().default(256),
  KRAKEN_SANDBOX_NETWORK: z.string().default("kraken-sandbox-net"),
  KRAKEN_WORKSPACES_PATH: z.string().default("/app/workspaces"),
  KRAKEN_WORKSPACES_VOLUME: z.string().default("kraken-agent_kraken-workspaces"),
  KRAKEN_SANDBOX_PORT_RANGE_START: z.coerce.number().default(30000),
  KRAKEN_SANDBOX_PORT_RANGE_END: z.coerce.number().default(30099),

  // Git (optional — enables private repo cloning in sandbox)
  KRAKEN_GIT_TOKEN: z.string().optional(),

  // Secret store encryption key (required for /v1/secrets)
  KRAKEN_SECRET_KEY: z.string().optional(),

  // CORS
  KRAKEN_ALLOWED_ORIGINS: z.string().default(""),

  // Browser automation
  KRAKEN_BROWSER_CDP_URL: z.string().default("ws://chromium:3000"),
  KRAKEN_BROWSER_TIMEOUT_MS: z.coerce.number().default(30000),
  KRAKEN_BROWSER_HEADLESS: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .default("true"),

  // Context compaction
  KRAKEN_COMPACTION_THRESHOLD_TOKENS: z.coerce.number().default(80000),
  KRAKEN_COMPACTION_KEEP_RECENT: z.coerce.number().default(10),
  KRAKEN_PRE_FLUSH_ENABLED: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .default("true"),

  // Skill self-improvement
  KRAKEN_SKILL_AUTO_CREATE: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .default("true"),
  KRAKEN_SKILL_MIN_TOOL_CALLS: z.coerce.number().default(5),
});

export const config = envSchema.parse(process.env);
export type Config = z.infer<typeof envSchema>;
