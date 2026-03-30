---
layout: layouts/docs.njk
title: Configuration
description: All environment variables and tuning options
---

# Configuration

Kraken is configured through environment variables. Set them in your `.env` file or pass them directly to Docker.

## Required

These must be set for Kraken to start.

| Variable | Description |
|----------|-------------|
| `KRAKEN_API_KEY` | Bearer token for API authentication. Choose any secret. |
| `DATABASE_URL` | PostgreSQL connection string. Set automatically by Docker Compose. |
| `REDIS_URL` | Redis connection string. Set automatically by Docker Compose. |
| `NEO4J_URL` | Neo4j Bolt URL. Set automatically by Docker Compose. |
| `NEO4J_USER` | Neo4j username (default: `neo4j`). |
| `NEO4J_PASSWORD` | Neo4j password. |
| `OPENAI_API_KEY` | OpenAI API key. Required unless using Anthropic. |

<div class="callout callout-tip">
<p class="callout-title">Provider flexibility</p>
<p>Set <code>OPENAI_API_KEY</code>, <code>ANTHROPIC_API_KEY</code>, or both. Kraken resolves the correct provider from the model name.</p>
</div>

---

## LLM

| Variable | Default | Description |
|----------|---------|-------------|
| `KRAKEN_DEFAULT_MODEL` | `gpt-5.4` | Default model for chat conversations |
| `KRAKEN_EXTRACTION_MODEL` | `gpt-5.4` | Model for entity extraction jobs (can use a cheaper model) |
| `ANTHROPIC_API_KEY` | — | Anthropic API key (alternative to OpenAI) |

---

## Context & Memory

Control how Kraken manages its context window and memory retrieval.

| Variable | Default | Description |
|----------|---------|-------------|
| `KRAKEN_MAX_CONTEXT_TOKENS` | `128000` | Total token budget (should match your model's context window) |
| `KRAKEN_MAX_HISTORY_MESSAGES` | `50` | Maximum recent messages included in context |
| `KRAKEN_MAX_SKILLS_PER_QUERY` | `3` | Number of relevant skills loaded per query |
| `KRAKEN_COMPACTION_THRESHOLD_TOKENS` | `80000` | Trigger context compaction at this token count |
| `KRAKEN_COMPACTION_KEEP_RECENT` | `10` | Messages preserved after compaction |
| `KRAKEN_PRE_FLUSH_ENABLED` | `true` | Silently persist important context to memory before compaction |

<div class="callout callout-info">
<p class="callout-title">How context compaction works</p>
<p>When a conversation approaches the token limit, Kraken first performs a "pre-flush" — it silently analyzes the conversation for important facts and persists them to the knowledge graph. Then it summarizes older messages into a compact summary, keeping the most recent messages intact. Nothing is lost; it's compressed into the graph.</p>
</div>

---

## Identity

| Variable | Default | Description |
|----------|---------|-------------|
| `KRAKEN_MAX_SOUL_CHARS` | `6000` | Maximum length of the SOUL.md personality file |
| `KRAKEN_MAX_USER_MODEL_CHARS` | `2000` | Maximum length of the auto-maintained user model |

---

## Sessions

| Variable | Default | Description |
|----------|---------|-------------|
| `KRAKEN_SESSION_MAX_AGE_HOURS` | `24` | Auto-archive sessions older than this |
| `KRAKEN_SESSION_IDLE_MINUTES` | `120` | Auto-archive sessions idle longer than this |

---

## Skills & Self-Improvement

| Variable | Default | Description |
|----------|---------|-------------|
| `KRAKEN_SKILL_AUTO_CREATE` | `true` | Automatically create skills after complex tasks |
| `KRAKEN_SKILL_MIN_TOOL_CALLS` | `5` | Minimum tool calls in a conversation to trigger skill creation |

---

## Browser Automation

| Variable | Default | Description |
|----------|---------|-------------|
| `KRAKEN_BROWSER_CDP_URL` | `ws://chromium:3000` | Chromium CDP WebSocket URL (set by Docker Compose) |
| `KRAKEN_BROWSER_TIMEOUT_MS` | `30000` | Timeout for browser actions |

---

## Sandbox

| Variable | Default | Description |
|----------|---------|-------------|
| `KRAKEN_SANDBOX_IMAGE` | `kraken-sandbox:latest` | Docker image for sandboxed code execution |
| `KRAKEN_SANDBOX_TIMEOUT_MS` | `30000` | Execution timeout |
| `KRAKEN_WORKSPACES_PATH` | `/app/workspaces` | Host path for sandbox workspace mounts |

<div class="callout callout-warning">
<p class="callout-title">Docker socket access</p>
<p>The sandbox feature requires the Docker socket to be mounted. This is configured in <code>docker-compose.yml</code> by default. Only enable this in trusted environments.</p>
</div>

---

## Git & GitHub

| Variable | Default | Description |
|----------|---------|-------------|
| `KRAKEN_GIT_TOKEN` | *(none)* | GitHub personal access token. Enables private repo cloning, git push, and PR creation. Requires `repo` scope for full functionality. |

<div class="callout callout-tip">
<p class="callout-title">Token permissions</p>
<p>For the full PR workflow (clone → edit → push → create PR), the token needs the <code>repo</code> scope. For read-only access to public repos, no token is needed.</p>
</div>

---

## Background Jobs

| Variable | Default | Description |
|----------|---------|-------------|
| `KRAKEN_DREAM_CRON` | `*/15 * * * *` | Dream cycle frequency (offline memory consolidation) |
| `KRAKEN_DREAM_MESSAGE_LIMIT` | `200` | Messages processed per dream cycle |

---

## Network

| Variable | Default | Description |
|----------|---------|-------------|
| `KRAKEN_PORT` | `8080` | API server port |
| `NEO4J_BROWSER_PORT` | `7474` | Neo4j browser UI port (for debugging) |

---

## Example `.env`

```bash
# LLM Provider
OPENAI_API_KEY=sk-...
# ANTHROPIC_API_KEY=sk-ant-...

# API Security
KRAKEN_API_KEY=sk-kraken-my-secret-key

# Database Passwords
POSTGRES_PASSWORD=strong-password-here
NEO4J_PASSWORD=strong-password-here

# Model (optional — defaults to gpt-5.4)
# KRAKEN_DEFAULT_MODEL=claude-3.7-sonnet

# Tuning (optional — defaults are good for most setups)
# KRAKEN_MAX_CONTEXT_TOKENS=128000
# KRAKEN_SESSION_IDLE_MINUTES=120
# KRAKEN_SKILL_AUTO_CREATE=true
```
