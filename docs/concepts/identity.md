---
layout: layouts/docs.njk
title: Identity System
description: SOUL.md personality, user model, and cross-platform identity linking
---

# Identity System

Kraken doesn't just know what you've said — it knows *who you are*. Because you deploy one instance and connect all your platforms to it, the identity system builds a unified picture of you across Discord, Telegram, CLI, and anything else. It gives the agent a consistent personality and develops a deepening model of every user it interacts with.

## SOUL.md — The Agent's Personality

Every Kraken instance has a `SOUL.md` file — a personality document injected into every prompt. This is how you define who your agent is.

```markdown
You are Kraken, a technical AI assistant that values precision and clarity.

## Communication Style
- Be direct and concise. Skip filler phrases.
- Use code examples when explaining technical concepts.
- When uncertain, say so clearly rather than guessing.

## Expertise
- Full-stack development, infrastructure, DevOps
- Database design and optimization
- API design and documentation

## Boundaries
- Don't make up information. If you don't know, say so.
- Suggest alternatives when asked about something outside your expertise.
```

### Managing SOUL.md

<div class="tabs">
<div class="tab-buttons">
<button class="tab-button active" data-tab="soul-python">Python SDK</button>
<button class="tab-button" data-tab="soul-rest">REST API</button>
</div>
<div class="tab-content active" id="soul-python">

```python
# Read current personality
soul = client.identity.get_soul()
print(soul.content)

# Update personality
client.identity.set_soul("""
You are Kraken, a concise and technical assistant.
You prefer direct, actionable answers over lengthy explanations.
""")
```

</div>
<div class="tab-content" id="soul-rest">

```bash
# Read
curl http://localhost:8080/v1/identity/soul \
  -H "Authorization: Bearer $KRAKEN_API_KEY"

# Update
curl -X PUT http://localhost:8080/v1/identity/soul \
  -H "Authorization: Bearer $KRAKEN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"content": "You are Kraken, a concise and technical assistant."}'
```

</div>
</div>

SOUL.md is limited to 6,000 characters (`KRAKEN_MAX_SOUL_CHARS`). This is intentional — the personality should be focused. Let the knowledge graph handle factual context.

---

## User Model — Who You Are

While SOUL.md defines who the *agent* is, the user model defines who *you* are. It's auto-maintained — Kraken updates it after every conversation based on what it learns.

A user model looks like this:

```markdown
## Preferences
- Prefers concise, technical answers
- Uses TypeScript and Python primarily
- Likes code examples over prose explanations

## Expertise
- Senior-level full-stack development
- Strong in database design (PostgreSQL, Neo4j)
- Familiar with Docker, Kubernetes

## Goals
- Ship Kraken Agent v1.0
- Migrate legacy services to microservices
- Learn Rust for systems programming

## Communication Style
- Direct and to-the-point
- Asks follow-up questions when specs are ambiguous
- Appreciates when trade-offs are explicitly stated

## Patterns
- Often works late evenings
- Prefers async communication
- Reviews PRs in morning batches
```

### How it works

After every conversation, a background worker:

1. Analyzes the conversation for new signals about the user
2. Compresses them into the existing user model
3. Keeps the model within `KRAKEN_MAX_USER_MODEL_CHARS` (default: 2,000)

The user model is **always included** in the system prompt. This means the agent's responses naturally adapt to you — without you explicitly telling it your preferences every time.

### Reading the user model

```python
user = client.identity.get_user_model()
print(user.content)
```

The user model is read-only via the API. It's maintained automatically by the agent. You control the agent's personality via SOUL.md; the agent learns about you via the user model.

---

## Identity Links — Cross-Platform Recognition

If you talk to Kraken from Discord and also from a Python script, it should know you're the same person. Identity links make this possible.

### Creating a link

```python
client.identity.create_link(
    canonical_user_id="alice",
    provider="discord",
    provider_user_id="123456789",
    display_name="Alice#1234",
)

client.identity.create_link(
    canonical_user_id="alice",
    provider="telegram",
    provider_user_id="alice_t",
    display_name="Alice",
)
```

Now when a message arrives with `provider=discord` and `provider_user_id=123456789`, Kraken resolves it to `canonical_user_id=alice` and loads the same user model, session history, and knowledge graph context.

### How integrations use links

When building a Discord bot or Telegram integration, include the platform identity in your API calls:

```python
response = client.chat(
    "What am I working on?",
    session_key=f"discord-{discord_user_id}",
    metadata={"provider": "discord", "provider_user_id": str(discord_user_id)},
)
```

Kraken uses the identity link to:

1. Resolve the canonical user ID
2. Load the correct user model
3. Route to the right session (or create one)
4. Apply any platform-specific formatting

### Listing links

```python
links = client.identity.get_links(canonical_user_id="alice")
for link in links:
    print(f"{link.provider}: {link.display_name}")
```

---

## AGENTS.md — Project Context

`AGENTS.md` is an optional document that provides project-level context injected into every prompt. Use it to give the agent background about what you're working on:

```markdown
## Project: Kraken Agent
An open-source AI agent with relational memory.

## Tech Stack
- Server: TypeScript, Hono, Drizzle ORM
- Database: PostgreSQL + pgvector, Neo4j
- SDK: Python, httpx, Pydantic
- Infrastructure: Docker Compose

## Conventions
- Use conventional commits
- All API routes are versioned under /v1/
- Tests use Vitest
```

```python
# Read
agents = client.identity.get_agents_md()

# Update
client.identity.set_agents_md("## Project: Kraken Agent\n...")
```

Limited to 4,000 characters. Keep it focused on conventions and context that should influence every response.

---

## How Identity Shapes Every Response

When you send a message, Kraken assembles the system prompt in this order:

```
1. SOUL.md               → Who the agent is
2. Timestamp              → Current date/time
3. Personality overlay    → Session-level mode ("concise", "teacher", etc.)
4. AGENTS.md              → Project context
5. User Model             → Who you are
6. Memory retrieval       → Relevant entities, communities, messages
7. Skills (top 3)         → Relevant procedures
8. Conversation history   → Recent messages
```

The identity layers (1, 4, 5) are always present. They ensure the agent behaves consistently, understands the project context, and adapts to you — without you asking.
