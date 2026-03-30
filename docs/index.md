---
layout: layouts/home.njk
title: ""
description: Deploy once. Your AI assistant for everything.
---

<section class="hero">
  <h1>Your personal AI assistant. Deploy once, use for everything.</h1>
  <p class="tagline">Kraken is a self-hosted AI assistant you run on your own hardware. One instance handles coding, research, scheduling, browsing, and automation across every platform you connect. It builds a knowledge graph from every conversation, auto-creates reusable skills, and gets smarter the longer you use it.</p>
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
  <h2>Why Kraken instead of a dozen separate tools</h2>
  <p>One assistant with one memory. Not another wrapper around a chat API.</p>
</div>

<div class="feature-grid">
  <div class="feature-card">
    <span class="feature-card-icon">🔗</span>
    <h3>Relational Memory</h3>
    <p>Every conversation from every channel feeds the same knowledge graph. Your assistant knows your projects, preferences, and goals across Discord, Telegram, CLI, and anything else you connect.</p>
    <a href="/concepts/memory/">Memory System</a>
  </div>
  <div class="feature-card">
    <span class="feature-card-icon">🪪</span>
    <h3>Persistent Identity</h3>
    <p>A <code>SOUL.md</code> personality file you control. An auto-maintained user model that deepens over time. Your assistant learns how you think and what you care about.</p>
    <a href="/concepts/identity/">Identity System</a>
  </div>
  <div class="feature-card">
    <span class="feature-card-icon">⚡</span>
    <h3>Self-Improving</h3>
    <p>Complex workflows become reusable skills automatically. The more you use Kraken for real tasks, the better it gets at helping you with similar tasks in the future.</p>
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
    <p>Runs entirely on your hardware. Docker-isolated code execution with networking and port forwarding. Browser automation with SSRF protection. Your data never leaves your infrastructure.</p>
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
