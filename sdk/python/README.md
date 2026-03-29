# kraken-agent

Python SDK for the [Kraken Agent](https://github.com/kraken-agent/kraken-agent) API.

## Install

```bash
pip install kraken-agent
```

## Quick Start

```python
from kraken import KrakenClient

client = KrakenClient(
    api_url="http://localhost:8080",
    model="gpt-5.4",
    api_key="sk-...",
)

# Simple chat
response = client.chat("Hello, what can you do?")
print(response.content)

# Stable backend-owned session routing
client.chat("My name is Alice", session_key="discord-12345", session_name="Discord DM")
r = client.chat("What's my name?", session_key="discord-12345")
print(r.content)  # "Alice"

# Streaming
for chunk in client.chat("Explain GraphRAG", stream=True):
    print(chunk, end="")
```

## Memory (GraphRAG)

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

## Sessions

```python
# List sessions
for s in client.sessions.list():
    print(f"{s.session_key or s.id} — {s.message_count} messages")

# Get session history by stable key
detail = client.sessions.get_by_key("discord-12345")
for msg in detail.messages:
    print(f"[{msg.role}] {msg.content}")
```

## Skills

```python
# Create a skill
client.skills.create(
    "git-workflow",
    content="When committing: use conventional commits...",
    tags=["git", "workflow"],
)

# List skills
for skill in client.skills.list(tag="git"):
    print(f"{skill.name} (v{skill.version})")
```

## Identity

```python
# Read the agent's personality
soul = client.identity.get_soul()
print(soul.content)

# Update personality
client.identity.set_soul("You are Kraken, a concise and technical assistant...")

# Read auto-maintained user model
user = client.identity.get_user_model()
print(user.content)
```

## Context Manager

```python
with KrakenClient("http://localhost:8080") as client:
    response = client.chat("Hello!")
    print(response.content)
# Connection closed automatically
```

## License

MIT
