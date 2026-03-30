import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  memoryRows: [] as any[],
  searchRows: [] as any[],
  insertedMessages: [] as any[],
  updatedMemoryItems: [] as any[],
  userModelContent: "",
};

vi.mock("../db/index.js", () => {
  const schema = {
    memoryItems: {
      id: "id",
      sessionId: "session_id",
      kind: "kind",
      status: "status",
      scope: "scope",
      sourceType: "source_type",
      content: "content",
      tags: "tags",
      confidence: "confidence",
      importance: "importance",
      reuseCount: "reuse_count",
      lastRetrievedAt: "last_retrieved_at",
      lastConfirmedAt: "last_confirmed_at",
      expiresAt: "expires_at",
      supersededBy: "superseded_by",
      embedding: "embedding",
      searchVector: "search_vector",
      metadata: "metadata",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
    messages: {
      id: "id",
      sessionId: "session_id",
      createdAt: "created_at",
      content: "content",
      embedding: "embedding",
    },
    sessions: {
      id: "id",
      sessionKey: "session_key",
      name: "name",
      updatedAt: "updated_at",
      createdAt: "created_at",
      archived: "archived",
      lastActiveAt: "last_active_at",
    },
  };

  const db = {
    insert(table: any) {
      return {
        values(payload: any) {
          return {
            returning: async () => {
              if (table === schema.messages) {
                const row = {
                  id: `msg-${state.insertedMessages.length + 1}`,
                  ...payload,
                  createdAt: new Date("2026-01-01T00:00:00Z"),
                };
                state.insertedMessages.push(row);
                return [row];
              }

              const row = {
                id: `mem-${state.memoryRows.length + 1}`,
                reuseCount: 0,
                createdAt: new Date("2026-01-01T00:00:00Z"),
                updatedAt: new Date("2026-01-01T00:00:00Z"),
                ...payload,
              };
              state.memoryRows.push(row);
              return [row];
            },
          };
        },
      };
    },
    update(table: any) {
      return {
        set(values: any) {
          return {
            where: async () => {
              state.updatedMemoryItems.push(values);
              if (table === schema.memoryItems && values.status === "stale") {
                for (const row of state.memoryRows) {
                  if (row.status === "active") row.status = "stale";
                }
              }
              if (table === schema.memoryItems && values.embedding) {
                const row = state.memoryRows[state.memoryRows.length - 1];
                if (row) row.embedding = values.embedding;
              }
              if (table === schema.memoryItems && values.lastRetrievedAt) {
                for (const row of state.searchRows) {
                  row.reuseCount = (row.reuseCount ?? 0) + 1;
                  row.lastRetrievedAt = values.lastRetrievedAt;
                }
              }
              return [];
            },
            returning: async () => [],
          };
        },
      };
    },
    select() {
      return {
        from(table: any) {
          const rowsForTable = () => {
            if (table === schema.memoryItems) return state.searchRows.length ? state.searchRows : state.memoryRows;
            return [];
          };

          return {
            where() {
              return {
                orderBy() {
                  return {
                    limit: async () => rowsForTable(),
                  };
                },
                limit: async () => rowsForTable(),
                then: (resolve: any) => Promise.resolve(rowsForTable()).then(resolve),
              };
            },
            orderBy() {
              return {
                limit: async () => [],
                offset: async () => [],
              };
            },
            limit: async () => rowsForTable(),
          };
        },
      };
    },
    execute: async () => ({ rows: [] }),
    delete() {
      return { where: async () => ({ returning: async () => [] }) };
    },
    query: {
      sessions: { findFirst: async () => null },
    },
  };

  return { db, schema };
});

vi.mock("./llm.js", () => ({
  createEmbedding: vi.fn(async () => new Array(1536).fill(0.1)),
  dreamFromConversationWindow: vi.fn(async () => ({ skills: [], tools: [], userSignals: ["User likes direct answers"] })),
  extractMemoryFromConversation: vi.fn(async () => ({ entities: [], relationships: [], userSignals: ["User prefers short answers"] })),
}));

vi.mock("./graph.js", () => ({
  createEntity: vi.fn(async (entity: any) => ({ ...entity, createdAt: new Date().toISOString() })),
  createRelationship: vi.fn(),
  deleteEntity: vi.fn(),
  findEntityByName: vi.fn(async () => null),
  getAllCommunitySummaries: vi.fn(async () => []),
  getEntityCommunitySummaries: vi.fn(async () => []),
  getEntityNeighborhood: vi.fn(async () => ({ nodes: [], edges: [] })),
  listCommunities: vi.fn(async () => []),
  listEntities: vi.fn(async () => ({ entities: [], total: 0 })),
  upsertCommunity: vi.fn(),
}));

vi.mock("./identity.js", () => ({
  setUserModel: vi.fn(async (content: string) => {
    state.userModelContent = content;
  }),
}));

vi.mock("./tools.js", () => ({ createTool: vi.fn(), listTools: vi.fn(async () => ({ tools: [] })) }));
vi.mock("./skills.js", () => ({ createSkill: vi.fn(), listSkills: vi.fn(async () => ({ skills: [] })) }));
vi.mock("./vector.js", () => ({ hybridSearch: vi.fn(async () => []) }));
vi.mock("./sandbox.js", () => ({ destroySandbox: vi.fn(async () => undefined) }));

import { ingestConversationToGraph, queryMemory, recallMemories, runDreamCycle, runMemoryMaintenance, storeExplicitMemory } from "./memory.js";

describe("curated memory items", () => {
  beforeEach(() => {
    state.memoryRows = [];
    state.searchRows = [];
    state.insertedMessages = [];
    state.updatedMemoryItems = [];
    state.userModelContent = "";
    vi.clearAllMocks();
  });

  it("stores explicit memories as active curated memory items with provenance and refreshes user model", async () => {
    const result = await storeExplicitMemory("session-1", "User prefers short answers", ["preference"]);

    expect(result.id).toBe("mem-1");
    expect(state.insertedMessages).toHaveLength(1);
    expect(state.memoryRows).toHaveLength(1);
    expect(state.memoryRows[0].kind).toBe("preference");
    expect(state.memoryRows[0].scope).toBe("user");
    expect(state.memoryRows[0].status).toBe("active");
    expect(state.memoryRows[0].metadata.evidence[0].id).toBe("msg-1");
    expect(state.userModelContent).toContain("User prefers short answers");
  });

  it("recallMemories prioritizes curated explicit memory items", async () => {
    state.searchRows = [
      {
        id: "mem-1",
        content: "User prefers short answers",
        kind: "preference",
        scope: "user",
        sourceType: "user_explicit",
        status: "active",
        tags: ["preference"],
        metadata: {},
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
        confidence: 100,
        importance: 95,
        reuseCount: 0,
        lastRetrievedAt: null,
        expiresAt: null,
      },
    ];

    const results = await recallMemories("short answers", 5);
    expect(results[0]).toEqual({
      content: "User prefers short answers",
      type: "explicit",
      timestamp: "2026-01-01T00:00:00.000Z",
    });
    expect(state.updatedMemoryItems.length).toBeGreaterThan(0);
  });

  it("queryMemory separates confirmed and inferred memories", async () => {
    state.searchRows = [
      {
        id: "mem-1",
        content: "User prefers short answers",
        kind: "preference",
        scope: "user",
        sourceType: "user_explicit",
        status: "active",
        tags: ["preference"],
        metadata: {},
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
        confidence: 100,
        importance: 95,
        reuseCount: 0,
        lastRetrievedAt: null,
        expiresAt: null,
      },
      {
        id: "mem-2",
        content: "User likes direct answers",
        kind: "preference",
        scope: "user",
        sourceType: "dream_inference",
        status: "candidate",
        tags: [],
        metadata: {},
        createdAt: new Date("2026-01-02T00:00:00Z"),
        updatedAt: new Date("2026-01-02T00:00:00Z"),
        confidence: 55,
        importance: 70,
        reuseCount: 0,
        lastRetrievedAt: null,
        expiresAt: null,
      },
    ];

    const result = await queryMemory({ query: "preferences", mode: "auto", limit: 5, userModel: "" });
    expect(result.explicitMemories).toHaveLength(1);
    expect(result.explicitMemories[0].content).toBe("User prefers short answers");
    expect(result.inferredMemories).toHaveLength(1);
    expect(result.inferredMemories[0].content).toBe("User likes direct answers");
  });


  it("queryMemory ranks explicit memories with stronger provenance above weak inferred ones", async () => {
    state.searchRows = [
      {
        id: "mem-1",
        content: "User prefers short practical answers",
        kind: "preference",
        scope: "user",
        sourceType: "user_explicit",
        status: "active",
        tags: ["preference"],
        metadata: { evidence: [{ type: "message", id: "msg-1" }, { type: "message", id: "msg-2" }] },
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-02T00:00:00Z"),
        confidence: 100,
        importance: 95,
        reuseCount: 2,
        lastRetrievedAt: new Date("2026-01-03T00:00:00Z"),
        lastConfirmedAt: new Date("2026-01-03T00:00:00Z"),
        expiresAt: null,
      },
      {
        id: "mem-2",
        content: "User maybe enjoys long theoretical digressions",
        kind: "preference",
        scope: "user",
        sourceType: "dream_inference",
        status: "candidate",
        tags: [],
        metadata: { evidence: [{ type: "dream_cycle" }] },
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
        confidence: 55,
        importance: 70,
        reuseCount: 0,
        lastRetrievedAt: null,
        lastConfirmedAt: null,
        expiresAt: null,
      },
    ];

    const result = await queryMemory({ query: "practical answers", mode: "auto", limit: 5, userModel: "" });
    expect(result.explicitMemories[0].content).toBe("User prefers short practical answers");
    expect(result.explicitMemories[0].evidenceCount).toBe(2);
    expect(result.inferredMemories[0].content).toBe("User maybe enjoys long theoretical digressions");
  });

  it("maintenance marks expired or weak memories as stale and archives long-stale memories", async () => {
    state.memoryRows = [
      {
        id: "mem-1",
        content: "Temporary code is 4821",
        kind: "temporary",
        scope: "session",
        sourceType: "user_explicit",
        status: "active",
        tags: ["temporary"],
        metadata: {},
        createdAt: new Date("2025-01-01T00:00:00Z"),
        updatedAt: new Date("2025-01-01T00:00:00Z"),
        confidence: 100,
        importance: 60,
        reuseCount: 0,
        lastRetrievedAt: null,
        expiresAt: new Date("2025-02-01T00:00:00Z"),
      },
      {
        id: "mem-2",
        content: "Old stale preference",
        kind: "preference",
        scope: "user",
        sourceType: "assistant_inferred",
        status: "stale",
        tags: [],
        metadata: {},
        createdAt: new Date("2025-01-01T00:00:00Z"),
        updatedAt: new Date("2025-01-15T00:00:00Z"),
        confidence: 50,
        importance: 50,
        reuseCount: 0,
        lastRetrievedAt: null,
        expiresAt: null,
      },
    ];

    const result = await runMemoryMaintenance(new Date("2026-06-01T00:00:00Z"));
    expect(result).toEqual({ updated: 4 });
    expect(state.updatedMemoryItems.some((item) => item.status === "stale")).toBe(true);
    expect(state.updatedMemoryItems.some((item) => item.status === "archived")).toBe(true);
  });

  it("ingestConversationToGraph stores candidate inferred memories instead of directly mutating the user model", async () => {
    await ingestConversationToGraph({ sessionId: "session-1", messages: [{ role: "user", content: "I prefer short answers" }] });
    expect(state.memoryRows).toHaveLength(1);
    expect(state.memoryRows[0].status).toBe("candidate");
    expect(state.memoryRows[0].sourceType).toBe("assistant_inferred");
  });

  it("runDreamCycle stores dream inferences as candidate memories", async () => {
    await runDreamCycle();
    expect(state.memoryRows).toHaveLength(1);
    expect(state.memoryRows[0].sourceType).toBe("dream_inference");
    expect(state.memoryRows[0].status).toBe("candidate");
  });
});


describe("memory item consolidation", () => {

  it("stores structured triples and uses embedding-backed duplicate archival", async () => {
    state.memoryRows = [{
      id: "mem-old",
      sessionId: "session-1",
      content: "User prefers short practical answers",
      kind: "preference",
      scope: "user",
      sourceType: "user_explicit",
      status: "active",
      tags: ["preference"],
      metadata: { triple: { subject: "user", predicate: "prefers", object: "short practical answers" } },
      embedding: new Array(1536).fill(0.1),
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
      confidence: 100,
      importance: 95,
      reuseCount: 0,
      lastRetrievedAt: null,
      lastConfirmedAt: null,
      expiresAt: null,
      supersededBy: null,
    }];

    await storeExplicitMemory("session-1", "User prefers short practical replies", ["preference"]);
    expect(state.memoryRows[1].metadata.triple).toEqual({ subject: "user", predicate: "prefers", object: "short practical replies" });
    expect(state.updatedMemoryItems.some((item) => item.status === "superseded")).toBe(true);
  });

  it("marks structured same-predicate conflicts as contradicted", async () => {
    state.memoryRows = [{
      id: "mem-old-name",
      sessionId: "session-1",
      content: "My name is Lars",
      kind: "identity",
      scope: "user",
      sourceType: "user_explicit",
      status: "active",
      tags: ["identity"],
      metadata: { triple: { subject: "user", predicate: "has_name", object: "lars" } },
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
      confidence: 100,
      importance: 100,
      reuseCount: 0,
      lastRetrievedAt: null,
      lastConfirmedAt: null,
      expiresAt: null,
      supersededBy: null,
    }];

    await storeExplicitMemory("session-1", "My name is Rowan", ["identity"]);
    expect(state.updatedMemoryItems.some((item) => item.status === "contradicted")).toBe(true);
  });
  it("marks contradictory memories when a new explicit fact conflicts", async () => {
    state.memoryRows = [{
      id: "mem-old",
      sessionId: "session-1",
      content: "User likes long explanations",
      kind: "preference",
      scope: "user",
      sourceType: "user_explicit",
      status: "active",
      tags: ["preference"],
      metadata: {},
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
      confidence: 100,
      importance: 95,
      reuseCount: 0,
      lastRetrievedAt: null,
      lastConfirmedAt: null,
      expiresAt: null,
      supersededBy: null,
    }];

    await storeExplicitMemory("session-1", "User dislikes long explanations", ["preference"]);
    expect(state.updatedMemoryItems.some((item) => item.status === "contradicted")).toBe(true);
  });
});
