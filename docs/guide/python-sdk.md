---
layout: layouts/docs.njk
title: Python SDK
description: Type-safe Python client for chat, memory, skills, and identity
---

# Python SDK

The official Python SDK for Kraken Agent. Type-safe, async-ready, and designed for production use. It includes first-class chat, memory, tools, identity, and schedule management.

## Installation

```bash
pip install kraken-agent
```

Requires Python 3.11+. Dependencies: `httpx`, `pydantic`.

## Quick Start

```python
from kraken import KrakenClient

client = KrakenClient(
    api_url="http://localhost:8080",
    model="gpt-4.1",
    api_key="sk-your-api-key",
)

response = client.chat("Hello, Kraken!")
print(response.content)
```

## Client Configuration

```python
client = KrakenClient(
    api_url="http://localhost:8080",  # Kraken server URL
    model="gpt-4.1",                 # Default LLM model
    api_key="sk-...",                # API key (optional, for auth)
    timeout=120.0,                   # HTTP timeout in seconds
)
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `api_url` | `str` | `http://localhost:8080` | Kraken server URL |
| `model` | `str \| None` | `None` | Default model for all chat calls |
| `api_key` | `str \| None` | `None` | API key for authentication |
| `timeout` | `float` | `120.0` | HTTP timeout in seconds |

The client can be used as a context manager:

```python
with KrakenClient(api_url="http://localhost:8080") as client:
    response = client.chat("Hello!")
    print(response.content)
# Connection closed automatically
```

---

## Chat

### Basic chat

```python
response = client.chat("What is GraphRAG?")
print(response.content)
print(f"Model: {response.model}")
print(f"Tokens: {response.usage.prompt_tokens} in / {response.usage.completion_tokens} out")
```

### Session-based chat (persistent context)

```python
# First message — creates session automatically
r1 = client.chat("My name is Alice", session_key="alice-main")
print(r1.content)

# Second message — same session, agent remembers
r2 = client.chat("What's my name?", session_key="alice-main")
print(r2.content)  # → "Your name is Alice"
```

### Streaming

```python
for chunk in client.chat("Write a poem about the ocean", stream=True):
    print(chunk, end="", flush=True)
```

### Full parameters

```python
response = client.chat(
    "Deploy the frontend",
    session_id="...",          # Route to specific session by ID
    session_key="discord-123", # Or use a stable key (recommended)
    session_name="Deploy Chat",# Human-readable session label
    model="claude-sonnet-4-20250514",    # Override model for this call
    stream=False,              # Set True for streaming
    metadata={"source": "cli", "priority": "high"},
)
```

### ChatResponse fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | `str` | Message ID |
| `session_id` | `str` | Session this message belongs to |
| `session_key` | `str \| None` | Session routing key |
| `role` | `str` | Always `"assistant"` |
| `content` | `str` | The response text |
| `model` | `str` | Model used |
| `tool_calls` | `list[ToolCall]` | Tools invoked during generation |
| `usage` | `Usage` | Token counts |
| `created_at` | `datetime` | Timestamp |

---

## Sessions

### List sessions

```python
sessions = client.sessions.list(limit=20, offset=0)
for s in sessions:
    print(f"{s.session_key or s.id} — {s.message_count} messages")
```

### Create a session

```python
session = client.sessions.create(
    session_key="project-alpha",
    name="Project Alpha Discussion",
    metadata={"team": "backend"},
)
```

### Get session by key

```python
detail = client.sessions.get_by_key("discord-12345")
print(f"Messages: {len(detail.messages)}")
for msg in detail.messages:
    print(f"  [{msg.role}] {msg.content[:80]}")
```

### Get session by ID

```python
detail = client.sessions.get(session_id)
```

### Get messages

```python
messages = client.sessions.messages(session_id, limit=50, offset=0)
```

### Delete a session

```python
client.sessions.delete(session_id)
```

---

## Memory

### Query the knowledge graph

```python
# Auto mode — Kraken picks the best strategy
result = client.memory.query("What do you know about my projects?")
print(f"Mode used: {result.mode}")
for entity in result.entities:
    print(f"  Entity: {entity.name} ({entity.type})")

# Specific mode
result = client.memory.query(
    "What are the common themes in my work?",
    mode="global",
)

# With filters
result = client.memory.query(
    "What tools does Alice use?",
    entity_filter=["entity-id-1", "entity-id-2"],
    limit=20,
)

# Time-bounded
result = client.memory.query(
    "What did we discuss this week?",
    time_start="2025-01-01T00:00:00Z",
    time_end="2025-01-07T00:00:00Z",
)
```

Query modes: `auto`, `local`, `global`, `drift`, `basic`. See [Memory System](../concepts/memory.md) for details.

### Manage entities

```python
# List entities
entities = client.memory.list_entities(type="project", limit=50)

# Search entities
entities = client.memory.list_entities(search="Kraken")

# Add an entity
entity = client.memory.add_entity(
    name="Project Alpha",
    type="project",
    properties={"status": "active", "language": "Python"},
)

# Delete an entity
client.memory.delete_entity(entity.id)
```

### Manage relationships

```python
rel = client.memory.add_relationship(
    source="entity-id-alice",
    target="entity-id-project-alpha",
    type="works_on",
    properties={"role": "lead"},
)
```

### Graph traversal

```python
# Get a subgraph centered on an entity
graph = client.memory.graph(center="entity-id", depth=2)
for node in graph.nodes:
    print(f"  Node: {node.name} ({node.type})")
for edge in graph.edges:
    print(f"  Edge: {edge.source} --{edge.type}--> {edge.target}")
```

---

## Skills

### List skills

```python
# All skills
skills = client.skills.list()

# Filtered
skills = client.skills.list(tag="git")
skills = client.skills.list(search="deploy")
```

### Create a skill

```python
skill = client.skills.create(
    "deploy-production",
    content="""
    # deploy-production

    ## When to Use
    When deploying to production environment.

    ## Procedure
    1. Run tests
    2. Build
    3. Tag release
    4. Deploy
    """,
    tags=["deployment", "production"],
)
```

### Update a skill

```python
client.skills.update(
    skill.id,
    content="Updated procedure...",
    tags=["deployment", "production", "docker"],
)
```

### Delete a skill

```python
client.skills.delete(skill.id)
```

---

## Tools

### List tools

```python
tools = client.tools.list()
tools = client.tools.list(tag="browser")
tools = client.tools.list(search="screenshot")
```

### Register a tool

```python
tool = client.tools.create(
    name="send-email",
    description="Send an email via SMTP",
    instructions="Use this to send emails. Always confirm recipients.",
    input_schema={
        "type": "object",
        "properties": {
            "to": {"type": "string"},
            "subject": {"type": "string"},
            "body": {"type": "string"},
        },
        "required": ["to", "subject", "body"],
    },
    tags=["communication", "email"],
)
```

### Update a tool

```python
client.tools.update(
    tool.id,
    description="Send an email via SMTP (with attachment support)",
    input_schema={...},
)
```

### Delete a tool

```python
client.tools.delete(tool.id)
```

---

## Schedules

```python
# List schedules
schedules = client.schedules.list(limit=20, offset=0)

# Create a recurring schedule
schedule = client.schedules.create(
    "daily-recap",
    "Summarize yesterday's activity",
    "0 8 * * *",
    origin_session_id="ops-session",
    max_runs=30,
)

# Update or pause
client.schedules.update(schedule.id, enabled=False)

# Delete
client.schedules.delete(schedule.id)
```

The async client exposes the same surface via `await client.schedules.create(...)`.

## Identity

### SOUL.md (agent personality)

```python
# Read
soul = client.identity.get_soul()
print(soul.content)

# Update
client.identity.set_soul("""
You are Kraken, a precise and concise technical assistant.
""")
```

### User Model (auto-maintained)

```python
user_model = client.identity.get_user_model()
print(user_model.content)
```

The user model is read-only via the API. It's automatically maintained by background workers.

### AGENTS.md (project context)

```python
# Read
agents = client.identity.get_agents_md()
print(agents.content)

# Update
client.identity.set_agents_md("""
## Project: My App
Tech stack: Python, FastAPI, PostgreSQL
""")
```

### Identity Links (cross-platform)

```python
# Link a platform identity
link = client.identity.link_identity(
    canonical_user_id="alice",
    provider="discord",
    provider_user_id="123456789",
    display_name="Alice#1234",
)

# List links
links = client.identity.list_identity_links(canonical_user_id="alice")
for link in links:
    print(f"{link.provider}: {link.display_name}")
```

---

## Health Check

```python
health = client.health()
print(f"Status: {health.status}")
print(f"Version: {health.version}")
print(f"Uptime: {health.uptime:.0f}s")
```

---

## Error Handling

The SDK raises typed exceptions:

```python
from kraken.exceptions import KrakenError, NotFoundError, ValidationError

try:
    client.sessions.get("nonexistent-id")
except NotFoundError:
    print("Session not found")
except ValidationError as e:
    print(f"Invalid input: {e}")
except KrakenError as e:
    print(f"API error: {e.status_code} — {e.message}")
```
