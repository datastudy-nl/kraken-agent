# Sessions & Routing

Sessions are Kraken's unit of conversation. Every message belongs to a session, and sessions persist across API calls. This is how Kraken maintains context — not just within a single request, but across hours, days, or weeks of interaction.

## Session Keys

Every session has two identifiers:

- **`session_id`** — A UUID assigned by Kraken. Unique, immutable.
- **`session_key`** — A stable string you provide. This is the routing key.

Session keys are the recommended way to manage conversations:

```python
# Same session_key = same conversation
client.chat("My name is Alice", session_key="discord-12345")
# ... hours later ...
client.chat("What's my name?", session_key="discord-12345")  # → "Alice"
```

The pattern `{platform}-{user_id}` (e.g., `discord-12345`, `telegram-alice`) is a natural fit for multi-channel integrations. Each user on each platform gets their own persistent session.

### Key properties

- If you send a `session_key` that doesn't exist, Kraken creates a new session
- If you send a `session_key` that exists, Kraken routes to the existing session
- If you send a `session_id` instead, it routes to that exact session
- If you send neither, Kraken creates an anonymous one-off session

---

## Session Lifecycle

```
Created (first message with a new session_key)
    ↓
Active (messages flowing, context building)
    ↓
Idle (no messages for KRAKEN_SESSION_IDLE_MINUTES, default: 120)
    ↓
Archived (auto-archived after KRAKEN_SESSION_MAX_AGE_HOURS, default: 24)
    ↓
Cleanup (sandbox container destroyed, workspace files cleared)
```

### What happens during archival?

- The session is marked as archived and no longer appears in active session lists
- All messages are preserved in PostgreSQL (they're never deleted)
- Entities and relationships extracted from the session remain in Neo4j
- The sandbox container (if any) is destroyed
- Workspace files are cleaned up

Archived sessions can still be queried via the API. They're just no longer "active."

---

## Personality Overlays

Each session can have a personality overlay — a mode that adjusts the agent's behavior for that specific conversation:

```python
# Concise mode
response = client.chat(
    "Explain GraphRAG",
    session_key="quick-answers",
    personality="concise",
)

# Teacher mode
response = client.chat(
    "Explain GraphRAG",
    session_key="learning",
    personality="teacher",
)
```

The personality overlay is injected into the system prompt alongside SOUL.md. It doesn't replace the agent's core personality — it augments it.

Common overlays:

| Overlay | Behavior |
|---------|----------|
| `concise` | Short, direct answers. Skip explanations unless asked. |
| `teacher` | Explain concepts in depth. Use analogies. Check understanding. |
| `debug` | Focus on debugging. Ask clarifying questions. Show reasoning. |
| `creative` | More exploratory. Suggest alternatives. Think outside the box. |

---

## Session Metadata

Sessions carry arbitrary metadata as a JSON object:

```python
response = client.chat(
    "Hello",
    session_key="discord-12345",
    metadata={
        "provider": "discord",
        "channel": "general",
        "guild_id": "987654321",
    },
)
```

Metadata is stored with the session and available in session queries. Use it to track platform context, user preferences, or integration state.

---

## Context Compaction

As a session grows, the conversation history consumes more of the token budget. Kraken handles this automatically:

1. **Monitor** — Track token usage after each message
2. **Pre-flush** — When approaching the threshold, silently persist important facts to the knowledge graph
3. **Summarize** — Compress older messages into a summary, keeping the most recent messages intact
4. **Continue** — The conversation continues seamlessly

The user never notices. The context stays within budget, and nothing is permanently lost — it's been compressed into the graph.

Configuration:

```bash
KRAKEN_COMPACTION_THRESHOLD_TOKENS=80000  # Trigger compaction at this count
KRAKEN_COMPACTION_KEEP_RECENT=10          # Messages to keep after compaction
KRAKEN_PRE_FLUSH_ENABLED=true             # Persist to graph before summarizing
```

---

## Managing Sessions

### List active sessions

```python
sessions = client.sessions.list()
for s in sessions:
    print(f"{s.session_key or s.id} — {s.message_count} messages")
```

### Get session with history

```python
detail = client.sessions.get_by_key("discord-12345")
for msg in detail.messages:
    print(f"[{msg.role}] {msg.content}")
```

### REST API

```bash
# List sessions
curl http://localhost:8080/v1/sessions \
  -H "Authorization: Bearer $KRAKEN_API_KEY"

# Get session by ID
curl http://localhost:8080/v1/sessions/{session_id} \
  -H "Authorization: Bearer $KRAKEN_API_KEY"
```

---

## Multi-Channel Session Routing

For integrations that span multiple platforms, combine session keys with identity links:

```python
# Discord bot
response = client.chat(
    message.content,
    session_key=f"discord-{message.author.id}",
    metadata={"provider": "discord"},
)

# Telegram bot
response = client.chat(
    update.message.text,
    session_key=f"telegram-{update.message.from_user.id}",
    metadata={"provider": "telegram"},
)
```

Each platform gets its own session, but identity links ensure the same user model and knowledge graph context is shared across all platforms. The agent knows you're the same person whether you're on Discord or Telegram.

See [Identity System](identity.md) for details on cross-platform identity linking.
