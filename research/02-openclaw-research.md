# OpenClaw — Deep Research Document

> **Source**: [OpenClaw](https://openclaw.ai/) / [Docs](https://docs.openclaw.ai/) (by Peter Steinberger & community)
> **Formerly known as**: Clawdbot, Moltbot
> **Research Date**: 2026-03-27

---

## 1. Executive Summary

OpenClaw is an **open-source personal AI assistant** that positions itself as "the AI that actually does things." It runs on your machine (Mac, Windows, Linux), communicates via any chat app (WhatsApp, Telegram, Discord, Slack, Signal, iMessage), and has full system access — files, shell, browser, and extensible skills. Created by Peter Steinberger, it has a thriving community and has been described as "everything Siri was supposed to be."

Key differentiators:
- **Runs on your hardware** — private by default, data stays yours
- **Any chat app** — unified interface across WhatsApp, Telegram, Discord, Slack, Signal, iMessage
- **Full system access** — files, shell, browser, with sandboxing options
- **Self-extending** — creates its own skills and modifies its own prompts
- **Plugin architecture** — extensive capability model with typed contracts
- **Proactive** — heartbeats, cron jobs, background tasks
- **Multi-agent** — spawns and manages sub-agents

---

## 2. Architecture Overview

### 2.1 Core Components

OpenClaw is a **Node.js/TypeScript** application with a Gateway-centric architecture:

| Component | Description |
|-----------|-------------|
| **Gateway** | Long-running orchestration layer — session routing, delivery, cron, plugin loading |
| **Embedded Agent Runtime** | Agent loop with tool streaming |
| **Plugin System** | 4-layer plugin architecture: discovery → validation → runtime loading → surface consumption |
| **Session Store** | Per-agent session state in `~/.openclaw/agents/<agentId>/sessions/` |
| **Skills Engine** | AgentSkills-compatible skill loading with hot reload |
| **Browser Control** | Dedicated Chromium-based browser automation service |
| **Memory Plugin** | Pluggable memory system with Markdown-based storage |

### 2.2 Plugin Architecture (4 Layers)

1. **Manifest + Discovery** — finds plugins from configured paths, reads `openclaw.plugin.json`
2. **Enablement + Validation** — enable/disable/block decisions without executing plugin code
3. **Runtime Loading** — in-process via jiti, register capabilities into central registry
4. **Surface Consumption** — core reads registry to expose tools, channels, providers, hooks, routes, services

**Design boundary**: Discovery + config validation works from metadata without executing plugin code. Runtime behavior comes from the `register(api)` path.

### 2.3 Capability Model

Registered capability types:

| Capability | Registration API | Examples |
|------------|-----------------|----------|
| Text inference | `api.registerProvider(...)` | openai, anthropic |
| CLI inference backend | `api.registerCliBackend(...)` | openai, anthropic |
| Speech | `api.registerSpeechProvider(...)` | elevenlabs, microsoft |
| Media understanding | `api.registerMediaUnderstandingProvider(...)` | openai, google |
| Image generation | `api.registerImageGenerationProvider(...)` | openai, google |
| Web search | `api.registerWebSearchProvider(...)` | google |
| Channel / messaging | `api.registerChannel(...)` | msteams, matrix |
| Context engine | `api.registerContextEngine(...)` | Custom memory/context systems |

**Plugin shapes**: `plain-capability`, `hybrid-capability`, `hook-only`, `non-capability`

### 2.4 Capability Ownership Model

Follows a strict ownership philosophy:
- **Company plugin** = ownership boundary for all that company's surfaces (e.g., OpenAI plugin owns text, speech, images, media understanding)
- **Feature plugin** = ownership boundary for a feature surface (e.g., voice-call owns call transport)
- **Channels** consume shared core capabilities, never re-implement provider behavior

Three-layer model:
1. **Core capability layer** — shared orchestration, policy, fallback, contracts
2. **Vendor plugin layer** — vendor-specific APIs, auth, model catalogs
3. **Channel/feature plugin layer** — integration that consumes core capabilities

---

## 3. Session Management

### 3.1 Session Architecture

- **Direct chats** collapse to `agent:<agentId>:<mainKey>` (default `main`) — continuity across devices/channels
- **Group chats** get isolated keys: `agent:<agentId>:<channel>:group:<id>`
- **DM scoping** modes: `main` (shared), `per-peer`, `per-channel-peer`, `per-account-channel-peer`
- **Identity links** — map provider-prefixed peer IDs to canonical identity (same person shares session across channels)

### 3.2 Session Lifecycle

- **Daily reset** — defaults to 4:00 AM local time
- **Idle reset** — optional sliding window
- **Per-type overrides** — different policies for `direct`, `group`, `thread`
- **Per-channel overrides** — different policies per messaging platform
- **Reset triggers** — `/new` or `/reset` commands, with optional model switching

### 3.3 Session State

- **Store file**: `~/.openclaw/agents/<agentId>/sessions/sessions.json`
- **Transcripts**: `<SessionId>.jsonl`
- **Gateway is source of truth** — UI clients query gateway for session lists and token counts
- **Maintenance** — automatic pruning, capping, rotation, disk budgets

### 3.4 Context Compression & Compaction

- **Session pruning** — trims old tool results from in-memory context before LLM calls
- **Pre-compaction memory flush** — silent turn that reminds model to write durable notes before context is compacted
- **Compaction** — summarizes older context to free window space (`/compact` command)

---

## 4. Memory System

### 4.1 Markdown-Based Memory

Memory is **plain Markdown files** in the agent workspace — files are the source of truth:

| Layer | Path | Purpose |
|-------|------|---------|
| **Daily log** | `memory/YYYY-MM-DD.md` | Append-only daily notes (read today + yesterday at session start) |
| **Long-term** | `MEMORY.md` | Curated durable facts and preferences |

### 4.2 Memory Tools

- `memory_search` — semantic recall over indexed snippets
- `memory_get` — targeted read of a specific Markdown file/line range
- Graceful degradation when files don't exist yet

### 4.3 Vector Memory Search

OpenClaw builds a **small vector index** over memory files:
- Semantic queries find related notes even when wording differs
- **Hybrid search** (BM25 + vector) combines semantic matching with exact keyword lookup
- Embedding providers: OpenAI, Gemini, Voyage, Mistral, Ollama, local GGUF models
- Optional **QMD sidecar** backend for advanced retrieval with:
  - MMR diversity re-ranking
  - Temporal decay
  - Post-processing features

### 4.4 Automatic Memory Flush

When a session nears auto-compaction:
- OpenClaw triggers a **silent, agentic turn** reminding the model to write durable notes
- Uses `NO_REPLY` so the user never sees the turn
- Configurable soft threshold, system prompt, and user prompt
- One flush per compaction cycle
- Workspace must be writable (skipped for sandboxed sessions)

### 4.5 Context Engine Plugins

OpenClaw allows **replacing the entire context pipeline** via context engine plugins:
- Register with `api.registerContextEngine(id, factory)`
- Own session context orchestration for ingest, assembly, and compaction
- Can delegate compaction back to core runtime

---

## 5. Skills System

### 5.1 Skill Loading

Skills loaded from three places with precedence:
1. **Workspace skills** (`<workspace>/skills`) — highest priority
2. **Managed/local skills** (`~/.openclaw/skills`)
3. **Bundled skills** (shipped with install) — lowest priority

### 5.2 AgentSkills-Compatible Format

```yaml
---
name: image-lab
description: Generate or edit images via a provider-backed image workflow
metadata: {"openclaw": {"requires": {"bins": ["uv"], "env": ["GEMINI_API_KEY"]}, "primaryEnv": "GEMINI_API_KEY"}}
---
```

### 5.3 Gating (Load-Time Filters)

Skills can require:
- **Binaries** (`requires.bins`) — must exist on PATH
- **Environment variables** (`requires.env`)
- **Config values** (`requires.config`)
- **OS platform** (`os: [darwin, linux, win32]`)

### 5.4 ClawHub

Public skills registry at [clawhub.com](https://clawhub.com/):
- `openclaw skills install <slug>`
- `openclaw skills update --all`
- Community-contributed and curated

### 5.5 Token Impact

Deterministic cost formula:
```
total = 195 + Σ (97 + len(name_escaped) + len(description_escaped) + len(location_escaped))
```

### 5.6 Hot Reload

Skills watcher auto-refreshes when SKILL.md files change (configurable debounce).

---

## 6. Browser Automation

### 6.1 Architecture

- Dedicated **isolated browser profile** (`openclaw`) — not your daily driver
- Control service runs on loopback (Gateway-internal)
- Based on **CDP** (Chrome DevTools Protocol) with optional Playwright layer
- **Multi-profile support**: `openclaw` (managed), `user` (existing Chrome session via MCP), custom profiles

### 6.2 Capabilities

- Navigation, tab management, snapshots (AI + ARIA), screenshots, PDFs
- Agent actions: click, type, drag, select, hover, scroll, upload, download
- Two ref systems: numeric refs (AI snapshot) and role refs (e.g., `e12`)
- Cookie/storage/geolocation/media/timezone/locale manipulation
- Full-page trace recording
- SSRF protection for navigation

### 6.3 Browser Backends

| Mode | Description |
|------|-------------|
| **Local managed** | Gateway starts loopback control + launches local browser |
| **Remote CDP** | Attach to remote Chromium via `cdpUrl` |
| **Browserless** | Hosted Chromium service |
| **Browserbase** | Cloud with CAPTCHA solving, stealth, proxies |
| **Node proxy** | Route to macOS/remote node browser |
| **Existing session** | Chrome DevTools MCP attach to real signed-in browser |

---

## 7. Multi-Platform Communication

### 7.1 Supported Channels

**Built-in**: WhatsApp, Telegram, Discord, iMessage
**Plugins**: Mattermost, Matrix, Microsoft Teams, Nostr, Slack, Signal, and more

### 7.2 Key Communication Features

- Group chat with mention-based activation
- DM safety with allowlists and pairing
- Streaming and chunking for long responses
- Cross-device session continuity
- Voice note transcription and TTS
- Media in/out (images, audio, video, documents)

### 7.3 Proactive Behavior

- **Heartbeats** — periodic check-ins and proactive assistance
- **Cron jobs** — scheduled tasks with delivery to any platform
- **Background tasks** — independent assessment and work

---

## 8. Security Model

- **Plugin sandbox**: Native plugins run in-process (same trust as core); treat as arbitrary code execution
- **Browser isolation**: Dedicated profile, loopback-only control, SSRF guards
- **Session isolation**: Per-sender DM scoping, identity links for cross-platform identity
- **Gateway auth**: Auto-generated tokens, supports multiple auth methods
- **Skill security**: VirusTotal partnership, security scanning for third-party skills
- **Container security**: Read-only root FS, dropped capabilities, PID limits

---

## 9. Key Takeaways for Architecture Design

### Strengths to Adopt
1. **Plugin architecture with typed capability contracts** — clean, extensible, ownership-clear
2. **Context engine plugins** — allows replacing the entire context/memory pipeline
3. **Markdown-based memory** — simple, inspectable, version-controllable
4. **Hybrid search (BM25 + vector)** — pragmatic balance of keyword and semantic recall
5. **Multi-channel gateway** — single agent, any messaging surface
6. **Browser automation with isolation** — CDP-based, multi-profile, SSRF-protected
7. **Pre-compaction memory flush** — automatically persists context before it's lost
8. **Hot-reload skills** — file watcher for instant skill updates
9. **Daily + long-term memory split** — temporal log + curated persistent memory
10. **Session identity links** — same person recognized across platforms

### Weaknesses/Gaps
1. **Memory is still flat Markdown** — no structured graph or relational layer
2. **No GraphRAG** — semantic search is basic vector + BM25, no knowledge graph extraction
3. **In-process plugins** — security risk for native plugins (arbitrary code execution)
4. **Node.js single-threaded** — could be a throughput bottleneck
5. **No relationship traversal** — can't "connect the dots" between disparate memories
6. **Limited memory capacity reasoning** — no community summaries or hierarchical clustering
