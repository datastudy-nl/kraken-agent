---
hide:
  - navigation
---

<div class="kraken-hero" markdown>

# :octicons-tentacle-24: Kraken Agent

**The AI agent that actually remembers you.**

Most agents forget you the moment the conversation ends. They treat every session as a blank slate — no memory of your projects, your preferences, or who you even are. Kraken is different. It builds a living knowledge graph of everything it learns about you, auto-creates reusable skills from experience, and maintains a persistent identity that deepens over time.

[Get started in 5 minutes :material-arrow-right:](getting-started/quickstart.md){ .md-button .md-button--primary }
[Read the concepts :material-book-open-variant:](concepts/architecture.md){ .md-button }

</div>

---

## The Problem with Every Other Agent

You've used AI assistants before. Every time you start a new conversation, you explain the same context. You re-describe your project. You re-state your preferences. The agent has no idea who you are, what you've been working on, or what you've already tried.

Some tools bolt on a "memory" feature — a flat list of facts stuffed into the context window. That's not memory. That's a sticky note.

**Kraken takes a fundamentally different approach.** It builds a structured knowledge graph — entities, relationships, and hierarchical communities — that it queries intelligently based on what you're actually asking. It doesn't dump everything into context and hope for the best. It reasons about what's relevant.

---

## What makes Kraken different

<div class="grid cards" markdown>

-   :material-graph-outline: **Relational Memory**

    ---

    A Neo4j knowledge graph with entities, relationships, and hierarchical communities. Five query modes — `auto`, `local`, `global`, `drift`, `basic` — that retrieve exactly what's relevant. Not a context dump.

    [:octicons-arrow-right-24: Memory System](concepts/memory.md)

-   :material-fingerprint: **Persistent Identity**

    ---

    A `SOUL.md` personality file you control. An auto-maintained user model that tracks your preferences, expertise, and goals. Cross-platform identity linking that recognizes you across Discord, Telegram, and any channel.

    [:octicons-arrow-right-24: Identity System](concepts/identity.md)

-   :material-lightning-bolt: **Self-Improving**

    ---

    Skills auto-created after complex tasks. A reflection loop that evaluates conversations and persists what it learned. Skills loaded by relevance search — the agent gets better at the things you actually do.

    [:octicons-arrow-right-24: Skills](concepts/skills.md)

-   :material-api: **OpenAI-Compatible API**

    ---

    Drop-in `/v1/chat/completions` endpoint that works with any OpenAI client library. Kraken extensions — session routing, memory queries, personality — ride alongside the standard API. Zero lock-in.

    [:octicons-arrow-right-24: API Reference](guide/api-reference.md)

-   :material-language-python: **Python SDK**

    ---

    Type-safe client for chat, memory, skills, sessions, and identity. Streaming, session routing, and graph visualization out of the box. Build integrations in minutes.

    [:octicons-arrow-right-24: Python SDK](guide/python-sdk.md)

-   :material-shield-lock-outline: **Sandboxed & Self-Hosted**

    ---

    Run it on your own infrastructure. Docker-isolated code execution with resource limits. Playwright browser automation with SSRF protection. Your data never leaves your stack.

    [:octicons-arrow-right-24: Architecture](concepts/architecture.md)

</div>

---

## Quick taste

```python
from kraken import KrakenClient

client = KrakenClient(api_url="http://localhost:8080", api_key="sk-kraken-...")

# The agent remembers across calls
client.chat("My name is Alice and I'm building a Rust compiler", session_key="alice")
# ... hours later ...
r = client.chat("What am I working on?", session_key="alice")
print(r.content)  # "You're building a Rust compiler."

# Query the knowledge graph directly
results = client.memory.query("What do you know about Alice's projects?")
for entity in results.entities:
    print(f"{entity.type}: {entity.name}")
```

[:octicons-arrow-right-24: Full Quick Start](getting-started/quickstart.md)

---

## Architecture at a glance

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
    ┌──────────┼──────────────────────┐
    │          │                      │
    ▼          ▼                      ▼
 Worker    PostgreSQL 17          Neo4j 5
 (BullMQ)  + pgvector         (knowledge graph)
    │          │                      │
    ├── Memory extraction             ├── Entities
    ├── Community detection           ├── Relationships
    ├── User model updates            └── Communities
    ├── Skill reflection
    ├── Dream cycle              ┌─────────────┐
    └── Schedule execution       │  Redis 7    │
                                 │  (queues)   │
               ┌─────────────┐  └─────────────┘
               │  Chromium   │
               │  (browser)  │  ┌─────────────┐
               └─────────────┘  │  Sandbox    │
                                │  (Docker)   │
                                └─────────────┘
```

[:octicons-arrow-right-24: Full Architecture](concepts/architecture.md)
