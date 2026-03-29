import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import {
  createEntity,
  createRelationship,
  deleteEntity,
  findEntityByName,
  getAllCommunitySummaries,
  getEntityCommunitySummaries,
  getEntityNeighborhood,
  listCommunities,
  listEntities,
  upsertCommunity,
} from "./graph.js";
import {
  compressUserModel,
  createEmbedding,
  dreamFromConversationWindow,
  extractMemoryFromConversation,
} from "./llm.js";
import { getUserModel, setUserModel } from "./identity.js";
import { createTool, listTools } from "./tools.js";
import { createSkill, listSkills } from "./skills.js";
import { hybridSearch } from "./vector.js";
import { config } from "../config.js";
import { destroySandbox } from "./sandbox.js";

export type MemoryMode = "auto" | "local" | "global" | "drift" | "basic";

export async function createSession(input?: {
  metadata?: Record<string, unknown>;
  sessionKey?: string;
  name?: string;
}) {
  const [row] = await db
    .insert(schema.sessions)
    .values({
      metadata: input?.metadata ?? {},
      sessionKey: input?.sessionKey,
      name: input?.name,
    })
    .returning();

  return {
    id: row.id,
    session_key: row.sessionKey,
    name: row.name,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    message_count: 0,
    metadata: row.metadata,
  };
}

export async function getSessionByKey(sessionKey: string) {
  const session = await db.query.sessions.findFirst({
    where: eq(schema.sessions.sessionKey, sessionKey),
  });
  if (!session) return null;
  return getSession(session.id);
}

export async function resolveSession(input: {
  sessionId?: string;
  sessionKey?: string;
  sessionName?: string;
  metadata?: Record<string, unknown>;
}) {
  if (input.sessionId) {
    const session = await getSession(input.sessionId);
    if (session) return session;
  }

  if (input.sessionKey) {
    const session = await getSessionByKey(input.sessionKey);
    if (session) return session;

    return createSession({
      metadata: input.metadata,
      sessionKey: input.sessionKey,
      name: input.sessionName,
    });
  }

  return createSession({ metadata: input.metadata, name: input.sessionName });
}

export async function listSessions(limit: number, offset: number) {
  const rows = await db.select().from(schema.sessions).orderBy(desc(schema.sessions.updatedAt)).limit(limit).offset(offset);

  const sessions = await Promise.all(
    rows.map(async (row) => {
      const count = await db
        .select({ count: sql<number>`count(*)` })
        .from(schema.messages)
        .where(eq(schema.messages.sessionId, row.id));
      return {
        id: row.id,
        session_key: row.sessionKey,
        name: row.name,
        created_at: row.createdAt.toISOString(),
        updated_at: row.updatedAt.toISOString(),
        message_count: Number(count[0]?.count ?? 0),
        metadata: row.metadata,
      };
    }),
  );

  const total = await db.select({ count: sql<number>`count(*)` }).from(schema.sessions);
  return { sessions, total: Number(total[0]?.count ?? 0), limit, offset };
}

export async function getSession(id: string) {
  const session = await db.query.sessions.findFirst({ where: eq(schema.sessions.id, id) });
  if (!session) return null;

  const messages = await db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.sessionId, id))
    .orderBy(schema.messages.createdAt);

  return {
    id: session.id,
    session_key: session.sessionKey,
    name: session.name,
    created_at: session.createdAt.toISOString(),
    updated_at: session.updatedAt.toISOString(),
    message_count: messages.length,
    metadata: session.metadata,
    messages: messages.map((m) => ({
      id: m.id,
      session_id: m.sessionId,
      role: m.role,
      content: m.content,
      timestamp: m.createdAt.toISOString(),
      metadata: m.metadata,
    })),
  };
}

export async function deleteSession(id: string): Promise<boolean> {
  // Destroy sandbox container and workspace files
  await destroySandbox(id).catch(() => {});
  const rows = await db.delete(schema.sessions).where(eq(schema.sessions.id, id)).returning();
  return rows.length > 0;
}

export async function updateSessionPersonality(id: string, personality: string) {
  const rows = await db
    .update(schema.sessions)
    .set({ personality })
    .where(eq(schema.sessions.id, id))
    .returning();
  return rows[0] ?? null;
}

export async function archiveExpiredSessions(
  maxAgeHours: number,
  idleMinutes: number,
): Promise<number> {
  const maxAgeThreshold = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
  const idleThreshold = new Date(Date.now() - idleMinutes * 60 * 1000);

  const rows = await db
    .update(schema.sessions)
    .set({ archived: true })
    .where(
      and(
        eq(schema.sessions.archived, false),
        or(
          sql`${schema.sessions.createdAt} < ${maxAgeThreshold.toISOString()}`,
          sql`${schema.sessions.lastActiveAt} < ${idleThreshold.toISOString()}`,
        ),
      ),
    )
    .returning();

  // Destroy sandbox containers for archived sessions
  await Promise.allSettled(rows.map((r) => destroySandbox(r.id)));

  return rows.length;
}

export async function getSessionMessages(id: string, limit: number, offset: number) {
  const messages = await db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.sessionId, id))
    .orderBy(schema.messages.createdAt)
    .limit(limit)
    .offset(offset);

  const total = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.messages)
    .where(eq(schema.messages.sessionId, id));

  return {
    session_id: id,
    messages: messages.map((m) => ({
      id: m.id,
      session_id: m.sessionId,
      role: m.role,
      content: m.content,
      timestamp: m.createdAt.toISOString(),
      metadata: m.metadata,
    })),
    total: Number(total[0]?.count ?? 0),
    limit,
    offset,
  };
}

export async function listRecentMessages(limit: number) {
  const messages = await db
    .select()
    .from(schema.messages)
    .orderBy(desc(schema.messages.createdAt))
    .limit(limit);

  return messages.reverse().map((message) => ({
    id: message.id,
    session_id: message.sessionId,
    role: message.role,
    content: message.content,
    timestamp: message.createdAt.toISOString(),
    metadata: message.metadata,
  }));
}

export async function storeMessage(input: {
  sessionId: string;
  role: string;
  content: string;
  model?: string;
  metadata?: Record<string, unknown>;
  toolCalls?: unknown[];
  toolResults?: unknown[];
  tokenCount?: number;
}) {
  const [row] = await db
    .insert(schema.messages)
    .values({
      sessionId: input.sessionId,
      role: input.role,
      content: input.content,
      model: input.model,
      metadata: input.metadata ?? {},
      toolCalls: input.toolCalls ?? [],
      toolResults: input.toolResults ?? [],
      tokenCount: input.tokenCount,
    })
    .returning();

  await db
    .update(schema.sessions)
    .set({ updatedAt: new Date(), lastActiveAt: new Date() })
    .where(eq(schema.sessions.id, input.sessionId));

  // Embed user/assistant messages for hybrid search (>20 chars to skip trivial).
  // User messages are awaited so cross-session recall works immediately
  // (e.g. "remember X" in Discord is findable from /chat/completions right away).
  // Assistant messages are fire-and-forget to avoid blocking responses.
  if (input.content.length > 20) {
    if (input.role === "user") {
      await embedMessageSync(row.id, input.content);
    } else if (input.role === "assistant") {
      embedMessageBackground(row.id, input.content);
    }
  }

  return row;
}

/** Await embedding so the message is immediately searchable via vector similarity. */
async function embedMessageSync(messageId: string, content: string): Promise<void> {
  try {
    const embedding = await createEmbedding(content);
    await db.update(schema.messages).set({ embedding }).where(eq(schema.messages.id, messageId));
  } catch {
    /* non-fatal — hybrid search falls back to FTS-only */
  }
}

/** Fire-and-forget embedding for hybrid search. Failures are non-fatal. */
function embedMessageBackground(messageId: string, content: string): void {
  createEmbedding(content)
    .then(async (embedding) => {
      await db
        .update(schema.messages)
        .set({ embedding })
        .where(eq(schema.messages.id, messageId));
    })
    .catch(() => {
      /* non-fatal — hybrid search falls back to FTS-only */
    });
}

export async function searchEpisodes(query: string, limit: number) {
  // Try hybrid search (FTS + vector) first, fall back to FTS-only
  const hybridResults = await hybridSearch(query, limit);
  if (hybridResults.length > 0) {
    return hybridResults.map((row) => ({
      id: row.id,
      session_id: row.session_id,
      role: row.role,
      content: row.content,
      timestamp: row.created_at,
      metadata: row.metadata,
    }));
  }

  // FTS fallback (no embeddings available yet)
  const ftsRows = await db.execute(sql`
    SELECT id, session_id, role, content, created_at, metadata,
           ts_rank(search_vector, plainto_tsquery('english', ${query})) AS rank
    FROM messages
    WHERE search_vector @@ plainto_tsquery('english', ${query})
    ORDER BY rank DESC, created_at DESC
    LIMIT ${limit}
  `);

  if (ftsRows.rows.length > 0) {
    return ftsRows.rows.map((row: any) => ({
      id: row.id,
      session_id: row.session_id,
      role: row.role,
      content: row.content,
      timestamp: new Date(row.created_at).toISOString(),
      metadata: row.metadata ?? {},
    }));
  }

  // Final fallback: ILIKE substring match
  const rows = await db
    .select()
    .from(schema.messages)
    .where(ilike(schema.messages.content, `%${query}%`))
    .orderBy(desc(schema.messages.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    session_id: row.sessionId,
    role: row.role,
    content: row.content,
    timestamp: row.createdAt.toISOString(),
    metadata: row.metadata,
  }));
}

// ---------------------------------------------------------------------------
// Explicit memory — user-requested "remember this" facts
// ---------------------------------------------------------------------------

/** Search for explicitly stored memories matching a query. */
async function searchExplicitMemories(
  query: string,
  limit: number,
): Promise<Array<{ content: string; timestamp: string }>> {
  const rows = await db.execute(sql`
    SELECT content, created_at
    FROM messages
    WHERE metadata->>'type' = 'explicit_memory'
      AND (
        content ILIKE ${"%" + query + "%"}
        OR search_vector @@ plainto_tsquery('english', ${query})
      )
    ORDER BY created_at DESC
    LIMIT ${limit}
  `);
  return rows.rows.map((row: any) => ({
    content: row.content,
    timestamp: new Date(row.created_at).toISOString(),
  }));
}

/**
 * Store an explicit memory fact that the user asked the agent to remember.
 * Written as a system message with metadata.type = "explicit_memory" so it
 * can be prioritized during retrieval. The embedding is created synchronously
 * so the fact is immediately searchable from any session.
 */
export async function storeExplicitMemory(
  sessionId: string,
  fact: string,
  tags?: string[],
): Promise<{ id: string; fact: string }> {
  const [row] = await db
    .insert(schema.messages)
    .values({
      sessionId,
      role: "system",
      content: fact,
      metadata: {
        type: "explicit_memory",
        tags: tags ?? [],
        storedAt: new Date().toISOString(),
      },
    })
    .returning();

  // Synchronously embed so the fact is immediately searchable cross-session
  await embedMessageSync(row.id, fact);

  // Also create a Neo4j entity for graph recall
  try {
    const existing = await findEntityByName(fact.slice(0, 100));
    if (!existing) {
      await createEntity({
        id: crypto.randomUUID(),
        name: fact.slice(0, 100),
        type: "memory",
        properties: {
          fact,
          sessionId,
          storedAt: new Date().toISOString(),
          tags: tags ?? [],
        },
      });
    }
  } catch {
    // Non-fatal — PostgreSQL storage is the primary store
  }

  return { id: row.id, fact };
}

/**
 * Search for explicitly stored memories plus relevant episodic context.
 * Explicit memories (metadata.type = "explicit_memory") are returned first.
 */
export async function recallMemories(
  query: string,
  limit: number = 10,
): Promise<Array<{ content: string; type: "explicit" | "episode"; timestamp: string }>> {
  // Search explicit memories first (highest priority)
  const explicitRows = await db.execute(sql`
    SELECT id, content, created_at, metadata
    FROM messages
    WHERE metadata->>'type' = 'explicit_memory'
      AND (
        content ILIKE ${"%" + query + "%"}
        OR search_vector @@ plainto_tsquery('english', ${query})
      )
    ORDER BY created_at DESC
    LIMIT ${Math.ceil(limit / 2)}
  `);

  const explicitResults = explicitRows.rows.map((row: any) => ({
    content: row.content,
    type: "explicit" as const,
    timestamp: new Date(row.created_at).toISOString(),
  }));

  // Then search episodic memory for broader context
  const episodeLimit = limit - explicitResults.length;
  const episodes = episodeLimit > 0 ? await searchEpisodes(query, episodeLimit) : [];
  const episodeResults = episodes
    .filter((ep) => !explicitResults.some((e) => e.content === ep.content))
    .map((ep) => ({
      content: ep.content,
      type: "episode" as const,
      timestamp: ep.timestamp,
    }));

  return [...explicitResults, ...episodeResults].slice(0, limit);
}

export async function queryMemory(input: {
  query: string;
  mode: MemoryMode;
  limit: number;
  entityFilter?: string[];
  userModel?: string;
}) {
  const mode = input.mode === "auto" ? chooseMode(input.query) : input.mode;

  // Extract entity names mentioned in the user model for expanded search
  const modelEntityNames = input.userModel
    ? extractEntityNamesFromModel(input.userModel)
    : [];

  // Always search both episodes and graph — modes influence emphasis, not exclusion
  // Also fetch community summaries in drift mode (default) for broader recall
  // Also search explicit memories that the user asked the agent to store
  const [episodes, candidateEntities, globalSummaries, explicitMemories] = await Promise.all([
    searchEpisodes(input.query, input.limit),
    listEntities({ type: undefined, search: input.query, limit: input.limit }),
    mode === "global" || mode === "drift"
      ? getAllCommunitySummaries()
      : Promise.resolve([]),
    searchExplicitMemories(input.query, 5),
  ]);

  // If the direct query didn't find entities, try searching for entities
  // mentioned in the user model (e.g. "what do I like?" won't match
  // "TypeScript" directly, but the user model contains that fact)
  let modelEntities: Array<{ id: string; name: string; type: string; properties: Record<string, unknown>; createdAt: string }> = [];
  if (candidateEntities.entities.length === 0 && modelEntityNames.length > 0) {
    const modelSearches = await Promise.all(
      modelEntityNames.slice(0, 5).map((name) =>
        findEntityByName(name).catch(() => null),
      ),
    );
    modelEntities = modelSearches.filter(
      (e): e is NonNullable<typeof e> => e !== null,
    );
  }

  const allCandidates = [
    ...candidateEntities.entities,
    ...modelEntities,
  ];

  // Deduplicate by id
  const seenIds = new Set<string>();
  const uniqueCandidates = allCandidates.filter((e) => {
    if (seenIds.has(e.id)) return false;
    seenIds.add(e.id);
    return true;
  });

  // Collect graph context from all matched entities (not just the first one)
  const graphNodes: Array<{ id: string; name: string; type: string; properties: Record<string, unknown>; createdAt: string }> = [];
  let communitySummaries: string[] = [];

  if (uniqueCandidates.length > 0) {
    // Expand neighborhoods for up to 3 top entities to get richer context
    const expansions = await Promise.all(
      uniqueCandidates.slice(0, 3).map(async (entity) => {
        const [neighborhood, communities] = await Promise.all([
          getEntityNeighborhood(entity.id, 2),
          getEntityCommunitySummaries(entity.id),
        ]);
        return { nodes: neighborhood.nodes, communities };
      }),
    );

    const nodeIds = new Set<string>();
    for (const expansion of expansions) {
      for (const node of expansion.nodes) {
        if (!nodeIds.has(node.id)) {
          nodeIds.add(node.id);
          graphNodes.push(node);
        }
      }
      communitySummaries.push(...expansion.communities);
    }
  }

  // Merge global/drift summaries
  if (globalSummaries.length > 0) {
    communitySummaries = [...communitySummaries, ...globalSummaries];
  }

  // Deduplicate community summaries
  communitySummaries = [...new Set(communitySummaries)];

  const primaryEntity = uniqueCandidates[0] ?? null;

  console.log(
    `[queryMemory] mode=${mode} query="${input.query.slice(0, 60)}" ` +
    `entities=${graphNodes.length} communities=${communitySummaries.length} ` +
    `episodes=${episodes.length} explicit=${explicitMemories.length} modelSeeds=${modelEntityNames.length}`,
  );

  return {
    query: input.query,
    mode,
    explicitMemories,
    results: [
      ...graphNodes.map((node) => ({ item_type: "entity", ...node })),
      ...communitySummaries.map((summary) => ({ type: "community_summary", summary })),
      ...episodes.map((ep) => ({ item_type: "episode", ...ep })),
    ].slice(0, input.limit),
    entities: graphNodes.map((node) => ({
      id: node.id,
      name: node.name,
      type: node.type,
      properties: node.properties,
      created_at: node.createdAt,
    })),
    communities: communitySummaries.map((summary, index) => ({
      id: `community-${index}`,
      name: primaryEntity ? `Context ${index + 1}` : `Community ${index + 1}`,
      summary,
      level: 0,
      entity_ids: primaryEntity ? [primaryEntity.id] : [],
    })),
  };
}

/**
 * Extract plausible entity names from the user model text.
 * Looks for capitalized multi-word phrases, known tech terms, and
 * noun-like tokens that are likely entity names in the knowledge graph.
 */
function extractEntityNamesFromModel(model: string): string[] {
  const names = new Set<string>();

  // Match capitalized words/phrases (likely proper nouns / project names / tools)
  // e.g. "TypeScript", "Project Atlas", "PostgreSQL", "VS Code"
  const capitalizedPattern = /\b([A-Z][a-zA-Z0-9]*(?:\s+[A-Z][a-zA-Z0-9]*)*)\b/g;
  let match;
  while ((match = capitalizedPattern.exec(model)) !== null) {
    const candidate = match[1].trim();
    // Skip very short or very common words
    if (candidate.length >= 3 && !COMMON_WORDS.has(candidate.toLowerCase())) {
      names.add(candidate);
    }
  }

  return [...names].slice(0, 10);
}

const COMMON_WORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "all", "can", "has",
  "her", "was", "one", "our", "out", "his", "its", "they", "been", "have",
  "this", "that", "with", "from", "will", "also", "user", "uses", "knows",
  "prefers", "works", "model", "expert", "experienced", "strong", "style",
]);

function chooseMode(query: string): MemoryMode {
  const lowered = query.toLowerCase();
  if (lowered.includes("pattern") || lowered.includes("overall") || lowered.includes("across")) {
    return "global";
  }
  // Default to drift (local + community enrichment) for broader recall
  return "drift";
}

export async function addEntity(input: {
  name: string;
  type: string;
  properties?: Record<string, unknown>;
}) {
  const entity = await createEntity({
    id: crypto.randomUUID(),
    name: input.name,
    type: input.type,
    properties: input.properties ?? {},
  });

  return {
    id: entity.id,
    name: entity.name,
    type: entity.type,
    properties: entity.properties,
    created_at: entity.createdAt,
  };
}

export async function addRelationship(input: {
  source: string;
  target: string;
  type: string;
  properties?: Record<string, unknown>;
}) {
  const rel = await createRelationship({
    id: crypto.randomUUID(),
    source: input.source,
    target: input.target,
    type: input.type,
    properties: input.properties ?? {},
  });

  return {
    id: rel.id,
    source: rel.source,
    target: rel.target,
    type: rel.type,
    properties: rel.properties,
    created_at: rel.createdAt,
  };
}

export async function removeEntity(id: string) {
  await deleteEntity(id);
  return { deleted: true, id };
}

export async function getGraph(center?: string, depth: number = 2) {
  if (!center) {
    return { nodes: [], edges: [], depth, center: null };
  }

  const graph = await getEntityNeighborhood(center, depth);
  return {
    nodes: graph.nodes.map((n) => ({
      id: n.id,
      name: n.name,
      type: n.type,
      properties: n.properties,
      created_at: n.createdAt,
    })),
    edges: graph.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: e.type,
      properties: e.properties,
      created_at: e.createdAt,
    })),
    depth,
    center,
  };
}

export async function getCommunities(level: number) {
  const communities = await listCommunities(level);
  return {
    communities: communities.map((c) => ({
      id: c.id,
      name: c.name,
      summary: c.summary,
      level: c.level,
      entity_ids: c.entityIds,
    })),
    level,
  };
}

export async function ingestConversationToGraph(input: {
  sessionId: string;
  messages: Array<{ role: string; content: string }>;
}): Promise<{ affectedEntityIds: string[]; userSignals: string[] }> {
  const conversation = input.messages
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n\n");

  const extracted = await extractMemoryFromConversation(conversation);
  const nameToId = new Map<string, string>();
  const affectedEntityIds: string[] = [];

  for (const entity of extracted.entities ?? []) {
    let existing = await findEntityByName(entity.name);
    if (!existing) {
      existing = await createEntity({
        id: crypto.randomUUID(),
        name: entity.name,
        type: entity.type,
        properties: entity.properties ?? {},
      });
    }
    nameToId.set(entity.name, existing.id);
    affectedEntityIds.push(existing.id);
  }

  for (const relationship of extracted.relationships ?? []) {
    const sourceId = nameToId.get(relationship.source);
    const targetId = nameToId.get(relationship.target);
    if (!sourceId || !targetId) continue;

    await createRelationship({
      id: crypto.randomUUID(),
      source: sourceId,
      target: targetId,
      type: relationship.type,
      properties: relationship.properties ?? { sessionId: input.sessionId },
    });
  }

  return {
    affectedEntityIds: [...new Set(affectedEntityIds)],
    userSignals: extracted.userSignals ?? [],
  };
}

export async function runDreamCycle(limit: number): Promise<{
  processedMessages: number;
  affectedEntityIds: string[];
  userSignals: string[];
}> {
  const recentMessages = await listRecentMessages(limit);
  if (recentMessages.length === 0) {
    return { processedMessages: 0, affectedEntityIds: [], userSignals: [] };
  }

  const conversation = recentMessages
    .map((message) => `[${message.session_id}] ${message.role.toUpperCase()}: ${message.content}`)
    .join("\n\n");

  const dreamed = await dreamFromConversationWindow(conversation);
  const affectedEntityIds: string[] = [];
  const nameToId = new Map<string, string>();

  for (const entity of dreamed.entities ?? []) {
    let existing = await findEntityByName(entity.name);
    if (!existing) {
      existing = await createEntity({
        id: crypto.randomUUID(),
        name: entity.name,
        type: entity.type,
        properties: {
          ...(entity.properties ?? {}),
          inferredBy: "dreaming",
        },
      });
    }
    nameToId.set(entity.name, existing.id);
    affectedEntityIds.push(existing.id);
  }

  for (const relationship of dreamed.relationships ?? []) {
    const sourceId = nameToId.get(relationship.source);
    const targetId = nameToId.get(relationship.target);
    if (!sourceId || !targetId) continue;

    await createRelationship({
      id: crypto.randomUUID(),
      source: sourceId,
      target: targetId,
      type: relationship.type,
      properties: {
        ...(relationship.properties ?? {}),
        inferredBy: "dreaming",
      },
    });
  }

  if (dreamed.communitySummary && affectedEntityIds.length > 0) {
    await upsertCommunity({
      id: crypto.randomUUID(),
      name: dreamed.communityName ?? "Dreamed Insight Cluster",
      summary: dreamed.communitySummary,
      level: 0,
      entityIds: [...new Set(affectedEntityIds)],
    });
  }

  // Create suggested tools (skip duplicates by name)
  for (const toolSuggestion of dreamed.suggestedTools ?? []) {
    const existing = await listTools({ search: toolSuggestion.name, limit: 1 });
    const exactMatch = existing.tools.find(
      (t) => t.name.toLowerCase() === toolSuggestion.name.toLowerCase(),
    );
    if (!exactMatch) {
      await createTool({
        name: toolSuggestion.name,
        description: toolSuggestion.description,
        instructions: toolSuggestion.instructions,
        tags: [...(toolSuggestion.tags ?? []), "dreamed"],
      });
      console.log(`[dreaming] Created tool: ${toolSuggestion.name}`);
    }
  }

  // Create suggested skills (skip duplicates by name)
  for (const skillSuggestion of dreamed.suggestedSkills ?? []) {
    const existing = await listSkills({ search: skillSuggestion.name });
    const exactMatch = existing.skills.find(
      (s) => s.name.toLowerCase() === skillSuggestion.name.toLowerCase(),
    );
    if (!exactMatch) {
      await createSkill({
        name: skillSuggestion.name,
        content: skillSuggestion.content,
        tags: [...(skillSuggestion.tags ?? []), "dreamed"],
      });
      console.log(`[dreaming] Created skill: ${skillSuggestion.name}`);
    }
  }

  const currentUserModel = await getUserModel();
  const updatedUserModel = await compressUserModel(
    currentUserModel.content,
    dreamed.userSignals ?? [],
  );
  await setUserModel(updatedUserModel);

  return {
    processedMessages: recentMessages.length,
    affectedEntityIds: [...new Set(affectedEntityIds)],
    userSignals: dreamed.userSignals ?? [],
  };
}
