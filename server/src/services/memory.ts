import { and, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
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
  createEmbedding,
  dreamFromConversationWindow,
  extractMemoryFromConversation,
} from "./llm.js";
import { setUserModel } from "./identity.js";
import { DEFAULT_PREDICATE_BY_KIND, EXCLUSIVE_PREDICATES, memoryTripleSchema, OPPOSING_PREDICATES, type MemoryTriple } from "./memory_schema.js";
import { createTool, listTools } from "./tools.js";
import { createSkill, listSkills } from "./skills.js";
import { hybridSearch } from "./vector.js";
import { destroySandbox } from "./sandbox.js";

export type MemoryMode = "auto" | "local" | "global" | "drift" | "basic";
export type MemoryItemKind =
  | "fact"
  | "preference"
  | "goal"
  | "project_state"
  | "identity"
  | "constraint"
  | "temporary";
export type MemoryItemStatus = "active" | "candidate" | "superseded" | "stale" | "archived" | "contradicted";
export type MemoryItemScope = "global" | "user" | "session" | "task";
export type MemoryItemSource = "user_explicit" | "assistant_inferred" | "graph_extracted" | "compaction_summary" | "dream_inference";

interface MemoryItemRecord {
  id: string;
  sessionId: string | null;
  kind: MemoryItemKind;
  status: MemoryItemStatus;
  scope: MemoryItemScope;
  sourceType: MemoryItemSource;
  content: string;
  tags: string[];
  confidence: number;
  importance: number;
  reuseCount: number;
  lastRetrievedAt: Date | null;
  lastConfirmedAt: Date | null;
  expiresAt: Date | null;
  supersededBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  subject: string | null;
  predicate: string | null;
  object: string | null;
  metadata: Record<string, unknown>;
}

const DURABLE_USER_MODEL_KINDS: MemoryItemKind[] = ["identity", "preference", "goal", "constraint"];

function normalizeMemoryText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function extractMemoryTriple(content: string, kind?: MemoryItemKind, tags?: string[]): MemoryTriple {
  const normalized = content.trim().replace(/\s+/g, " ");
  const preferenceLike = kind === "preference" || (tags ?? []).some((tag) => tag.toLowerCase() === "preference");
  if (preferenceLike) {
    const preferMatch = normalized.match(/^(?:user|i)\s+(?:prefers?|likes?)\s+(.+)$/i);
    if (preferMatch) return { subject: "user", predicate: "prefers", object: normalizeMemoryText(preferMatch[1]) };
    const avoidMatch = normalized.match(/^(?:user|i)\s+(?:avoids?|dislikes?)\s+(.+)$/i);
    if (avoidMatch) return { subject: "user", predicate: "avoids", object: normalizeMemoryText(avoidMatch[1]) };
  }
  const nameMatch = normalized.match(/^(?:my name is|i am|i'm)\s+(.+)$/i);
  if (nameMatch) return { subject: "user", predicate: "has_name", object: normalizeMemoryText(nameMatch[1]) };
  const workMatch = normalized.match(/^(?:user|i)\s+(?:am working on|work on|working on)\s+(.+)$/i);
  if (workMatch) return { subject: "user", predicate: "works_on", object: normalizeMemoryText(workMatch[1]) };
  const goalMatch = normalized.match(/^(?:user|i)\s+(?:want|need|am trying)\s+(?:to\s+)?(.+)$/i);
  if (goalMatch) return { subject: "user", predicate: "has_goal", object: normalizeMemoryText(goalMatch[1]) };
  const constraintMatch = normalized.match(/^(?:user|i)\s+(?:cannot|can't|must not|should not)\s+(.+)$/i);
  if (constraintMatch) return { subject: "user", predicate: "has_constraint", object: normalizeMemoryText(constraintMatch[1]) };
  const codeMatch = normalized.match(/^(?:.*?code(?: is)?|door code(?: is)?)\s+(.+)$/i);
  if (codeMatch) return { subject: "user", predicate: "has_code", object: normalizeMemoryText(codeMatch[1]) };
  return { subject: kind === "project_state" ? "project" : "memory", predicate: DEFAULT_PREDICATE_BY_KIND[kind ?? "fact"], object: normalizeMemoryText(normalized) };
}

function arePredicatesContradictory(left: MemoryTriple["predicate"], right: MemoryTriple["predicate"]): boolean {
  return OPPOSING_PREDICATES[left]?.includes(right) ?? false;
}

function parseEmbedding(value: unknown): number[] | null {
  if (Array.isArray(value) && value.every((entry) => typeof entry === "number")) return value as number[];
  return null;
}

function classifyExplicitMemory(fact: string, tags?: string[]): {
  kind: MemoryItemKind;
  scope: MemoryItemScope;
  importance: number;
  expiresAt: Date | null;
} {
  const lowerFact = fact.toLowerCase();
  const lowerTags = new Set((tags ?? []).map((tag) => tag.toLowerCase()));

  if (lowerTags.has("preference") || /\bprefer|like|dislike|favorite\b/.test(lowerFact)) {
    return { kind: "preference", scope: "user", importance: 0.95, expiresAt: null };
  }
  if (lowerTags.has("goal") || /\bgoal|want|need to|trying to\b/.test(lowerFact)) {
    return { kind: "goal", scope: "user", importance: 0.9, expiresAt: null };
  }
  if (lowerTags.has("identity") || /\bmy name is|i am|i'm\b/.test(lowerFact)) {
    return { kind: "identity", scope: "user", importance: 1, expiresAt: null };
  }
  if (lowerTags.has("temporary") || lowerTags.has("code") || /\btemporary|until|tomorrow|today|this week|code\b/.test(lowerFact)) {
    return {
      kind: "temporary",
      scope: "session",
      importance: 0.65,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    };
  }
  if (lowerTags.has("project") || /\brepo|branch|project|working on\b/.test(lowerFact)) {
    return { kind: "project_state", scope: "session", importance: 0.8, expiresAt: null };
  }
  return { kind: "fact", scope: "user", importance: 0.8, expiresAt: null };
}

function inferScopeFromQuery(query: string): MemoryItemScope | null {
  const q = query.toLowerCase();
  if (/\bthis session|in this chat|just now\b/.test(q)) return "session";
  if (/\bproject|repo|branch|codebase|implementation\b/.test(q)) return "session";
  if (/\bgoal|preference|who am i|what do you know about me|remember\b/.test(q)) return "user";
  return null;
}

function extractEvidenceScore(metadata: Record<string, unknown>): number {
  const evidence = Array.isArray(metadata?.evidence) ? metadata.evidence : [];
  return Math.min(evidence.length * 0.08, 0.32);
}

function getSourceTrustBonus(sourceType: MemoryItemSource): number {
  switch (sourceType) {
    case "user_explicit":
      return 0.2;
    case "graph_extracted":
      return 0.08;
    case "assistant_inferred":
      return 0.04;
    case "dream_inference":
      return 0.02;
    case "compaction_summary":
      return 0.01;
    default:
      return 0;
  }
}

function getStatusPenalty(status: MemoryItemStatus): number {
  switch (status) {
    case "candidate":
      return 0.22;
    case "stale":
      return 0.35;
    case "contradicted":
      return 0.55;
    case "superseded":
      return 0.45;
    case "archived":
      return 0.6;
    default:
      return 0;
  }
}

function scoreMemoryItem(item: MemoryItemRecord, query: string, expectedScope?: MemoryItemScope | null): number {
  const now = Date.now();
  const createdAgeDays = Math.max(0, (now - item.createdAt.getTime()) / (1000 * 60 * 60 * 24));
  const freshnessPenalty = Math.min(createdAgeDays / 365, 0.35);
  const reuseBonus = Math.min(item.reuseCount * 0.05, 0.25);
  const retrievalBonus = item.lastRetrievedAt ? 0.05 : 0;
  const confirmationBonus = item.lastConfirmedAt ? 0.04 : 0;
  const expiryPenalty = item.expiresAt && item.expiresAt.getTime() < now ? 0.5 : 0;
  const queryNorm = normalizeMemoryText(query);
  const contentNorm = normalizeMemoryText(item.content);
  const exactMatchBonus = contentNorm.includes(queryNorm) || queryNorm.includes(contentNorm) ? 0.2 : 0;
  const scopeBonus = expectedScope && item.scope === expectedScope ? 0.12 : 0;
  const sourceBonus = getSourceTrustBonus(item.sourceType);
  const evidenceBonus = extractEvidenceScore(item.metadata);
  const statusPenalty = getStatusPenalty(item.status);

  return item.importance / 100 + item.confidence / 100 + reuseBonus + retrievalBonus + confirmationBonus + exactMatchBonus + scopeBonus + sourceBonus + evidenceBonus - freshnessPenalty - expiryPenalty - statusPenalty;
}

async function touchMemoryItems(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db
    .update(schema.memoryItems)
    .set({
      reuseCount: sql`${schema.memoryItems.reuseCount} + 1`,
      lastRetrievedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(inArray(schema.memoryItems.id, ids));
}

async function searchMemoryItems(
  query: string,
  limit: number,
  scopeHint?: MemoryItemScope | null,
): Promise<Array<{ id: string; content: string; timestamp: string; kind: MemoryItemKind; scope: MemoryItemScope; sourceType: MemoryItemSource; status: MemoryItemStatus; confidence: number; importance: number; score: number; tags: string[]; metadata: Record<string, unknown> }>> {
  const rows = await db
    .select()
    .from(schema.memoryItems)
    .where(
      and(
        inArray(schema.memoryItems.status, ["active", "candidate"]),
        or(isNull(schema.memoryItems.expiresAt), sql`${schema.memoryItems.expiresAt} > now()`),
        or(
          ilike(schema.memoryItems.content, `%${query}%`),
          sql`${schema.memoryItems.searchVector} @@ plainto_tsquery('english', ${query})`,
        ),
      ),
    )
    .orderBy(desc(schema.memoryItems.importance), desc(schema.memoryItems.updatedAt))
    .limit(limit * 4);

  const scored = rows
    .map((row) => ({
      id: row.id,
      content: row.content,
      timestamp: row.createdAt.toISOString(),
      kind: row.kind as MemoryItemKind,
      scope: row.scope as MemoryItemScope,
      sourceType: row.sourceType as MemoryItemSource,
      status: row.status as MemoryItemStatus,
      confidence: row.confidence,
      importance: row.importance,
      score: scoreMemoryItem(row as MemoryItemRecord, query, scopeHint),
      tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
      metadata: (row.metadata as Record<string, unknown>) ?? {},
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  await touchMemoryItems(scored.map((row) => row.id));
  return scored;
}

async function findSimilarMemoryItems(content: string, embedding: number[] | null, kind: MemoryItemKind, scope: MemoryItemScope, excludeId: string, tripleSubject: string) {
  const rows = await db
    .select()
    .from(schema.memoryItems)
    .where(
      and(
        eq(schema.memoryItems.status, "active"),
        eq(schema.memoryItems.kind, kind),
        eq(schema.memoryItems.scope, scope),
        sql`${schema.memoryItems.id} <> ${excludeId}`,
      ),
    );

  return rows
    .filter((row) => {
      const rowEmbedding = parseEmbedding(row.embedding);
      if (embedding && rowEmbedding) return cosineSimilarity(embedding, rowEmbedding) >= 0.985;
      const rowTriple = memoryTripleSchema.parse({
        subject: (row.subject as string | null) ?? ((row.metadata as Record<string, unknown> | undefined)?.triple as MemoryTriple | undefined)?.subject ?? extractMemoryTriple(row.content, kind).subject,
        predicate: (row.predicate as MemoryTriple["predicate"] | null) ?? ((row.metadata as Record<string, unknown> | undefined)?.triple as MemoryTriple | undefined)?.predicate ?? extractMemoryTriple(row.content, kind).predicate,
        object: (row.object as string | null) ?? ((row.metadata as Record<string, unknown> | undefined)?.triple as MemoryTriple | undefined)?.object ?? extractMemoryTriple(row.content, kind).object,
      });
      return rowTriple.subject === tripleSubject || normalizeMemoryText(row.content) === normalizeMemoryText(content);
    })
    .map((row) => ({ id: row.id, content: row.content, metadata: (row.metadata as Record<string, unknown>) ?? {} }));
}

function triplesEqual(left: MemoryTriple, right: MemoryTriple): boolean {
  return left.subject === right.subject && left.predicate === right.predicate && left.object === right.object;
}

function areTriplesContradictory(left: MemoryTriple, right: MemoryTriple): boolean {
  if (left.subject !== right.subject) return false;
  if (left.predicate === right.predicate && EXCLUSIVE_PREDICATES.has(left.predicate)) return left.object !== right.object;
  if (arePredicatesContradictory(left.predicate, right.predicate)) return left.object === right.object;
  return false;
}

async function supersedeMatchingMemoryItems(content: string, kind: MemoryItemKind, scope: MemoryItemScope, replacementId: string, embedding: number[] | null, triple: MemoryTriple) {
  const similarRows = await findSimilarMemoryItems(content, embedding, kind, scope, replacementId, triple.subject);
  const exactMatches = similarRows.filter((row) => {
    const rowTriple = memoryTripleSchema.parse({
      subject: (row as any).subject ?? (row.metadata?.triple as MemoryTriple | undefined)?.subject ?? extractMemoryTriple(row.content, kind).subject,
      predicate: (row as any).predicate ?? (row.metadata?.triple as MemoryTriple | undefined)?.predicate ?? extractMemoryTriple(row.content, kind).predicate,
      object: (row as any).object ?? (row.metadata?.triple as MemoryTriple | undefined)?.object ?? extractMemoryTriple(row.content, kind).object,
    });
    return triplesEqual(rowTriple, triple);
  });
  const contradictions = similarRows.filter((row) => {
    const rowTriple = memoryTripleSchema.parse({
      subject: (row as any).subject ?? (row.metadata?.triple as MemoryTriple | undefined)?.subject ?? extractMemoryTriple(row.content, kind).subject,
      predicate: (row as any).predicate ?? (row.metadata?.triple as MemoryTriple | undefined)?.predicate ?? extractMemoryTriple(row.content, kind).predicate,
      object: (row as any).object ?? (row.metadata?.triple as MemoryTriple | undefined)?.object ?? extractMemoryTriple(row.content, kind).object,
    });
    return areTriplesContradictory(rowTriple, triple);
  });
  const duplicateCandidates = similarRows.filter((row) => {
    const rowTriple = memoryTripleSchema.parse({
      subject: (row as any).subject ?? (row.metadata?.triple as MemoryTriple | undefined)?.subject ?? extractMemoryTriple(row.content, kind).subject,
      predicate: (row as any).predicate ?? (row.metadata?.triple as MemoryTriple | undefined)?.predicate ?? extractMemoryTriple(row.content, kind).predicate,
      object: (row as any).object ?? (row.metadata?.triple as MemoryTriple | undefined)?.object ?? extractMemoryTriple(row.content, kind).object,
    });
    return rowTriple.subject === triple.subject && rowTriple.predicate === triple.predicate && !triplesEqual(rowTriple, triple) && !areTriplesContradictory(rowTriple, triple);
  });

  if (exactMatches.length > 0) {
    await db.update(schema.memoryItems).set({ status: "superseded", supersededBy: replacementId, updatedAt: new Date() }).where(inArray(schema.memoryItems.id, exactMatches.map((row) => row.id)));
  }

  if (contradictions.length > 0) {
    await db.update(schema.memoryItems).set({ status: "contradicted", supersededBy: replacementId, updatedAt: new Date() }).where(inArray(schema.memoryItems.id, contradictions.map((row) => row.id)));
  }

  if (duplicateCandidates.length > 0) {
    await db.update(schema.memoryItems).set({ status: "archived", supersededBy: replacementId, updatedAt: new Date() }).where(inArray(schema.memoryItems.id, duplicateCandidates.map((row) => row.id)));
  }
}

async function createMemoryItem(input: {
  sessionId?: string;
  content: string;
  tags?: string[];
  sourceType: MemoryItemSource;
  confidence?: number;
  kind?: MemoryItemKind;
  scope?: MemoryItemScope;
  importance?: number;
  expiresAt?: Date | null;
  status?: MemoryItemStatus;
  metadata?: Record<string, unknown>;
}) {
  const classification = classifyExplicitMemory(input.content, input.tags);
  const kind = input.kind ?? classification.kind;
  const scope = input.scope ?? classification.scope;
  const importance = input.importance ?? classification.importance;
  const expiresAt = input.expiresAt ?? classification.expiresAt;

  const embedding = input.content.length > 20 ? await createEmbedding(input.content).catch(() => null) : null;
  const triple = memoryTripleSchema.parse(extractMemoryTriple(input.content, kind, input.tags));

  const [row] = await db
    .insert(schema.memoryItems)
    .values({
      sessionId: input.sessionId ?? null,
      kind,
      status: input.status ?? "active",
      scope,
      sourceType: input.sourceType,
      content: input.content,
      tags: input.tags ?? [],
      confidence: Math.round((input.confidence ?? 1) * 100),
      importance: Math.round(importance * 100),
      expiresAt,
      lastConfirmedAt: new Date(),
      embedding: embedding ?? undefined,
      subject: triple.subject,
      predicate: triple.predicate,
      object: triple.object,
      metadata: { ...(input.metadata ?? {}), triple },
    })
    .returning();

  if ((input.status ?? "active") === "active") {
    await supersedeMatchingMemoryItems(input.content, kind, scope, row.id, embedding, triple);
  }

  return row;
}

async function rebuildUserModelFromMemory(): Promise<string> {
  const rows = await db
    .select()
    .from(schema.memoryItems)
    .where(
      and(
        eq(schema.memoryItems.status, "active"),
        inArray(schema.memoryItems.kind, DURABLE_USER_MODEL_KINDS),
        eq(schema.memoryItems.scope, "user"),
      ),
    )
    .orderBy(desc(schema.memoryItems.importance), desc(schema.memoryItems.updatedAt))
    .limit(40);

  if (rows.length === 0) return "";

  const grouped = new Map<MemoryItemKind, string[]>();
  for (const row of rows) {
    const bucket = grouped.get(row.kind as MemoryItemKind) ?? [];
    if (!bucket.includes(row.content)) bucket.push(row.content);
    grouped.set(row.kind as MemoryItemKind, bucket);
  }

  const sectionOrder: Array<{ kind: MemoryItemKind; title: string }> = [
    { kind: "identity", title: "Identity" },
    { kind: "preference", title: "Preferences" },
    { kind: "goal", title: "Goals" },
    { kind: "constraint", title: "Constraints" },
  ];

  const lines: string[] = [];
  for (const section of sectionOrder) {
    const items = grouped.get(section.kind) ?? [];
    if (items.length === 0) continue;
    lines.push(`## ${section.title}`);
    for (const item of items.slice(0, 10)) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}

async function refreshUserModelFromCuratedMemory(): Promise<void> {
  const content = await rebuildUserModelFromMemory();
  await setUserModel(content);
}

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

export async function archiveExpiredSessions(maxAgeHours: number, idleMinutes: number): Promise<number> {
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

  if (input.content.length > 20) {
    if (input.role === "user") {
      await embedMessageSync(row.id, input.content);
    } else if (input.role === "assistant") {
      embedMessageBackground(row.id, input.content);
    }
  }

  return row;
}

async function embedMessageSync(messageId: string, content: string): Promise<void> {
  try {
    const embedding = await createEmbedding(content);
    await db.update(schema.messages).set({ embedding }).where(eq(schema.messages.id, messageId));
  } catch {
    // Non-fatal
  }
}

function embedMessageBackground(messageId: string, content: string): void {
  createEmbedding(content)
    .then(async (embedding) => {
      await db.update(schema.messages).set({ embedding }).where(eq(schema.messages.id, messageId));
    })
    .catch(() => {
      // Non-fatal
    });
}

export async function searchEpisodes(query: string, limit: number) {
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

export async function storeExplicitMemory(sessionId: string, fact: string, tags?: string[]): Promise<{ id: string; fact: string }> {
  const [messageRow] = await db
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

  await embedMessageSync(messageRow.id, fact);
  const memoryItem = await createMemoryItem({
    sessionId,
    content: fact,
    tags,
    sourceType: "user_explicit",
    status: "active",
    metadata: {
      messageId: messageRow.id,
      migratedFrom: "messages",
      evidence: [{ type: "message", id: messageRow.id }],
    },
  });

  await refreshUserModelFromCuratedMemory();

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
          memoryItemId: memoryItem.id,
        },
      });
    }
  } catch {
    // Non-fatal
  }

  return { id: memoryItem.id, fact };
}

export async function recallMemories(query: string, limit: number = 10): Promise<Array<{ content: string; type: "explicit" | "episode"; timestamp: string }>> {
  const scopeHint = inferScopeFromQuery(query);
  const explicitItems = await searchMemoryItems(query, Math.ceil(limit / 2), scopeHint);
  const explicitResults = explicitItems.map((row) => ({
    content: row.content,
    type: "explicit" as const,
    timestamp: row.timestamp,
  }));

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

export async function runMemoryMaintenance(now: Date = new Date()) {
  const staleCutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const archiveCutoff = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);

  const expiredRows = await db
    .select()
    .from(schema.memoryItems)
    .where(
      and(
        eq(schema.memoryItems.status, "active"),
        sql`${schema.memoryItems.expiresAt} IS NOT NULL`,
        sql`${schema.memoryItems.expiresAt} < ${now.toISOString()}`,
      ),
    );

  const weakRows = await db
    .select()
    .from(schema.memoryItems)
    .where(
      and(
        eq(schema.memoryItems.status, "active"),
        sql`${schema.memoryItems.importance} < 75`,
        sql`${schema.memoryItems.reuseCount} = 0`,
        sql`${schema.memoryItems.createdAt} < ${staleCutoff.toISOString()}`,
      ),
    );

  const staleIds = [...new Set([...expiredRows, ...weakRows].map((row) => row.id))];

  const archiveRows = await db
    .select()
    .from(schema.memoryItems)
    .where(
      and(
        eq(schema.memoryItems.status, "stale"),
        sql`${schema.memoryItems.updatedAt} < ${archiveCutoff.toISOString()}`,
      ),
    );

  if (staleIds.length > 0) {
    await db
      .update(schema.memoryItems)
      .set({ status: "stale", updatedAt: now })
      .where(inArray(schema.memoryItems.id, staleIds));
  }

  if (archiveRows.length > 0) {
    await db
      .update(schema.memoryItems)
      .set({ status: "archived", updatedAt: now })
      .where(inArray(schema.memoryItems.id, archiveRows.map((row) => row.id)));
  }

  await refreshUserModelFromCuratedMemory();
  return { updated: staleIds.length + archiveRows.length };
}

export async function queryMemory(input: {
  query: string;
  mode: MemoryMode;
  limit: number;
  entityFilter?: string[];
  userModel?: string;
}) {
  const mode = input.mode === "auto" ? chooseMode(input.query) : input.mode;
  const modelEntityNames = input.userModel ? extractEntityNamesFromModel(input.userModel) : [];
  const scopeHint = inferScopeFromQuery(input.query);

  const [episodes, candidateEntities, globalSummaries, explicitMemories] = await Promise.all([
    searchEpisodes(input.query, input.limit),
    listEntities({ type: undefined, search: input.query, limit: input.limit }),
    mode === "global" || mode === "drift" ? getAllCommunitySummaries() : Promise.resolve([]),
    searchMemoryItems(input.query, 8, scopeHint),
  ]);

  let modelEntities: Array<{ id: string; name: string; type: string; properties: Record<string, unknown>; createdAt: string }> = [];
  if (candidateEntities.entities.length === 0 && modelEntityNames.length > 0) {
    const modelSearches = await Promise.all(modelEntityNames.slice(0, 5).map((name) => findEntityByName(name).catch(() => null)));
    modelEntities = modelSearches.filter((e): e is NonNullable<typeof e> => e !== null);
  }

  const allCandidates = [...candidateEntities.entities, ...modelEntities];
  const seenIds = new Set<string>();
  const uniqueCandidates = allCandidates.filter((e) => {
    if (seenIds.has(e.id)) return false;
    seenIds.add(e.id);
    return true;
  });

  const graphNodes: Array<{ id: string; name: string; type: string; properties: Record<string, unknown> }> = [];
  const graphEdges: Array<{ source: string; target: string; type: string }> = [];
  const communities: Array<{ id: string; name: string; summary: string; level: number }> = [];
  const seenNodeIds = new Set<string>();
  const seenEdgeIds = new Set<string>();
  const seenCommunityIds = new Set<string>();

  for (const entity of uniqueCandidates.slice(0, Math.max(1, Math.ceil(input.limit / 2)))) {
    const neighborhood = await getEntityNeighborhood(entity.id, mode === "basic" ? 1 : 2);
    for (const node of neighborhood.nodes) {
      if (!seenNodeIds.has(node.id)) {
        seenNodeIds.add(node.id);
        graphNodes.push({ id: node.id, name: node.name, type: node.type, properties: node.properties });
      }
    }
    for (const edge of neighborhood.edges) {
      const edgeKey = `${edge.source}:${edge.type}:${edge.target}`;
      if (!seenEdgeIds.has(edgeKey)) {
        seenEdgeIds.add(edgeKey);
        graphEdges.push({ source: edge.source, target: edge.target, type: edge.type });
      }
    }
    const entitySummaries = await getEntityCommunitySummaries(entity.id);
    for (const summary of entitySummaries) {
      const key = `${entity.id}:${summary}`;
      if (!seenCommunityIds.has(key)) {
        seenCommunityIds.add(key);
        communities.push({ id: key, name: entity.name, summary, level: 0 });
      }
    }
  }

  if (mode === "global" || mode === "drift") {
    for (const summary of globalSummaries) {
      const key = `global:${summary}`;
      if (!seenCommunityIds.has(key)) {
        seenCommunityIds.add(key);
        communities.push({ id: key, name: "global", summary, level: 1 });
      }
    }
  }

  const confirmedFacts = explicitMemories
    .filter((mem) => mem.status === "active" && mem.confidence >= 80)
    .map((mem) => ({
      content: mem.content,
      timestamp: mem.timestamp,
      kind: mem.kind,
      scope: mem.scope,
      score: mem.score,
      tags: mem.tags,
      sourceType: mem.sourceType,
      evidenceCount: Array.isArray(mem.metadata?.evidence) ? mem.metadata.evidence.length : 0,
      trustTier: "confirmed" as const,
    }));

  const workingMemory = explicitMemories
    .filter((mem) => mem.status === "active" && mem.scope === "session")
    .map((mem) => ({
      content: mem.content,
      timestamp: mem.timestamp,
      kind: mem.kind,
      scope: mem.scope,
      score: mem.score,
      tags: mem.tags,
      sourceType: mem.sourceType,
      evidenceCount: Array.isArray(mem.metadata?.evidence) ? mem.metadata.evidence.length : 0,
      trustTier: "working" as const,
    }));

  const inferredMemories = explicitMemories
    .filter((mem) => mem.status !== "active" || mem.confidence < 80)
    .map((mem) => ({
      content: mem.content,
      timestamp: mem.timestamp,
      kind: mem.kind,
      scope: mem.scope,
      score: mem.score,
      tags: mem.tags,
      sourceType: mem.sourceType,
      status: mem.status,
      evidenceCount: Array.isArray(mem.metadata?.evidence) ? mem.metadata.evidence.length : 0,
      trustTier: "inferred" as const,
    }));

  const evidenceEpisodes = episodes.slice(0, Math.max(2, Math.ceil(input.limit / 3))).map((episode) => ({
    content: episode.content,
    timestamp: episode.timestamp,
    role: episode.role,
    trustTier: "evidence" as const,
  }));

  const results = [
    ...confirmedFacts.map((mem) => ({ type: "memory_item", ...mem })),
    ...evidenceEpisodes.map((episode) => ({ type: "episode", ...episode })),
    ...graphNodes.slice(0, input.limit).map((node) => ({ ...node, type: "entity" as const, trustTier: "graph" as const })),
  ].slice(0, input.limit);

  return {
    mode,
    results,
    explicitMemories: confirmedFacts,
    workingMemory,
    inferredMemories,
    evidenceEpisodes,
    entities: uniqueCandidates.map((entity) => ({ id: entity.id, name: entity.name, type: entity.type })),
    graph: { nodes: graphNodes, edges: graphEdges },
    communities,
  };
}

function chooseMode(query: string): MemoryMode {
  const q = query.toLowerCase();
  if (/\bwho am i|what do you know about me|what was my|remember\b/.test(q)) return "drift";
  if (/\bproject|repo|codebase|implementation|feature\b/.test(q)) return "local";
  if (/\btheme|pattern|across conversations|overall\b/.test(q)) return "global";
  return "basic";
}

function extractEntityNamesFromModel(userModel: string): string[] {
  const matches = userModel.match(/\*\*(.*?)\*\*/g) ?? [];
  return matches.map((match) => match.replace(/\*\*/g, "")).filter(Boolean);
}

export async function addEntity(input: { name: string; type: string; properties?: Record<string, unknown> }) {
  return createEntity({
    id: crypto.randomUUID(),
    name: input.name,
    type: input.type,
    properties: input.properties ?? {},
  });
}

export async function removeEntity(id: string) {
  await deleteEntity(id);
  return { deleted: true, id };
}

export async function addRelationship(input: { source: string; target: string; type: string; properties?: Record<string, unknown> }) {
  return createRelationship({
    id: crypto.randomUUID(),
    source: input.source,
    target: input.target,
    type: input.type,
    properties: input.properties ?? {},
  });
}

export async function getCommunities(level?: number) {
  return listCommunities(level);
}

export async function getGraph(center?: string, depth: number = 2) {
  if (center) {
    return getEntityNeighborhood(center, depth);
  }
  const entities = await listEntities({ limit: 100, search: undefined, type: undefined });
  return { nodes: entities.entities, edges: [] };
}

export async function ingestConversationToGraph(input: {
  sessionId: string;
  messages: Array<{ role: string; content: string }>;
}) {
  const conversation = input.messages.map((message) => `${message.role}: ${message.content}`).join("\n");
  const extraction = await extractMemoryFromConversation(conversation);
  const createdEntities: Array<{ id: string; name: string; type: string }> = [];

  for (const entity of extraction.entities ?? []) {
    const existing = await findEntityByName(entity.name);
    if (existing) {
      createdEntities.push({ id: existing.id, name: existing.name, type: existing.type });
      continue;
    }
    const created = await createEntity({
      id: crypto.randomUUID(),
      name: entity.name,
      type: entity.type,
      properties: entity.properties ?? {},
    });
    createdEntities.push({ id: created.id, name: created.name, type: created.type });
  }

  for (const rel of extraction.relationships ?? []) {
    const source = createdEntities.find((entity) => entity.name === rel.source);
    const target = createdEntities.find((entity) => entity.name === rel.target);
    if (source && target) {
      await createRelationship({
        id: crypto.randomUUID(),
        source: source.id,
        target: target.id,
        type: rel.type,
        properties: rel.properties ?? {},
      });
    }
  }

  const extractionWithCommunity = extraction as typeof extraction & { communityName?: string; communitySummary?: string };

  if (extractionWithCommunity.communitySummary && createdEntities.length > 0) {
    await upsertCommunity({
      id: crypto.randomUUID(),
      name: extractionWithCommunity.communityName ?? "Conversation Cluster",
      summary: extractionWithCommunity.communitySummary,
      level: 1,
      entityIds: createdEntities.map((entity) => entity.id),
    });
  }

  for (const signal of extraction.userSignals ?? []) {
    await createMemoryItem({
      sessionId: input.sessionId,
      content: signal,
      sourceType: "assistant_inferred",
      status: "candidate",
      confidence: 0.65,
      metadata: {
        inferredFrom: "conversation_extraction",
        evidence: [{ type: "conversation", sessionId: input.sessionId }],
      },
    }).catch(() => undefined);
  }

  await refreshUserModelFromCuratedMemory();

  return {
    entities: createdEntities,
    relationships: extraction.relationships ?? [],
    communitySummary: extractionWithCommunity.communitySummary ?? null,
    affectedEntityIds: createdEntities.map((entity) => entity.id),
  };
}

export async function runDreamCycle() {
  const recentMessages = await db
    .select()
    .from(schema.messages)
    .orderBy(desc(schema.messages.createdAt))
    .limit(20);

  const ordered = [...recentMessages].reverse().map((message) => ({ role: message.role, content: message.content }));
  const conversationText = ordered.map((message) => `${message.role}: ${message.content}`).join("\n");
  const dream = await dreamFromConversationWindow(conversationText);

  for (const skill of dream.suggestedSkills ?? []) {
    const existing = await listSkills({ search: skill.name, tag: null });
    if (existing.skills.length === 0) {
      await createSkill({ name: skill.name, content: skill.content, tags: skill.tags ?? [] }).catch(() => undefined);
    }
  }

  for (const tool of dream.suggestedTools ?? []) {
    const existing = await listTools({ search: tool.name, tag: null });
    if (existing.tools.length === 0) {
      await createTool({
        name: tool.name,
        description: tool.description,
        instructions: tool.instructions,
        tags: tool.tags ?? [],
      }).catch(() => undefined);
    }
  }

  for (const signal of dream.userSignals ?? []) {
    await createMemoryItem({
      content: signal,
      sourceType: "dream_inference",
      status: "candidate",
      confidence: 0.55,
      metadata: {
        inferredFrom: "dream_cycle",
        evidence: [{ type: "dream_cycle" }],
      },
    }).catch(() => undefined);
  }

  await refreshUserModelFromCuratedMemory();
  return dream;
}
