---
layout: layouts/docs.njk
title: Memory System
description: GraphRAG knowledge graph, query modes, and context compaction
---

# Memory System

Kraken's memory is what separates it from every other agent. While most systems treat memory as a flat list of facts crammed into the context window, Kraken builds a **structured knowledge graph** that it queries intelligently based on what you're actually asking.

## Memory Tiers

Kraken organizes memory into six tiers, inspired by how human cognition works:

| Tier | Storage | Purpose |
|------|---------|---------|
| **Working Memory** | In-context | Current conversation + retrieved context. Limited by the model's context window (max 80% of budget). |
| **Entity Memory** | Neo4j | Structured knowledge — people, projects, tools, concepts, goals — with typed relationships. |
| **Community Memory** | Neo4j | Hierarchical clusters of related entities, each with an LLM-generated summary for holistic reasoning. |
| **Episodic Memory** | PostgreSQL | Every message ever exchanged. Searchable via full-text search and vector similarity. |
| **User Model** | PostgreSQL | A structured, auto-maintained document capturing your preferences, expertise, communication style, and goals. |
| **Skill Memory** | PostgreSQL | Learned procedures. The top 3 matching skills are loaded per query via embedding similarity. |

### Why tiers matter

Flat memory systems have one strategy: dump everything into context. This fails in two ways:

1. **Context overflow** — you hit the token limit and start losing information
2. **Noise** — irrelevant memories dilute the signal

Kraken's tiered approach means:

- **Entity Memory** answers "what do you know about X?"
- **Community Memory** answers "what are the big themes?"
- **Episodic Memory** answers "what did we discuss last Tuesday?"
- **User Model** answers "how does this person prefer to work?"
- **Skill Memory** answers "have I done something similar before?"

Each tier is queried differently, and only relevant information enters the context window.

---

## The Knowledge Graph

Every conversation is automatically mined for structured information by background workers.

### Entities

Typed nodes representing things the agent has learned about:

| Type | Examples |
|------|----------|
| `person` | "Alice", "Bob from the design team" |
| `project` | "Kraken Agent", "Q4 migration" |
| `tool` | "PostgreSQL", "Figma", "Docker" |
| `concept` | "GraphRAG", "event sourcing", "CQRS" |
| `goal` | "Ship v2 by March", "Learn Rust" |
| `preference` | "Prefers concise answers", "Uses dark mode" |

Each entity has a name, type, optional properties (JSON), and timestamps.

### Relationships

Directed edges connecting entities:

| Type | Example |
|------|---------|
| `works_on` | Alice → Kraken Agent |
| `uses` | Kraken Agent → PostgreSQL |
| `prefers` | Alice → concise answers |
| `relates_to` | GraphRAG → knowledge graphs |
| `has_goal` | Alice → Ship v2 by March |
| `knows_about` | Alice → event sourcing |
| `depends_on` | Q4 migration → PostgreSQL |

### Communities

Groups of related entities detected by the Leiden clustering algorithm. Each community gets an LLM-generated summary that captures the theme of the cluster.

Communities are **hierarchical** — a top-level community might be "Alice's work," containing sub-communities for each project, each with their own entity clusters.

This enables queries like "give me a high-level overview of everything you know" — the agent reads community summaries instead of scanning thousands of individual entities.

---

## Query Modes

When Kraken retrieves memory for a conversation, it uses one of five query modes:

### `auto` (default)

The agent analyzes query intent and routes to the best strategy. This is what you should use unless you have a specific reason to choose a mode.

### `local`

Best for: **specific entity questions** ("What do you know about Project X?")

1. Find the entity matching the query
2. Fan out to direct neighbors (1-2 hops)
3. Gather properties and relationship context
4. Return a focused, entity-centric result

### `global`

Best for: **holistic / overview questions** ("What patterns do you see in my work?")

1. Map the query over all community summaries
2. Score each community's relevance
3. Reduce the top results into a synthesized answer
4. Returns broad, thematic insights

### `drift`

Best for: **entity + broader context** ("Tell me about Project X and how it fits into the bigger picture")

Combines local entity search with community-level context enrichment. Starts at a specific entity but drifts outward to capture the surrounding theme.

### `basic`

Best for: **simple factual recall** ("What's Alice's email?")

Pure vector similarity search over stored messages. Fast, no graph traversal. Good for exact-match recall.

---

## How Memory Extraction Works

After every conversation, a background worker analyzes the messages:

```
Conversation messages
        ↓
   LLM extraction prompt
   "Extract entities and relationships from this conversation"
        ↓
   Structured output: entities[] + relationships[]
        ↓
   Merge into Neo4j (upsert — update existing, create new)
        ↓
   If graph changed → trigger community re-clustering
        ↓
   Updated community summaries
```

This runs asynchronously — the user sees no delay. The knowledge graph grows silently in the background.

### Entity merging

When the extractor finds an entity that already exists (by name + type), it **merges** rather than duplicating. Properties are updated, timestamps refreshed, and new relationships are added alongside existing ones.

### Community detection

After entities are added or relationships change, the Leiden algorithm re-clusters the graph. Communities that changed get fresh LLM-generated summaries. This keeps the holistic view current without reprocessing the entire graph.

---

## Context Compaction

When a conversation approaches the token limit (`KRAKEN_COMPACTION_THRESHOLD_TOKENS`, default 80,000), Kraken performs context compaction:

### Step 1: Pre-flush

Before summarizing anything, Kraken runs a silent "pre-flush" pass:

- Analyzes the conversation for important facts, decisions, and context
- Persists them to the knowledge graph as entities and relationships
- This ensures nothing is lost when older messages are summarized

### Step 2: Summarize

Older messages (everything except the most recent `KRAKEN_COMPACTION_KEEP_RECENT`, default 10) are summarized into a compact digest by the LLM. The summary replaces the old messages in context.

### The result

The conversation continues seamlessly. The user notices nothing. But behind the scenes, Kraken has:

1. Persisted key facts to the knowledge graph (permanent)
2. Compressed the conversation context (for this session)
3. Kept recent messages intact (for continuity)

No other agent system does this. Most just truncate and hope for the best.

---

## Dream Cycle

Every 15 minutes (configurable via `KRAKEN_DREAM_CRON`), Kraken runs an offline consolidation cycle:

1. Reviews recent conversations that haven't been fully processed
2. Strengthens connections between entities
3. Identifies gaps or inconsistencies in the knowledge graph
4. Suggests new skills or tools based on observed patterns

Think of it as the agent "sleeping" — consolidating short-term experiences into long-term knowledge.

---

## Querying Memory via the API

### Python SDK

```python
# Auto mode — let Kraken choose the best strategy
results = client.memory.query("What do you know about my projects?")

# Specific mode
results = client.memory.query(
    "What are the common themes in my work?",
    mode="global",
)

# With filters
results = client.memory.query(
    "What tools does Alice use?",
    entity_filter=["Alice"],
    limit=10,
)
```

### REST API

```bash
curl -X POST http://localhost:8080/v1/memory/query \
  -H "Authorization: Bearer $KRAKEN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What do you know about my projects?",
    "mode": "auto",
    "limit": 20
  }'
```

See the [API Reference](../guide/api-reference.md) for complete endpoint documentation.
