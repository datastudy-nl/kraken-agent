# Quick Start

Get Kraken running in under 5 minutes with Docker Compose.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/)
- An API key from [OpenAI](https://platform.openai.com/) or [Anthropic](https://console.anthropic.com/)

## 1. Clone the repository

```bash
git clone https://github.com/kraken-agent/kraken-agent.git
cd kraken-agent
```

## 2. Configure environment

```bash
cp .env.example .env
```

Open `.env` and set the required values:

```bash
# Pick your LLM provider (at least one is required)
OPENAI_API_KEY=sk-...
# ANTHROPIC_API_KEY=sk-ant-...

# Secure your API — choose any secret
KRAKEN_API_KEY=sk-kraken-your-secret-here

# Database passwords
POSTGRES_PASSWORD=change-me
NEO4J_PASSWORD=change-me
```

That's all you need. Everything else has sensible defaults.

## 3. Start the stack

```bash
docker-compose up -d
```

This starts six services:

| Service | Purpose |
|---------|---------|
| **kraken-api** | REST API on port `8080` |
| **worker** | Background jobs (memory extraction, skill reflection, scheduling) |
| **postgres** | PostgreSQL 17 with pgvector (sessions, messages, skills, embeddings) |
| **neo4j** | Neo4j 5 (knowledge graph — entities, relationships, communities) |
| **redis** | Redis 7 (job queues, session cache) |
| **chromium** | Headless browser for web automation |

## 4. Initialize the database

```bash
docker-compose exec kraken-api npm run db:push
```

## 5. Verify it's running

```bash
curl http://localhost:8080/health
```

You should get `{"status":"ok"}`.

---

## First conversation

### Using curl

```bash
curl -X POST http://localhost:8080/v1/chat \
  -H "Authorization: Bearer sk-kraken-your-secret-here" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello! What can you do?",
    "session_key": "my-first-session"
  }'
```

### Using the Python SDK

```bash
pip install kraken-agent
```

```python
from kraken import KrakenClient

client = KrakenClient(
    api_url="http://localhost:8080",
    api_key="sk-kraken-your-secret-here",
    model="gpt-5.4",
)

# Chat
response = client.chat("Hello! What can you do?", session_key="getting-started")
print(response.content)

# The agent remembers you across calls
client.chat("My name is Alice", session_key="getting-started")
r = client.chat("What's my name?", session_key="getting-started")
print(r.content)  # "Alice"
```

### Using the OpenAI-compatible endpoint

Any OpenAI client library works:

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:8080/v1",
    api_key="sk-kraken-your-secret-here",
)

response = client.chat.completions.create(
    model="gpt-5.4",
    messages=[{"role": "user", "content": "Hello from the OpenAI SDK!"}],
)
print(response.choices[0].message.content)
```

---

## What happens behind the scenes

When you send a message, Kraken:

1. **Resolves or creates a session** using your `session_key`
2. **Stores your message** in PostgreSQL with a vector embedding
3. **Builds a system prompt** — assembling SOUL.md, user model, relevant memory, and matching skills
4. **Checks if context compaction is needed** — if approaching the token limit, it silently persists important context to memory and summarizes older messages
5. **Calls the LLM** with your message history and available tools
6. **Stores the response** with embedding
7. **Queues background jobs** — entity extraction, user model update, skill reflection, community re-clustering

Every conversation makes Kraken smarter. It's not just answering — it's learning.

---

## Next steps

- [Configuration](configuration.md) — all environment variables and tuning options
- [Memory System](../concepts/memory.md) — how the knowledge graph works
- [Python SDK](../guide/python-sdk.md) — full SDK reference with examples
- [API Reference](../guide/api-reference.md) — every endpoint documented
