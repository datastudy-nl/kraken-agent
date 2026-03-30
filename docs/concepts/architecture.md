---
layout: layouts/docs.njk
title: Architecture
description: System overview, components, and data flow
---

# Architecture

Kraken is a self-contained stack that runs via Docker Compose. No external services, no third-party memory providers, no vendor lock-in. Every component runs on your infrastructure.

## System Overview

```
Your App (Python SDK / any HTTP client)
               │
               ▼
┌─────────────────────────────────────┐
│         Kraken API  (Hono)          │
│     REST + WebSocket + streaming    │
│     OpenAI-compatible /v1/chat/*    │
└──────────────┬──────────────────────┘
               │
    ┌──────────┼──────────────────────────────┐
    │          │                               │
    ▼          ▼                               ▼
┌────────┐ ┌─────────────────────┐  ┌──────────────────┐
│ Worker │ │   PostgreSQL 17     │  │    Neo4j 5       │
│(BullMQ)│ │   + pgvector        │  │ (knowledge graph)│
│        │ │                     │  │                  │
│ Jobs:  │ │ • Sessions          │  │ • Entities       │
│ • Extract entities             │  │ • Relationships  │
│ • Detect communities           │  │ • Communities    │
│ • Update user model            │  │                  │
│ • Reflect on skills            │  │                  │
│ • Dream cycle                  │  │                  │
│ • Execute schedules            │  │                  │
└────────┘ └─────────────────────┘  └──────────────────┘
               │
    ┌──────────┼──────────┐
    ▼          ▼          ▼
┌────────┐ ┌────────┐ ┌──────────┐
│ Redis 7│ │Chromium│ │ Sandbox  │
│(queues │ │(browser│ │ (Docker  │
│ cache) │ │ CDP)   │ │ isolate) │
└────────┘ └────────┘ └──────────┘
```

## Components

### Kraken API

The core HTTP server built on [Hono](https://hono.dev/). Handles all client-facing requests:

- **Chat** — `/v1/chat` (native) and `/v1/chat/completions` (OpenAI-compatible). Assembles context from SOUL.md, user model, memory retrieval, and relevant skills before calling the LLM.
- **Memory** — Query the knowledge graph, manage entities and relationships, explore communities.
- **Identity** — Read/write SOUL.md personality, view the auto-maintained user model, manage cross-platform identity links.
- **Sessions** — CRUD for conversation sessions with stable routing keys.
- **Skills** — Manage reusable procedure documents that the agent loads by relevance.
- **Tools** — Registry of available tools with JSON Schema definitions.
- **Schedules** — Create and manage cron-based automated tasks.

The API calls the LLM via the [Vercel AI SDK](https://sdk.vercel.ai/), which abstracts over OpenAI, Anthropic, and other providers.

### Worker

A separate Node.js process that consumes jobs from Redis via [BullMQ](https://docs.bullmq.io/). Runs asynchronously so the API stays fast:

| Job | Trigger | What it does |
|-----|---------|-------------|
| **memory-extraction** | After every chat | Extracts entities and relationships from the conversation |
| **memory-communities** | After entities extracted | Re-clusters the knowledge graph using community detection, updates hierarchical summaries |
| **memory-user-model** | After every chat | Compresses new signals into the persistent user model |
| **skill-reflection** | After chat (conditional) | Evaluates if the conversation produced a reusable workflow, creates or updates a skill |
| **memory-dream** | Every 15 min (configurable) | Offline consolidation — reviews recent conversations, suggests skills/tools, strengthens graph connections |
| **schedule-execution** | Every minute (cron tick) | Executes due scheduled tasks as new sessions |

### PostgreSQL + pgvector

The primary relational store. Holds:

- **Sessions** — with stable `session_key` for routing, personality overlays, metadata
- **Messages** — with pgvector embeddings for semantic search, full-text search index on content
- **Skills** — versioned procedure documents with embeddings for relevance matching
- **Tools** — registered tool schemas with embeddings
- **Identity** — SOUL.md content, user model, AGENTS.md
- **Schedules** — cron expressions, task prompts, run tracking
- **Identity Links** — cross-platform user mappings

### Neo4j

The knowledge graph. Stores structured understanding of the world:

- **Entities** — people, projects, tools, concepts, goals, preferences — with typed properties
- **Relationships** — directed edges like `works_on`, `uses`, `prefers`, `relates_to`, `has_goal`, `knows_about`, `depends_on`
- **Communities** — hierarchical clusters detected via the Leiden algorithm, each with an LLM-generated summary

This is what makes Kraken's memory fundamentally different from flat context stuffing. The graph enables queries like "show me everything related to Project X" or "what are the common themes across all my goals" — queries that flat memory systems can't answer.

### Redis

Dual purpose:

1. **Job queues** — BullMQ uses Redis to manage the background worker pipeline
2. **Session cache** — Recently active sessions are cached for fast context assembly

### Chromium

A headless Chromium instance managed by [Browserless](https://www.browserless.io/). The API connects via CDP (Chrome DevTools Protocol) through Playwright:

- Navigate to URLs, click elements, fill forms
- Take screenshots (full page or element)
- Extract text content or structured data
- All behind SSRF protection — internal/private IPs are blocked

### Sandbox

Docker containers for isolated code execution. When the agent needs to run code:

- A fresh container is spun up from `kraken-sandbox:latest`
- Memory and CPU limits enforced
- Read-only root filesystem
- Workspace files mounted at a known path
- Container destroyed after execution

### Git & GitHub Integration

The agent can interact with Git repositories and the GitHub API directly:

- **Clone** any public or private repo (via `KRAKEN_GIT_TOKEN`)
- **Analyze** code with search, diff, log, and branch inspection
- **Modify** code, commit changes, and push to feature branches
- **Create pull requests** via the GitHub REST API with full descriptions
- **Read files** directly from GitHub repos without cloning (via Contents API)
- All authentication is handled server-side — tokens are never exposed to the LLM

---

## Data Flow: What Happens When You Send a Message

```
1. Message arrives via POST /v1/chat
   ↓
2. Resolve or create session (by session_key or session_id)
   ↓
3. Store message in PostgreSQL with vector embedding
   ↓
4. Build system prompt:
   ├── SOUL.md personality
   ├── Current timestamp
   ├── Personality overlay (if active)
   ├── AGENTS.md project context
   ├── User model (preferences, expertise, goals)
   ├── GraphRAG memory retrieval (entities, communities, messages)
   └── Relevant skills (top 3 by embedding similarity)
   ↓
5. Check if context compaction is needed
   └── YES → Pre-flush (persist important facts to graph)
            → Summarize old messages
   ↓
6. Call LLM with assembled context + available tools
   ↓
7. Store assistant response with embedding
   ↓
8. Queue background jobs:
   ├── Extract entities & relationships → Neo4j
   ├── Update user model
   ├── Reflect on conversation → create/update skills
   └── Re-cluster communities (if graph changed)
```

Every conversation strengthens the knowledge graph. The more you use Kraken, the better it understands you.

---

## Context Budget

The system prompt is assembled within a configurable token budget (default: 128,000 tokens):

| Segment | Typical Size | Description |
|---------|-------------|-------------|
| SOUL.md | ~1,500 tokens | Agent personality (always included) |
| Timestamp | ~50 tokens | Current date/time |
| Personality overlay | ~200 tokens | Session-level behavior mode |
| AGENTS.md | ~500 tokens | Project context |
| User model | ~500 tokens | Preferences, expertise, goals |
| GraphRAG retrieval | ~4,000 tokens | Entities, communities, relevant memories |
| Skills (top 3) | ~1,500 tokens | Matching procedures |
| Conversation history | Remaining budget | Most recent messages |

If the conversation grows too long, the compaction system kicks in — silently persisting important context to the graph before summarizing older messages.

---

## Why This Architecture

Most agent systems are thin wrappers: they stuff your chat history into a context window and call an API. When the window fills up, they truncate. Your context is gone.

Kraken's architecture is designed around a different principle: **nothing should be forgotten, but not everything needs to be in context.** The knowledge graph holds the complete picture. The context window holds what's relevant right now. Background workers continuously strengthen the graph. The result is an agent that gets smarter over time — not one that resets every session.
