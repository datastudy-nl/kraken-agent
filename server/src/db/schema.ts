import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  vector,
  index,
  uniqueIndex,
  boolean,
  customType,
} from "drizzle-orm/pg-core";

// tsvector column type — populated by a trigger in init.ts, not by app code
const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

// --- Sessions ---
export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionKey: text("session_key"),
  name: text("name"),
  personality: text("personality"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }).defaultNow(),
  archived: boolean("archived").default(false),
  metadata: jsonb("metadata").notNull().default({}),
}, (t) => [uniqueIndex("sessions_session_key_idx").on(t.sessionKey)]);

// --- Messages (episodic memory) ---
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // 'user' | 'assistant' | 'system' | 'tool'
    content: text("content").notNull(),
    toolCalls: jsonb("tool_calls").default([]),
    toolResults: jsonb("tool_results").default([]),
    model: text("model"),
    tokenCount: integer("token_count"),
    embedding: vector("embedding", { dimensions: 1536 }),
    searchVector: tsvector("search_vector"), // populated by trigger — see init.ts
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    subject: text("subject"),
    predicate: text("predicate"),
    object: text("object"),
    metadata: jsonb("metadata").notNull().default({}),
  },
  (t) => [
    index("messages_session_idx").on(t.sessionId),
    index("messages_created_idx").on(t.createdAt),
    index("messages_search_idx").using("gin", t.searchVector),
  ],
);



// --- Curated memory items ---
export const memoryItems = pgTable(
  "memory_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id").references(() => sessions.id, { onDelete: "set null" }),
    kind: text("kind").notNull(),
    status: text("status").notNull().default("active"),
    scope: text("scope").notNull().default("user"),
    sourceType: text("source_type").notNull(),
    content: text("content").notNull(),
    tags: jsonb("tags").notNull().default([]),
    confidence: integer("confidence").notNull().default(100),
    importance: integer("importance").notNull().default(80),
    reuseCount: integer("reuse_count").notNull().default(0),
    lastRetrievedAt: timestamp("last_retrieved_at", { withTimezone: true }),
    lastConfirmedAt: timestamp("last_confirmed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    supersededBy: uuid("superseded_by"),
    embedding: vector("embedding", { dimensions: 1536 }),
    searchVector: tsvector("search_vector"),
    subject: text("subject"),
    predicate: text("predicate"),
    object: text("object"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("memory_items_status_idx").on(t.status),
    index("memory_items_scope_idx").on(t.scope),
    index("memory_items_created_idx").on(t.createdAt),
    index("memory_items_subject_predicate_idx").on(t.subject, t.predicate),
    index("memory_items_search_idx").using("gin", t.searchVector),
  ],
);

// --- Skills (procedural memory) ---
export const skills = pgTable(
  "skills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull().unique(),
    content: text("content").notNull(),
    tags: jsonb("tags").notNull().default([]),
    version: integer("version").notNull().default(1),
    embedding: vector("embedding", { dimensions: 1536 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("skills_name_idx").on(t.name)],
);

// --- Tools (vector-backed registry for tool selection) ---
export const tools = pgTable(
  "tools",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull().unique(),
    description: text("description").notNull(),
    instructions: text("instructions").notNull(),
    inputSchema: jsonb("input_schema").notNull().default({}),
    tags: jsonb("tags").notNull().default([]),
    embedding: vector("embedding", { dimensions: 1536 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tools_name_idx").on(t.name)],
);

// --- Identity ---
export const identity = pgTable("identity", {
  key: text("key").primaryKey(), // 'soul' | 'user_model'
  content: text("content").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// --- Schedules ---
export const schedules = pgTable(
  "schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    cronExpression: text("cron_expression").notNull(),
    taskPrompt: text("task_prompt").notNull(),
    originSessionId: uuid("origin_session_id").references(() => sessions.id, {
      onDelete: "set null",
    }),
    enabled: boolean("enabled").notNull().default(true),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    runCount: integer("run_count").notNull().default(0),
    maxRuns: integer("max_runs"), // null = unlimited
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    metadata: jsonb("metadata").notNull().default({}),
  },
  (t) => [
    index("schedules_next_run_idx").on(t.nextRunAt),
    index("schedules_enabled_idx").on(t.enabled),
  ],
);

// --- Identity Links (cross-platform user mapping) ---
export const identityLinks = pgTable(
  "identity_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    canonicalUserId: text("canonical_user_id").notNull(),
    provider: text("provider").notNull(),
    providerUserId: text("provider_user_id").notNull(),
    displayName: text("display_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("identity_links_provider_user_idx").on(t.provider, t.providerUserId),
    index("identity_links_canonical_idx").on(t.canonicalUserId),
  ],
);

// --- Secrets (encrypted key store) ---
export const secrets = pgTable(
  "secrets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull().unique(),
    encryptedValue: text("encrypted_value").notNull(),
    description: text("description"),
    allowedTools: jsonb("allowed_tools"), // string[] | null — null means all tools
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("secrets_name_idx").on(t.name)],
);
