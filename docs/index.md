---
layout: layouts/home.njk
title: ""
description: The self-improving AI agent with relational memory
---

<section class="hero">
  <h1>The AI agent that actually remembers you</h1>
  <p class="tagline">Kraken builds a living knowledge graph from every conversation. It auto-creates reusable skills, maintains a persistent identity, and gets smarter over time. Self-hosted, open source, OpenAI-compatible.</p>
  <div class="hero-actions">
    <a href="/getting-started/quickstart/" class="btn btn-primary">Get Started</a>
    <a href="/concepts/architecture/" class="btn btn-secondary">How it works</a>
  </div>
</section>

<div class="hero-code">

```python
from kraken import KrakenClient

client = KrakenClient(api_url="http://localhost:8080", api_key="sk-kraken-...")

# The agent remembers across sessions
client.chat("My name is Alice and I'm building a Rust compiler", session_key="alice")
# ... hours later ...
r = client.chat("What am I working on?", session_key="alice")
print(r.content)  # "You're building a Rust compiler."

# Query the knowledge graph directly
results = client.memory.query("What do you know about Alice's projects?")
for entity in results.entities:
    print(f"{entity.type}: {entity.name}")
```

</div>

<div class="section-header">
  <h2>What makes Kraken different</h2>
  <p>Not another wrapper around a chat API. A fundamentally different architecture.</p>
</div>

<div class="feature-grid">
  <div class="feature-card">
    <span class="feature-card-icon">🔗</span>
    <h3>Relational Memory</h3>
    <p>A Neo4j knowledge graph with entities, relationships, and hierarchical communities. Five query modes that retrieve exactly what's relevant.</p>
    <a href="/concepts/memory/">Memory System</a>
  </div>
  <div class="feature-card">
    <span class="feature-card-icon">🪪</span>
    <h3>Persistent Identity</h3>
    <p>A <code>SOUL.md</code> personality file you control. An auto-maintained user model that tracks your preferences, expertise, and goals across platforms.</p>
    <a href="/concepts/identity/">Identity System</a>
  </div>
  <div class="feature-card">
    <span class="feature-card-icon">⚡</span>
    <h3>Self-Improving</h3>
    <p>Skills auto-created after complex tasks. A reflection loop that persists what it learned. The agent gets better at what you actually do.</p>
    <a href="/concepts/skills/">Skills</a>
  </div>
  <div class="feature-card">
    <span class="feature-card-icon">🔌</span>
    <h3>OpenAI-Compatible API</h3>
    <p>Drop-in <code>/v1/chat/completions</code> endpoint. Works with any OpenAI client library. Session routing and memory ride alongside the standard API.</p>
    <a href="/guide/api-reference/">API Reference</a>
  </div>
  <div class="feature-card">
    <span class="feature-card-icon">🐍</span>
    <h3>Python SDK</h3>
    <p>Type-safe client for chat, memory, skills, sessions, and identity. Streaming and session routing out of the box.</p>
    <a href="/guide/python-sdk/">Python SDK</a>
  </div>
  <div class="feature-card">
    <span class="feature-card-icon">🛡️</span>
    <h3>Sandboxed & Self-Hosted</h3>
    <p>Run on your infrastructure. Docker-isolated code execution with resource limits. Playwright browser automation with SSRF protection.</p>
    <a href="/concepts/architecture/">Architecture</a>
  </div>
</div>

<div class="section-header">
  <h2>Architecture at a glance</h2>
</div>

<div class="architecture-diagram">

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

</div>
