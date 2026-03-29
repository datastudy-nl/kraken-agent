# Project Structure

A complete guide to the Kraken Agent codebase.

```
kraken-agent/
├── docker-compose.yml          # Full stack: API, worker, Postgres, Neo4j, Redis, Chromium
├── mkdocs.yml                  # Documentation site configuration
├── README.md                   # Project README
│
├── server/                     # TypeScript API + background worker
│   ├── Dockerfile              # Production container for the API server
│   ├── sandbox.Dockerfile      # Isolated container for code execution
│   ├── package.json            # Dependencies and scripts
│   ├── tsconfig.json           # TypeScript configuration
│   ├── drizzle.config.ts       # Drizzle ORM configuration
│   │
│   └── src/
│       ├── index.ts            # HTTP server entry point (Hono)
│       ├── worker.ts           # Background worker entry point (BullMQ)
│       ├── bootstrap.ts        # Shared startup logic (DB, Redis, Neo4j)
│       ├── config.ts           # Environment variable parsing + defaults
│       │
│       ├── api/                # Route handlers — one file per domain
│       │   ├── chat.ts         # POST /v1/chat, POST /v1/chat/completions
│       │   ├── health.ts       # GET /health, GET /health/ready
│       │   ├── identity.ts     # /v1/identity/* (SOUL.md, user model, links)
│       │   ├── memory.ts       # /v1/memory/* (query, entities, relationships, graph)
│       │   ├── models.ts       # /v1/models (list available LLM models)
│       │   ├── schedules.ts    # /v1/schedules/* (CRUD + cron management)
│       │   ├── sessions.ts     # /v1/sessions/* (CRUD, by-key, messages)
│       │   ├── skills.ts       # /v1/skills/* (CRUD + search)
│       │   ├── tools.ts        # /v1/tools/* (CRUD + search)
│       │   └── workspaces.ts   # /v1/workspaces/* (sandbox file management)
│       │
│       ├── db/                 # Database layer
│       │   ├── schema.ts       # Drizzle schema (all tables, indexes, relations)
│       │   ├── index.ts        #  Drizzle client + connection pool
│       │   └── init.ts         # Database initialization + seeding
│       │
│       └── services/           # Business logic — the core engine
│           ├── llm.ts          # LLM abstraction (Vercel AI SDK, model resolution)
│           ├── context.ts      # System prompt assembly (SOUL + user model + memory + skills)
│           ├── memory.ts       # Session resolution, message storage, embedding
│           ├── graph.ts        # Neo4j driver, entity/relationship CRUD, community detection
│           ├── vector.ts       # pgvector embedding + similarity search
│           ├── compaction.ts   # Context compaction (pre-flush + summarization)
│           ├── reflection.ts   # Skill auto-creation from conversation analysis
│           ├── personality.ts  # SOUL.md + personality overlay management
│           ├── identity.ts     # User model updates, AGENTS.md, identity links
│           ├── skills.ts       # Skill storage, retrieval, relevance matching
│           ├── tools.ts        # Tool registry, schema validation
│           ├── builtinTools.ts # Built-in tools (browser, sandbox, memory)
│           ├── browser.ts      # Playwright CDP connection, SSRF protection
│           ├── sandbox.ts      # Docker container management for code execution
│           ├── queue.ts        # BullMQ queue setup, job definitions
│           ├── schedules.ts    # Cron schedule management + execution
│           ├── security.ts     # Auth, API key validation, rate limiting
│           └── browser.ts      # Playwright CDP connection, SSRF protection
│
├── sdk/
│   └── python/                 # Official Python SDK
│       ├── pyproject.toml      # Package metadata + dependencies
│       ├── README.md           # SDK-specific README
│       │
│       └── kraken/             # Package source
│           ├── __init__.py     # Public exports (KrakenClient)
│           ├── client.py       # KrakenClient — main entry point
│           ├── _transport.py   # HTTP layer (httpx, auth, error handling)
│           ├── models.py       # Pydantic models (ChatResponse, Session, Entity, etc.)
│           ├── sessions.py     # Sessions sub-client
│           ├── memory.py       # Memory sub-client (query, entities, relationships)
│           ├── skills.py       # Skills sub-client
│           ├── tools.py        # Tools sub-client
│           ├── identity.py     # Identity sub-client (SOUL, user model, links)
│           ├── exceptions.py   # Typed exceptions (KrakenError, NotFoundError, etc.)
│           └── py.typed        # PEP 561 marker
│
└── docs/                       # Documentation source (MkDocs Material)
    ├── index.md                # Landing page
    ├── CNAME                   # Custom domain (kraken-agent.com)
    ├── stylesheets/
    │   └── extra.css           # Custom theme overrides
    ├── getting-started/
    │   ├── quickstart.md       # Docker setup + first chat
    │   └── configuration.md    # All environment variables
    ├── concepts/
    │   ├── architecture.md     # System overview + data flow
    │   ├── memory.md           # GraphRAG memory system
    │   ├── identity.md         # SOUL.md, user model, identity links
    │   ├── skills.md           # Self-improvement loop
    │   └── sessions.md         # Session routing + compaction
    ├── guide/
    │   ├── python-sdk.md       # Full SDK guide
    │   ├── api-reference.md    # REST API endpoints
    │   ├── discord-bot.md      # Discord integration tutorial
    │   ├── scheduled-tasks.md  # Cron scheduling
    │   └── browser-automation.md # Headless browser usage
    └── developer/
        ├── contributing.md     # Dev setup + PR process
        └── project-structure.md # This file
```

## Key Files

### `server/src/config.ts`

All environment variables are parsed here with defaults. This is the single source of truth for configuration.

### `server/src/services/context.ts`

The most important file in the server. This assembles the system prompt from all sources: SOUL.md, timestamp, personality overlay, AGENTS.md, user model, GraphRAG memory, and relevant skills. The token budget logic lives here.

### `server/src/services/graph.ts`

Neo4j operations: entity/relationship CRUD, Leiden community detection, community summarization. This is the knowledge graph engine.

### `server/src/services/compaction.ts`

Context window management. Detects when compaction is needed, runs pre-flush (persists important context to the graph), then summarizes older messages.

### `server/src/services/reflection.ts`

Post-conversation analysis. Evaluates whether a conversation produced a reusable skill, decides whether to create a new skill or update an existing one.

### `server/src/db/schema.ts`

The Drizzle ORM schema defines all PostgreSQL tables: sessions, messages, skills, tools, identity, schedules, and their vector indexes.

### `sdk/python/kraken/client.py`

The Python SDK entry point. `KrakenClient` provides `chat()`, and sub-clients (`sessions`, `memory`, `skills`, `tools`, `identity`) for domain operations.

## Data Flow Summary

```
Client request
  → api/chat.ts (validate, resolve session)
  → services/context.ts (build system prompt)
  → services/llm.ts (call LLM with tools)
  → services/memory.ts (store response)
  → services/queue.ts (enqueue background jobs)
    → worker.ts
      → services/graph.ts (extract entities)
      → services/identity.ts (update user model)
      → services/reflection.ts (create/update skills)
```
