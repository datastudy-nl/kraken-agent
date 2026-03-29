<p align="center">
  <h1 align="center">Kraken Agent 🐙</h1>
</p>

<p align="center">
  <strong>The self-improving AI agent with relational memory.</strong>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License: MIT"></a>
  <a href="https://pypi.org/project/kraken-agent/"><img src="https://img.shields.io/badge/SDK-Python-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python SDK"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Server-Node.js_22-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js"></a>
</p>

---

**Kraken** is an open-source, persistent AI agent that remembers you through a knowledge graph, learns workflows as reusable skills, and grows a deepening model of who you are across sessions. Most agents forget you the moment the conversation ends. Kraken doesn't.

Deploy with a single `docker-compose up`. Talk to it from Discord, Telegram, WhatsApp, or any HTTP client. It doesn't just respond — it remembers contextual relationships, learns your workflows, and develops a deepening understanding of you.

📚 **Full documentation:** [kraken-agent.com](https://kraken-agent.com)

<table>
<tr><td><b>GraphRAG Memory</b></td><td>Neo4j knowledge graph with entities, relationships, and hierarchical communities. Five query modes — <code>auto</code>, <code>local</code>, <code>global</code>, <code>drift</code>, <code>basic</code> — plus episodic message search with pgvector embeddings.</td></tr>
<tr><td><b>Identity System</b></td><td>User-editable <code>SOUL.md</code> personality file injected into every prompt. Auto-maintained user model that tracks preferences, expertise, and goals. Cross-platform identity linking maps the same person across Discord, Telegram, and more.</td></tr>
<tr><td><b>Self-Improving</b></td><td>Skills auto-created after complex tasks (5+ tool calls or error recovery). Reflection loop evaluates conversations and persists learned procedures. Skills self-improve during use and load via relevance search.</td></tr>
<tr><td><b>Multi-Channel</b></td><td>Session routing with stable keys (<code>discord-12345</code>, <code>telegram-user</code>) keeps context across platforms. Identity links let the agent recognize you everywhere. Build integrations with the Python SDK or any HTTP client.</td></tr>
<tr><td><b>Sandboxed Execution</b></td><td>Docker-isolated code execution with memory/CPU limits and read-only root filesystem. Playwright-based browser automation via headless Chromium with SSRF protection.</td></tr>
<tr><td><b>Scheduled Automations</b></td><td>Cron-based task scheduling with natural-language definitions. Tasks run as new sessions and can deliver results to any connected platform.</td></tr>
<tr><td><b>OpenAI-Compatible</b></td><td>Drop-in <code>/v1/chat/completions</code> endpoint works with any OpenAI client library. Kraken extensions (<code>session_key</code>, memory queries) ride alongside the standard API.</td></tr>
<tr><td><b>Python SDK</b></td><td>Type-safe client for chat, memory, skills, sessions, and identity. Streaming support, session routing, and graph visualization out of the box.</td></tr>
</table>

---

## Quick Start

```bash
# 1. Clone
git clone https://github.com/kraken-agent/kraken-agent.git
cd kraken-agent

# 2. Configure
cp .env.example .env
# Edit .env — set at minimum:
#   OPENAI_API_KEY=sk-...
#   KRAKEN_API_KEY=sk-kraken-...    (any secret you choose)
#   POSTGRES_PASSWORD=...
#   NEO4J_PASSWORD=...

# 3. Start the stack
docker-compose up -d

# 4. Initialize the database
docker-compose exec kraken-api npm run db:push

# 5. Ready
curl http://localhost:8080/health
```

The API is now live at `http://localhost:8080`.

---

## Python SDK

```bash
pip install kraken-agent
```

```python
from kraken import KrakenClient

client = KrakenClient(
    api_url="http://localhost:8080",
    api_key="sk-kraken-...",
    model="gpt-5.4",
)

# Simple chat
response = client.chat("Hello, what can you do?")
print(response.content)

# Stable session routing — the agent remembers across calls
client.chat("My name is Alice", session_key="discord-12345", session_name="Discord DM")
r = client.chat("What's my name?", session_key="discord-12345")
print(r.content)  # "Alice"

# Streaming
for chunk in client.chat("Explain GraphRAG", stream=True):
    print(chunk, end="")
```

### Memory (GraphRAG)

```python
# Query the knowledge graph
results = client.memory.query("What do you know about my projects?")
for entity in results.entities:
    print(f"{entity.type}: {entity.name}")

# Multi-mode search
results = client.memory.query(
    "What patterns do you see in my work?",
    mode="global",  # "auto" | "local" | "global" | "drift" | "basic"
)

# Add entities manually
client.memory.add_entity("Kraken", "project", properties={"status": "active"})
client.memory.add_relationship("user", "kraken-id", "works_on")

# Visualize the graph
graph = client.memory.graph(center="kraken-id", depth=3)
print(f"{len(graph.nodes)} nodes, {len(graph.edges)} edges")
```

### Identity

```python
# Read the agent's personality
soul = client.identity.get_soul()
print(soul.content)

# Customize personality
client.identity.set_soul("You are Kraken, a concise and technical assistant...")

# Read auto-maintained user model
user = client.identity.get_user_model()
print(user.content)
```

### Skills & Sessions

```python
# Create a skill
client.skills.create(
    "git-workflow",
    content="When committing: use conventional commits...",
    tags=["git", "workflow"],
)

# List sessions
for s in client.sessions.list():
    print(f"{s.session_key or s.id} — {s.message_count} messages")
```

---

## How It Works

```
Your App (Python SDK / any HTTP client)
               │
               ▼
┌─────────────────────────────────────┐
│        Kraken API  (Hono)           │
│    REST + WebSocket + streaming     │
│    OpenAI-compatible /v1/chat/*     │
└──────────────┬──────────────────────┘
               │
    ┌──────────┼──────────────────────────────┐
    │          │                               │
    ▼          ▼                               ▼
┌────────┐ ┌─────────────────────┐  ┌──────────────────┐
│ Worker │ │   PostgreSQL 17     │  │    Neo4j 5       │
│(BullMQ)│ │   + pgvector        │  │ (knowledge graph)│
│        │ │                     │  │                  │
│ • Memory extraction            │  │ • Entities       │
│ • Community detection          │  │ • Relationships  │
│ • User model updates           │  │ • Communities    │
│ • Skill reflection             │  │                  │
│ • Dream cycle                  │  │                  │
│ • Schedule execution           │  │                  │
└────────┘ └─────────────────────┘  └──────────────────┘
               │
    ┌──────────┼──────────┐
    ▼          ▼          ▼
┌────────┐ ┌────────┐ ┌──────────┐
│ Redis 7│ │Chromium│ │ Sandbox  │
│(queues)│ │(browser│ │ (Docker) │
│        │ │ CDP)   │ │          │
└────────┘ └────────┘ └──────────┘
```

### Key Services

| Service | Role |
|---------|------|
| **kraken-api** | Hono HTTP server — chat, memory, identity, sessions, skills, tools, schedules |
| **worker** | BullMQ background jobs — entity extraction, community detection, user model compression, skill reflection, dream cycle, schedule execution |
| **PostgreSQL + pgvector** | Sessions, messages (with vector embeddings), skills, tools, identity, schedules |
| **Neo4j** | Knowledge graph — entities, directional relationships, hierarchical communities with summaries |
| **Redis** | Job queues, session cache, pub/sub for streaming |
| **Chromium** | Headless browser automation via Playwright CDP |
| **Sandbox** | Docker containers for isolated code execution with resource limits |

---

## Memory System

Kraken's memory is organized in tiers, inspired by human cognition:

| Tier | Storage | Purpose |
|------|---------|---------|
| **Working Memory** | In-context | Current conversation + retrieved context (max 80% of token window) |
| **Entity Memory** | Neo4j | Knowledge graph — people, projects, tools, concepts, and their relationships |
| **Community Memory** | Neo4j | Hierarchical clusters with LLM-generated summaries for holistic reasoning |
| **Episodic Memory** | PostgreSQL | Message archive with full-text search + vector similarity |
| **User Model** | PostgreSQL | Structured understanding of user preferences, expertise, goals, and patterns |
| **Skill Memory** | PostgreSQL | Learned procedures — top 3 loaded per query via relevance search |

### Query Modes

| Mode | Best For | How It Works |
|------|----------|--------------|
| `auto` | General questions | Analyzes intent, routes to best strategy |
| `local` | Specific entity questions | Fan out from entity to neighbors, gather context |
| `global` | Overview / holistic questions | Map query over all community summaries, reduce |
| `drift` | Entity + broader context | Local search enriched with community context |
| `basic` | Simple factual recall | Vector similarity search over messages |

---

## API Reference

All endpoints require `Authorization: Bearer <KRAKEN_API_KEY>` (when set).

### Chat

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/chat` | Send a message (Kraken native format) |
| `POST` | `/v1/chat/completions` | OpenAI-compatible chat completions |

### Memory

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/memory/query` | Query the knowledge graph (all modes) |
| `GET` | `/v1/memory/entities` | List entities (filter by type, search) |
| `POST` | `/v1/memory/entities` | Create an entity |
| `DELETE` | `/v1/memory/entities/:id` | Delete an entity |
| `POST` | `/v1/memory/relationships` | Create a relationship |
| `GET` | `/v1/memory/communities` | List communities by level |
| `GET` | `/v1/memory/graph` | Get graph neighborhood (center + depth) |

### Identity

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/identity/soul` | Read SOUL.md personality |
| `PUT` | `/v1/identity/soul` | Update SOUL.md (max 6000 chars) |
| `GET` | `/v1/identity/user-model` | Read auto-maintained user model |
| `GET` | `/v1/identity/agents-md` | Read AGENTS.md project context |
| `PUT` | `/v1/identity/agents-md` | Update AGENTS.md (max 4000 chars) |
| `POST` | `/v1/identity/links` | Link a user across platforms |
| `GET` | `/v1/identity/links` | List identity links |

### Sessions, Skills, Tools, Schedules

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/sessions` | List sessions |
| `GET` | `/v1/sessions/:id` | Get session with message history |
| `POST` | `/v1/skills` | Create a skill |
| `GET` | `/v1/skills` | List skills (filter by tag) |
| `PUT` | `/v1/skills/:id` | Update a skill |
| `GET` | `/v1/tools` | List registered tools |
| `POST` | `/v1/schedules` | Create a cron schedule |
| `GET` | `/v1/schedules` | List schedules |
| `GET` | `/health` | Health check (no auth) |

---

## Configuration

### Required

| Variable | Description |
|----------|-------------|
| `KRAKEN_API_KEY` | Bearer token for API authentication |
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `NEO4J_URL` | Neo4j Bolt URL |
| `NEO4J_USER` / `NEO4J_PASSWORD` | Neo4j credentials |
| `OPENAI_API_KEY` | OpenAI API key (or `ANTHROPIC_API_KEY`) |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `KRAKEN_DEFAULT_MODEL` | `gpt-5.4` | Default LLM for chat |
| `KRAKEN_EXTRACTION_MODEL` | `gpt-5.4` | Model for entity extraction (can be cheaper) |
| `KRAKEN_MAX_CONTEXT_TOKENS` | `128000` | Model context window limit |
| `KRAKEN_MAX_SOUL_CHARS` | `6000` | Max SOUL.md length |
| `KRAKEN_MAX_USER_MODEL_CHARS` | `2000` | Max user model length |
| `KRAKEN_MAX_SKILLS_PER_QUERY` | `3` | Skills loaded per query |
| `KRAKEN_MAX_HISTORY_MESSAGES` | `50` | Recent messages included in context |
| `KRAKEN_SESSION_MAX_AGE_HOURS` | `24` | Auto-archive sessions after this age |
| `KRAKEN_SESSION_IDLE_MINUTES` | `120` | Auto-archive after idle time |
| `KRAKEN_COMPACTION_THRESHOLD_TOKENS` | `80000` | Trigger context compaction |
| `KRAKEN_COMPACTION_KEEP_RECENT` | `10` | Messages to keep after compaction |
| `KRAKEN_PRE_FLUSH_ENABLED` | `true` | Silent memory persistence before compaction |
| `KRAKEN_SKILL_AUTO_CREATE` | `true` | Auto-create skills after complex tasks |
| `KRAKEN_SKILL_MIN_TOOL_CALLS` | `5` | Tool call threshold for skill creation |
| `KRAKEN_BROWSER_CDP_URL` | — | Chromium CDP WebSocket URL |
| `KRAKEN_BROWSER_TIMEOUT_MS` | `30000` | Browser action timeout |
| `KRAKEN_SANDBOX_IMAGE` | `kraken-sandbox:latest` | Docker image for sandboxed execution |
| `KRAKEN_SANDBOX_TIMEOUT_MS` | `30000` | Sandbox execution timeout |
| `KRAKEN_DREAM_CRON` | `*/15 * * * *` | Dream cycle frequency |

---

## Project Structure

```
kraken-agent/
├── server/                     # Core API server (TypeScript)
│   ├── src/
│   │   ├── index.ts            # Hono HTTP server entrypoint
│   │   ├── worker.ts           # BullMQ background worker
│   │   ├── config.ts           # Environment configuration
│   │   ├── api/                # Route handlers
│   │   │   ├── chat.ts         # /v1/chat, /v1/chat/completions
│   │   │   ├── memory.ts       # /v1/memory/*
│   │   │   ├── identity.ts     # /v1/identity/*
│   │   │   ├── sessions.ts     # /v1/sessions/*
│   │   │   ├── skills.ts       # /v1/skills/*
│   │   │   ├── tools.ts        # /v1/tools/*
│   │   │   ├── schedules.ts    # /v1/schedules/*
│   │   │   └── health.ts       # /health
│   │   ├── db/                 # Drizzle ORM schema + migrations
│   │   └── services/           # Business logic
│   │       ├── llm.ts          # LLM abstraction (Vercel AI SDK)
│   │       ├── memory.ts       # Session & message management
│   │       ├── graph.ts        # Neo4j operations
│   │       ├── context.ts      # System prompt assembly
│   │       ├── compaction.ts   # Context compaction + pre-flush
│   │       ├── identity.ts     # SOUL.md, user model, identity links
│   │       ├── skills.ts       # Skill CRUD + relevance search
│   │       ├── tools.ts        # Tool registry
│   │       ├── reflection.ts   # Self-improvement loop
│   │       ├── browser.ts      # Playwright CDP automation
│   │       ├── sandbox.ts      # Docker container management
│   │       ├── vector.ts       # Embeddings + hybrid search
│   │       ├── queue.ts        # BullMQ job dispatch
│   │       └── security.ts     # SSRF protection, input validation
│   ├── Dockerfile
│   └── package.json
├── sdk/
│   └── python/                 # Python SDK
│       ├── kraken/
│       │   ├── client.py       # KrakenClient
│       │   ├── models.py       # Pydantic models
│       │   ├── memory.py       # Memory API
│       │   ├── sessions.py     # Sessions API
│       │   ├── skills.py       # Skills API
│       │   ├── identity.py     # Identity API
│       │   └── tools.py        # Tools API
│       └── pyproject.toml
├── docs/
│   ├── research/               # Architecture research docs
│   └── implementations/
│       └── discord/            # Example Discord bot
│           └── bot.py
└── docker-compose.yml          # Full stack: API, worker, Postgres, Redis, Neo4j, Chromium
```

---

## Contributing

```bash
# Clone and install
git clone https://github.com/kraken-agent/kraken-agent.git
cd kraken-agent/server
npm install

# Development (auto-reload)
npm run dev

# Build
npm run build

# Lint
npm run lint

# Test
npm test

# Database migrations
npm run db:generate
npm run db:push
```

### Python SDK

```bash
cd sdk/python
pip install -e .
```

---

## License

MIT — see [LICENSE](LICENSE).
