<p align="center">
  <h1 align="center">kraken-agent</h1>
</p>

<p align="center">
  <strong>Python SDK for <a href="https://github.com/kraken-agent/kraken-agent">Kraken Agent</a> — an open-source AI assistant that remembers you.</strong>
</p>

<p align="center">
  <a href="https://pypi.org/project/kraken-agent/"><img src="https://img.shields.io/pypi/v/kraken-agent?style=flat-square" alt="PyPI"></a>
  <a href="https://pypi.org/project/kraken-agent/"><img src="https://img.shields.io/pypi/pyversions/kraken-agent?style=flat-square" alt="Python"></a>
  <a href="https://github.com/kraken-agent/kraken-agent/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License"></a>
</p>

---

## What is Kraken?

Kraken is a self-hosted AI assistant that builds a **knowledge graph** of everything you tell it. Unlike stateless LLM wrappers, Kraken actually remembers — your projects, preferences, workflows, and goals — across every platform you connect (Discord, Telegram, CLI, or any HTTP client).

This package is the **official Python SDK**. It gives you a type-safe, batteries-included client for chat, memory, sessions, skills, and identity management.

### Why use this SDK?

- **Persistent memory via GraphRAG** — query a Neo4j knowledge graph with 5 search modes (local, global, drift, auto, basic)
- **Session routing** — stable `session_key`-based conversations the server owns, not your client
- **Streaming** — real-time token streaming with a simple `for chunk in ...` loop
- **Self-improving skills** — the agent learns procedures from complex tasks and reuses them
- **Identity system** — editable personality (`SOUL.md`) and an auto-maintained model of *you*
- **Fully typed** — Pydantic models for every request and response, IDE autocompletion everywhere
- **Async-ready** — optional HTTP/2 support via `pip install kraken-agent[async]`

---

## Install

```bash
pip install kraken-agent
```

**Requirements:** Python 3.10+ and a running [Kraken Agent](https://github.com/kraken-agent/kraken-agent) server (`docker-compose up`).

---

## Quick Start

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
```

### Streaming

```python
for chunk in client.chat("Explain GraphRAG in simple terms", stream=True):
    print(chunk, end="")
```

### Session Routing

Sessions are server-owned. Use a stable key and the agent remembers context across calls — no local state needed.

```python
client.chat("My name is Alice", session_key="discord-12345", session_name="Discord DM")

r = client.chat("What's my name?", session_key="discord-12345")
print(r.content)  # "Alice"
```

### Context Manager

```python
with KrakenClient("http://localhost:8080") as client:
    response = client.chat("Hello!")
    print(response.content)
# Connection closed automatically
```

---

## Memory (GraphRAG)

Kraken builds a knowledge graph from every conversation. Entities, relationships, and communities are extracted automatically — and you can query or modify them directly.

```python
# Query the knowledge graph
results = client.memory.query("What do you know about my projects?")
for entity in results.entities:
    print(f"{entity.type}: {entity.name}")
```

### Multi-mode search

| Mode | Best for | How it works |
|------|----------|--------------|
| `auto` | General questions | Analyzes intent, routes to best strategy |
| `local` | Specific entity questions | Fans out from entity to neighbors |
| `global` | Overview / holistic questions | Maps query over community summaries |
| `drift` | Entity + broader context | Local search enriched with community context |
| `basic` | Simple factual recall | Vector similarity over messages |

```python
results = client.memory.query(
    "What patterns do you see in my work?",
    mode="global",
)
```

### Modify the graph

```python
client.memory.add_entity("Kraken", "project", properties={"status": "active"})
client.memory.add_relationship("user", "kraken-id", "works_on")

# Visualize a neighborhood
graph = client.memory.graph(center="kraken-id", depth=3)
print(f"{len(graph.nodes)} nodes, {len(graph.edges)} edges")
```

---

## Sessions

```python
# List all sessions
for s in client.sessions.list():
    print(f"{s.session_key or s.id} — {s.message_count} messages")

# Retrieve full history by stable key
detail = client.sessions.get_by_key("discord-12345")
for msg in detail.messages:
    print(f"[{msg.role}] {msg.content}")
```

---

## Skills

Skills are learned procedures the agent creates automatically after complex tasks. You can also create them manually.

```python
# Create a skill
client.skills.create(
    "git-workflow",
    content="When committing: use conventional commits...",
    tags=["git", "workflow"],
)

# List skills by tag
for skill in client.skills.list(tag="git"):
    print(f"{skill.name} (v{skill.version})")
```

---

## Identity

Kraken has two identity layers: an editable **personality** (`SOUL.md`) and an auto-maintained **user model** that tracks who you are.

```python
# Read the agent's personality
soul = client.identity.get_soul()
print(soul.content)

# Customize it
client.identity.set_soul("You are Kraken, a concise and technical assistant...")

# See what the agent knows about you
user = client.identity.get_user_model()
print(user.content)
```

---

## Architecture at a Glance

```
Your Python App
       │
       ▼
┌──────────────────────────┐
│   Kraken API (Hono)      │
│   REST + WebSocket       │
│   OpenAI-compatible      │
└────────┬─────────────────┘
    ┌────┼────────────┐
    ▼    ▼            ▼
PostgreSQL  Neo4j    Redis
(sessions,  (knowledge (queues,
 vectors,    graph)    cache)
 skills)
```

The SDK talks to the Kraken API server, which coordinates PostgreSQL (sessions, embeddings, skills), Neo4j (knowledge graph), and Redis (job queues). A background worker handles entity extraction, community detection, user model updates, skill reflection, and scheduled task execution.

Full docs: **[kraken-agent.com](https://kraken-agent.com)**

---

## License

MIT
