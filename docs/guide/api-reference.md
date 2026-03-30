---
layout: layouts/docs.njk
title: API Reference
description: Complete REST API endpoint documentation
---

# API Reference

All endpoints are served under `http://localhost:8080` (default). Authenticated requests require the `Authorization: Bearer <API_KEY>` header.

---

## Health

### `GET /health`

Basic health check. Always responds fast.

```bash
curl http://localhost:8080/health
```

```json
{
  "status": "ok",
  "version": "0.1.0",
  "uptime": 12345.67
}
```

### `GET /health/ready`

Deep readiness check — verifies PostgreSQL, Redis, and Neo4j connectivity.

```bash
curl http://localhost:8080/health/ready
```

```json
{
  "status": "ready",
  "postgres": true,
  "redis": true,
  "neo4j": true
}
```

Returns `503` if any service is unavailable.

---

## Chat

### `POST /v1/chat`

Send a message. The core endpoint.

**Request:**

```json
{
  "message": "Hello, Kraken!",
  "session_key": "discord-12345",
  "session_name": "Alice Chat",
  "model": "gpt-4.1",
  "stream": false,
  "personality": "concise",
  "metadata": { "source": "api" }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `message` | `string` | Yes | The user message |
| `session_id` | `string` | No | Route to session by ID |
| `session_key` | `string` | No | Route to session by stable key (recommended) |
| `session_name` | `string` | No | Human-readable session label |
| `model` | `string` | No | Override the default LLM model |
| `stream` | `boolean` | No | Enable SSE streaming (default: `false`) |
| `personality` | `string` | No | Personality overlay for this session |
| `metadata` | `object` | No | Arbitrary metadata stored with the message |

**Response (non-streaming):**

```json
{
  "id": "msg_abc123",
  "session_id": "sess_xyz",
  "session_key": "discord-12345",
  "role": "assistant",
  "content": "Hello! How can I help you today?",
  "model": "gpt-4.1",
  "tool_calls": [],
  "usage": {
    "prompt_tokens": 1234,
    "completion_tokens": 56
  },
  "created_at": "2025-06-01T12:00:00Z"
}
```

**Response (streaming): `stream: true`**

Returns a Server-Sent Events stream. Each event contains a text chunk:

```
data: Hello
data: ! How
data:  can I
data:  help you
data:  today?
data: [DONE]
```

### `POST /v1/chat/completions`

OpenAI-compatible endpoint. Use this to plug Kraken into any tool that supports the OpenAI Chat API.

**Request:**

```json
{
  "model": "gpt-4.1",
  "messages": [
    { "role": "user", "content": "Hello!" }
  ],
  "stream": false
}
```

**Response:** Standard OpenAI Chat Completion format.

---

## Sessions

### `GET /v1/sessions`

List sessions.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | `int` | `20` | Max results |
| `offset` | `int` | `0` | Pagination offset |

```bash
curl "http://localhost:8080/v1/sessions?limit=10" \
  -H "Authorization: Bearer $KRAKEN_API_KEY"
```

```json
{
  "sessions": [
    {
      "id": "sess_abc",
      "session_key": "discord-12345",
      "name": "Alice Chat",
      "created_at": "2025-06-01T12:00:00Z",
      "updated_at": "2025-06-01T13:00:00Z",
      "message_count": 42,
      "metadata": {}
    }
  ]
}
```

### `POST /v1/sessions`

Create a session explicitly.

```json
{
  "session_key": "project-alpha",
  "name": "Project Alpha Discussion",
  "metadata": { "team": "backend" }
}
```

### `GET /v1/sessions/:id`

Get a session with its full message history.

```json
{
  "id": "sess_abc",
  "session_key": "discord-12345",
  "name": "Alice Chat",
  "messages": [
    {
      "id": "msg_1",
      "session_id": "sess_abc",
      "role": "user",
      "content": "Hello!",
      "timestamp": "2025-06-01T12:00:00Z",
      "metadata": {}
    }
  ]
}
```

### `GET /v1/sessions/by-key/:key`

Get a session by its stable routing key.

```bash
curl "http://localhost:8080/v1/sessions/by-key/discord-12345" \
  -H "Authorization: Bearer $KRAKEN_API_KEY"
```

### `DELETE /v1/sessions/:id`

Delete a session and all its messages.

### `GET /v1/sessions/:id/messages`

Get paginated messages for a session.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | `int` | `50` | Max results |
| `offset` | `int` | `0` | Pagination offset |

---

## Memory

### `POST /v1/memory/query`

Query the knowledge graph.

**Request:**

```json
{
  "query": "What do you know about my projects?",
  "mode": "auto",
  "limit": 20,
  "time_range": {
    "start": "2025-01-01T00:00:00Z",
    "end": "2025-06-01T00:00:00Z"
  },
  "entity_filter": ["entity-id-1"]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | `string` | Yes | Natural language question |
| `mode` | `string` | No | `auto` (default), `local`, `global`, `drift`, `basic` |
| `limit` | `int` | No | Max results (default: `10`) |
| `time_range` | `object` | No | `{ start, end }` as ISO datetimes |
| `entity_filter` | `string[]` | No | Restrict to specific entity IDs |

**Response:**

```json
{
  "query": "What do you know about my projects?",
  "mode": "local",
  "results": [
    { "type": "entity", "name": "Project Alpha", "score": 0.92 }
  ],
  "entities": [
    { "id": "ent_1", "name": "Project Alpha", "type": "project", "properties": {} }
  ],
  "communities": [
    { "id": "com_1", "name": "Development Work", "summary": "...", "level": 0 }
  ]
}
```

### `GET /v1/memory/entities`

List entities in the knowledge graph.

| Param | Type | Description |
|-------|------|-------------|
| `type` | `string` | Filter by entity type |
| `search` | `string` | Full-text search |
| `limit` | `int` | Max results (default: `50`) |

### `POST /v1/memory/entities`

Add an entity.

```json
{
  "name": "Project Alpha",
  "type": "project",
  "properties": { "status": "active" }
}
```

### `DELETE /v1/memory/entities/:id`

Remove an entity.

### `POST /v1/memory/relationships`

Add a relationship between entities.

```json
{
  "source": "entity-id-alice",
  "target": "entity-id-project-alpha",
  "type": "works_on",
  "properties": { "role": "lead" }
}
```

### `GET /v1/memory/graph`

Get a subgraph for visualization.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `center` | `string` | — | Center entity ID |
| `depth` | `int` | `2` | Traversal depth |

```json
{
  "nodes": [...],
  "edges": [...],
  "depth": 2,
  "center": "entity-id"
}
```

---

## Skills

### `GET /v1/skills`

List skills.

| Param | Type | Description |
|-------|------|-------------|
| `tag` | `string` | Filter by tag |
| `search` | `string` | Search by name or content |

### `POST /v1/skills`

Create a skill.

```json
{
  "name": "deploy-production",
  "content": "# deploy-production\n\n## When to Use\n...",
  "tags": ["deployment", "production"]
}
```

### `GET /v1/skills/:id`

Get a skill by ID.

### `PATCH /v1/skills/:id`

Update a skill.

```json
{
  "content": "Updated procedure...",
  "tags": ["deployment", "docker"]
}
```

### `DELETE /v1/skills/:id`

Archive a skill.

---

## Tools

### `GET /v1/tools`

List registered tools.

| Param | Type | Description |
|-------|------|-------------|
| `tag` | `string` | Filter by tag |
| `search` | `string` | Search tools |
| `limit` | `int` | Max results (default: `100`) |

### `POST /v1/tools`

Register a new tool.

```json
{
  "name": "send-email",
  "description": "Send an email via SMTP",
  "instructions": "Use this to send emails.",
  "input_schema": {
    "type": "object",
    "properties": {
      "to": { "type": "string" },
      "subject": { "type": "string" },
      "body": { "type": "string" }
    },
    "required": ["to", "subject", "body"]
  },
  "tags": ["email"]
}
```

### `GET /v1/tools/:id`

Get a tool by ID.

### `PATCH /v1/tools/:id`

Update a tool.

### `DELETE /v1/tools/:id`

Delete a tool.

---

## Identity

### `GET /v1/identity/soul`

Get the SOUL.md personality document.

```json
{ "content": "You are Kraken...", "updated_at": "2025-06-01T12:00:00Z" }
```

### `PUT /v1/identity/soul`

Update SOUL.md.

```json
{ "content": "You are Kraken, a concise technical assistant." }
```

### `GET /v1/identity/user-model`

Get the auto-maintained user model (read-only).

```json
{ "content": "## Preferences\n- Prefers concise answers\n...", "updated_at": "..." }
```

### `GET /v1/identity/agents-md`

Get the AGENTS.md project context.

### `PUT /v1/identity/agents-md`

Update AGENTS.md.

```json
{ "content": "## Project: My App\nTech stack: Python, FastAPI" }
```

### `POST /v1/identity/links`

Create an identity link.

```json
{
  "canonical_user_id": "alice",
  "provider": "discord",
  "provider_user_id": "123456789",
  "display_name": "Alice#1234"
}
```

### `GET /v1/identity/links`

List identity links.

| Param | Type | Description |
|-------|------|-------------|
| `canonical_user_id` | `string` | Filter by canonical user |

---

## Schedules

### `GET /v1/schedules`

List scheduled tasks.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | `int` | `20` | Max results |
| `offset` | `int` | `0` | Pagination offset |

### `POST /v1/schedules`

Create a scheduled task.

```json
{
  "name": "daily-standup",
  "description": "Generate a daily standup summary",
  "cron_expression": "0 9 * * 1-5",
  "task_prompt": "Summarize what I worked on yesterday and what I should focus on today.",
  "max_runs": 100,
  "metadata": { "channel": "slack-standup" }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | Yes | Schedule name |
| `description` | `string` | No | Human-readable description |
| `cron_expression` | `string` | Yes | Standard cron expression |
| `task_prompt` | `string` | Yes | Message to send when schedule fires |
| `origin_session_id` | `string` | No | Session to inherit context from |
| `max_runs` | `int` | No | Stop after this many executions |
| `metadata` | `object` | No | Arbitrary metadata |

### `GET /v1/schedules/:id`

Get a schedule by ID.

### `PATCH /v1/schedules/:id`

Update a schedule.

```json
{
  "cron_expression": "0 10 * * 1-5",
  "enabled": true
}
```

### `DELETE /v1/schedules/:id`

Delete a schedule.
