import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  insertedMemoryItems: [] as any[],
  updatedMemoryItems: [] as any[],
  searchRows: [] as any[],
  insertedMessages: [] as any[],
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

  const chain = {
    values(payload: any) {
      this.payload = payload;
      return this;
    },
    returning() {
      if (this.payload.content && this.payload.role === "system") {
        const row = {
          id: `msg-${state.insertedMessages.length + 1}`,
          ...this.payload,
          createdAt: new Date("2026-01-01T00:00:00Z"),
        };
        state.insertedMessages.push(row);
        return Promise.resolve([row]);
      }
      const row = {
        id: `mem-${state.insertedMemoryItems.length + 1}`,
        ...this.payload,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
        reuseCount: this.payload.reuseCount ?? 0,
      };
      state.insertedMemoryItems.push(row);
      return Promise.resolve([row]);
    },
  };

  const db = {
    insert(table: any) {
      return Object.create(chain);
    },
    update(table: any) {
      return {
        set(values: any) {
          return {
            where() {
              state.updatedMemoryItems.push(values);
              return {
                returning: async () => [],
              };
            },
            returning: async () => [],
          };
        },
      };
    },
    select() {
      return {
        from() {
          return {
            where() {
              return {
                orderBy() {
                  return {
                    limit() {
                      return Promise.resolve(state.searchRows);
                    },
                  };
                },
              };
            },
            orderBy() {
              return { limit: async () => [] };
            },
          };
        },
      };
    },
    execute: async () => ({ rows: [] }),
    query: {
      sessions: { findFirst: async () => null },
    },
  };

  return { db, schema };
});

vi.mock("./llm.js", () => ({
  createEmbedding: vi.fn(async () => new Array(1536).fill(0.1)),
  compressUserModel: vi.fn(async (current: string) => current),
  dreamFromConversationWindow: vi.fn(async () => ({ skills: [], tools: [], userSignals: [] })),
  extractMemoryFromConversation: vi.fn(async () => ({ entities: [], relationships: [], userSignals: [] })),
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
  getUserModel: vi.fn(async () => ({ content: "" })),
  setUserModel: vi.fn(async () => undefined),
}));

vi.mock("./tools.js", () => ({ createTool: vi.fn(), listTools: vi.fn(async () => ({ tools: [] })) }));
vi.mock("./skills.js", () => ({ createSkill: vi.fn(), listSkills: vi.fn(async () => ({ skills: [] })) }));
vi.mock("./vector.js", () => ({ hybridSearch: vi.fn(async () => []) }));
vi.mock("./sandbox.js", () => ({ destroySandbox: vi.fn(async () => undefined) }));

import { recallMemories, runMemoryMaintenance, storeExplicitMemory } from "./memory.js";

describe("curated memory items", () => {
  beforeEach(() => {
    state.insertedMemoryItems = [];
    state.updatedMemoryItems = [];
    state.searchRows = [];
    state.insertedMessages = [];
    vi.clearAllMocks();
  });

  it("stores explicit memories as curated memory items with lifecycle metadata", async () => {
    const result = await storeExplicitMemory("session-1", "User prefers short answers", ["preference"]);

    expect(result.id).toBe("mem-1");
    expect(state.insertedMessages).toHaveLength(1);
    expect(state.insertedMemoryItems).toHaveLength(1);
    expect(state.insertedMemoryItems[0].kind).toBe("preference");
    expect(state.insertedMemoryItems[0].scope).toBe("user");
    expect(state.insertedMemoryItems[0].status).toBe("active");
    expect(state.insertedMemoryItems[0].confidence).toBe(100);
    expect(state.insertedMemoryItems[0].importance).toBe(95);
  });

  it("recallMemories prioritizes curated explicit memory items", async () => {
    state.searchRows = [
      {
        id: "mem-1",
        content: "User prefers short answers",
        kind: "preference",
        tags: ["preference"],
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

  it("maintenance marks expired or unused low-importance memories as stale", async () => {
    const result = await runMemoryMaintenance(new Date("2026-06-01T00:00:00Z"));
    expect(result).toEqual({ updated: 0 });
    expect(state.updatedMemoryItems[0].status).toBe("stale");
  });
});
