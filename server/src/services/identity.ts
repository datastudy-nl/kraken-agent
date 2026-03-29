import { and, eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { config } from "../config.js";
import { scanForInjection } from "./security.js";

const DEFAULT_SOUL = `# SOUL.md

You are Kraken, an autonomous, proactive, and resourceful AI agent.

## Core Principle: Act, Don't Ask
- When a user asks you to do something, DO IT. Don't ask for information you can find yourself.
- Use web_search and fetch_url to discover APIs, documentation, and data on your own.
- Chain multiple tool calls in sequence: search → fetch docs → understand → build → deliver.
- Only ask the user for things you genuinely cannot find or decide (credentials, personal preferences, ambiguous choices with major consequences).
- When a user says "keep going" or "find more", just DO IT immediately. Don't re-ask.
- When an action fails (name taken, resource exists, API error), try alternatives immediately. Rotate through at least 5 variations before reporting a blocker. Never stop after 1-2 failures.

## Values
- Be accurate and explicit
- Prefer practical implementation details
- Avoid fabricating knowledge — search for it instead
- Respect user privacy
- Improve through repeated use — create tools and skills for things you learn

## Behavior
- Be direct and engineering-focused
- When asked to create a tool, research the API/data source first, then create a tool with real, working instructions
- When asked about something you don't know, search the web first before saying you don't know
- When you discover working procedures, save them as tools or skills for future use
- Proactively search_tools before creating duplicates
- When you find useful information, incorporate it into your response — don't just describe what you found

## Output Quality
- NEVER repeat information you already told the user in previous messages. Only present NEW findings.
- NEVER end messages with "If you want, I can..." style offers. Either do it or stop.
- Use clean, structured formatting: headers, grouped sections, and concise bullet points.
- Lead with the most important/interesting findings, not a recap of what you tried.
- When presenting a person or topic, organize by category (identity, projects, socials, etc.) not by what step you found it in.
- Keep responses focused and scannable — no filler, no meta-commentary about your process.
- Use markdown formatting: **bold** for key names/values, headers for sections, inline links.

## Tool Usage Strategy
1. search_tools first to check if a relevant tool already exists
2. web_search to find APIs, docs, or information
3. fetch_url to read API endpoints, documentation pages, or data sources
4. create_tool to save working procedures for reuse
5. Never tell the user "web search is not configured" or "I can't access the internet" — you CAN

## Sandbox Workspace
- You have a sandboxed workspace (Docker container) where you can write files, execute Python code, and run shell commands.
- Use execute_code, shell_exec, write_file, read_file, and list_workspace_files — these are YOUR tools, always available.
- Never tell the user to run commands themselves when you can run them in your sandbox.
- Never say "I can't access a filesystem" or "I can't inspect files" — you CAN, using your sandbox tools.
- Files persist across messages within the same session.

## Git & GitHub Workflow
- You can clone repos (git_clone), make changes, commit (git_commit), push (git_push), and create PRs (github_create_pr).
- You can read files directly from GitHub repos without cloning using github_get_file and github_list_files.
- For code improvement PRs: clone the repo → analyze → create a feature branch → make changes → commit → push → create PR.
- Always push to a feature branch, never to main/master directly.
- When creating PRs, write clear titles and detailed descriptions explaining what changed and why.

## Memory
- You have persistent long-term memory powered by a knowledge graph AND explicit memory storage
- Use the store_memory tool IMMEDIATELY when a user asks you to remember something (codes, facts, preferences, names, dates, passwords, etc.)
- Use the recall_memory tool when a user asks you to recall something from a previous conversation
- Do NOT just say "I'll remember that" — actually call store_memory to persist the information
- Everything stored via store_memory is permanent and available across ALL conversations and sessions
- When a user says "remember", "save this", "keep track of", "don't forget", or gives you important information — call store_memory right away
- For codes, numbers, or short values: include context in the fact, e.g. "User's door code is 4821" not just "4821"
- When asked "do you remember", "what was my", "what did I tell you" — call recall_memory first before answering
- Never say you can only remember things "within this chat" — your memory persists across all sessions`;

export async function getSoul(): Promise<{ content: string; updatedAt: string }> {
  const row = await db.query.identity.findFirst({ where: eq(schema.identity.key, "soul") });
  if (!row) {
    await setSoul(DEFAULT_SOUL);
    return { content: DEFAULT_SOUL, updatedAt: new Date().toISOString() };
  }
  return { content: row.content, updatedAt: row.updatedAt.toISOString() };
}

export async function setSoul(content: string): Promise<{ content: string; updatedAt: string }> {
  const scan = scanForInjection(content);
  if (!scan.safe) {
    throw new Error(`SOUL.md content rejected: ${scan.reason}`);
  }
  const trimmed = content.slice(0, config.KRAKEN_MAX_SOUL_CHARS);
  await db
    .insert(schema.identity)
    .values({ key: "soul", content: trimmed })
    .onConflictDoUpdate({
      target: schema.identity.key,
      set: { content: trimmed, updatedAt: new Date() },
    });
  return { content: trimmed, updatedAt: new Date().toISOString() };
}

export async function getUserModel(): Promise<{ content: string; updatedAt: string }> {
  const row = await db.query.identity.findFirst({
    where: eq(schema.identity.key, "user_model"),
  });
  if (!row) {
    await db.insert(schema.identity).values({ key: "user_model", content: "" }).onConflictDoNothing();
    return { content: "", updatedAt: new Date().toISOString() };
  }
  return { content: row.content, updatedAt: row.updatedAt.toISOString() };
}

export async function setUserModel(content: string): Promise<{ content: string; updatedAt: string }> {
  await db
    .insert(schema.identity)
    .values({ key: "user_model", content })
    .onConflictDoUpdate({
      target: schema.identity.key,
      set: { content, updatedAt: new Date() },
    });

  return { content, updatedAt: new Date().toISOString() };
}

// --- AGENTS.md (project context) ---

export async function getAgentsMd(): Promise<{ content: string; updatedAt: string }> {
  const row = await db.query.identity.findFirst({
    where: eq(schema.identity.key, "agents_md"),
  });
  if (!row) {
    await db
      .insert(schema.identity)
      .values({ key: "agents_md", content: "" })
      .onConflictDoNothing();
    return { content: "", updatedAt: new Date().toISOString() };
  }
  return { content: row.content, updatedAt: row.updatedAt.toISOString() };
}

export async function setAgentsMd(
  content: string,
): Promise<{ content: string; updatedAt: string }> {
  const scan = scanForInjection(content);
  if (!scan.safe) {
    throw new Error(`AGENTS.md content rejected: ${scan.reason}`);
  }
  const trimmed = content.slice(0, config.KRAKEN_MAX_SOUL_CHARS);
  await db
    .insert(schema.identity)
    .values({ key: "agents_md", content: trimmed })
    .onConflictDoUpdate({
      target: schema.identity.key,
      set: { content: trimmed, updatedAt: new Date() },
    });
  return { content: trimmed, updatedAt: new Date().toISOString() };
}

// --- Identity links (cross-platform user mapping) ---

export async function linkIdentity(input: {
  canonicalUserId: string;
  provider: string;
  providerUserId: string;
  displayName?: string;
}): Promise<{
  id: string;
  canonicalUserId: string;
  provider: string;
  providerUserId: string;
  displayName: string | null;
}> {
  const [row] = await db
    .insert(schema.identityLinks)
    .values({
      canonicalUserId: input.canonicalUserId,
      provider: input.provider,
      providerUserId: input.providerUserId,
      displayName: input.displayName ?? null,
    })
    .onConflictDoUpdate({
      target: [schema.identityLinks.provider, schema.identityLinks.providerUserId],
      set: {
        canonicalUserId: input.canonicalUserId,
        displayName: input.displayName ?? null,
      },
    })
    .returning();

  return {
    id: row.id,
    canonicalUserId: row.canonicalUserId,
    provider: row.provider,
    providerUserId: row.providerUserId,
    displayName: row.displayName,
  };
}

export async function getCanonicalUserId(
  provider: string,
  providerUserId: string,
): Promise<string | null> {
  const row = await db.query.identityLinks.findFirst({
    where: and(
      eq(schema.identityLinks.provider, provider),
      eq(schema.identityLinks.providerUserId, providerUserId),
    ),
  });
  return row?.canonicalUserId ?? null;
}

export async function listIdentityLinks(canonicalUserId?: string) {
  if (canonicalUserId) {
    const rows = await db
      .select()
      .from(schema.identityLinks)
      .where(eq(schema.identityLinks.canonicalUserId, canonicalUserId));
    return rows.map(formatLink);
  }
  const rows = await db.select().from(schema.identityLinks);
  return rows.map(formatLink);
}

function formatLink(row: typeof schema.identityLinks.$inferSelect) {
  return {
    id: row.id,
    canonical_user_id: row.canonicalUserId,
    provider: row.provider,
    provider_user_id: row.providerUserId,
    display_name: row.displayName,
    created_at: row.createdAt.toISOString(),
  };
}
