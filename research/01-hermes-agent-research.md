# Hermes Agent — Deep Research Document

> **Source**: [Hermes Agent by Nous Research](https://hermes-agent.nousresearch.com/docs/) (MIT License, 2026)
> **Research Date**: 2026-03-27

---

## 1. Executive Summary

Hermes Agent is a **self-improving, autonomous AI agent** built by Nous Research — the lab behind the Hermes, Nomos, and Psyche model families. It is not a coding copilot or chatbot wrapper; it is a persistent agent with a **closed learning loop** that creates skills from experience, improves them during use, and builds a deepening model of who the user is across sessions.

Key differentiators:
- Runs anywhere (not tied to a laptop/IDE): local, Docker, SSH, Daytona, Modal, Singularity
- Multi-platform presence: CLI, Telegram, Discord, Slack, WhatsApp — all from one gateway
- **Self-improving**: autonomous skill creation, skill refinement, memory nudges
- **RL-ready**: batch processing, trajectory export, RL training with Atropos
- Built by model trainers (Nous Research), deeply integrated with their model ecosystem

---

## 2. Personality & Identity System (SOUL.md)

### 2.1 Architecture

Hermes separates identity into three distinct layers:

| Layer | File | Scope | Purpose |
|-------|------|-------|---------|
| **Identity** | `SOUL.md` | Global (`~/.hermes/SOUL.md`) | Durable persona: tone, style, communication defaults |
| **Project Context** | `AGENTS.md` | Per-project (workspace root) | Architecture, conventions, tool preferences, repo workflows |
| **Session Overlay** | `/personality` command | Per-session | Temporary mode switches (teacher, creative, concise, etc.) |

### 2.2 SOUL.md Design Philosophy

- **Slot #1 in System Prompt**: SOUL.md occupies the first position in the system prompt, serving as the agent's primary identity. No wrapper language is added — content is injected verbatim.
- **Instance-level, not directory-level**: Loaded only from `HERMES_HOME` (default `~/.hermes/`), not from CWD. This prevents personality drift across projects.
- **Fallback behavior**: If SOUL.md is empty or missing, Hermes falls back to a built-in default identity.
- **Security scanned**: Content is scanned for prompt injection patterns before inclusion.
- **Auto-seeded**: A starter SOUL.md is created automatically if one doesn't exist.
- **Never overwritten**: User SOUL.md files are never replaced by updates.

### 2.3 What Goes in SOUL.md

**Good SOUL.md content:**
- Tone and communication style
- Level of directness
- How to handle uncertainty, disagreement, ambiguity
- Stylistic preferences and anti-patterns
- Technical posture (e.g., "prefer simple systems over clever systems")

**Not for SOUL.md (belongs in AGENTS.md):**
- Project instructions, file paths, repo conventions
- Temporary workflow details
- Coding standards

### 2.4 Personality Presets

Built-in `/personality` presets provide session-level overlays:

| Preset | Description |
|--------|-------------|
| `helpful` | Friendly general-purpose assistant |
| `concise` | Brief, to-the-point responses |
| `technical` | Detailed, accurate technical expert |
| `creative` | Innovative, outside-the-box thinking |
| `teacher` | Patient educator with clear examples |
| `kawaii` | Cute expressions and enthusiasm |
| `pirate` | Tech-savvy Captain Hermes |
| `shakespeare` | Bardic prose with dramatic flair |
| `philosopher` | Deep contemplation on every query |

Custom personalities can be defined in `config.yaml`:
```yaml
agent:
  personalities:
    codereviewer: >
      You are a meticulous code reviewer. Identify bugs, security issues,
      performance concerns, and unclear design choices.
```

### 2.5 Full Prompt Stack

The complete prompt hierarchy:
1. **SOUL.md** (agent identity — or built-in fallback)
2. Tool-aware behavior guidance
3. Memory/user context
4. Skills guidance
5. Context files (AGENTS.md, .cursorrules)
6. Timestamp
7. Platform-specific formatting hints
8. Optional `/personality` overlay

---

## 3. Memory System

### 3.1 Dual-Store Architecture

| Store | File | Char Limit | Token Estimate | Purpose |
|-------|------|-----------|----------------|---------|
| **MEMORY.md** | `~/.hermes/memories/MEMORY.md` | 2,200 chars | ~800 tokens | Agent's personal notes: environment, conventions, lessons |
| **USER.md** | `~/.hermes/memories/USER.md` | 1,375 chars | ~500 tokens | User profile: preferences, communication style, role |

**Key design decisions:**
- **Bounded memory**: Strict character limits keep system prompts predictable.
- **Frozen snapshot pattern**: Memory is injected at session start and never changes mid-session (preserves LLM prefix cache).
- **Agent-managed**: The agent manages its own memory via `add`, `replace`, `remove` actions. No `read` action — memory is in the system prompt.
- **Substring matching**: Replace/remove use short unique substring matching, not full entry text.
- **Duplicate prevention**: Exact duplicate entries are automatically rejected.
- **Security scanning**: Entries are scanned for injection/exfiltration patterns.

### 3.2 Session Search (Long-term Recall)

Beyond MEMORY.md/USER.md, Hermes has **session_search** for cross-session recall:
- All sessions stored in SQLite (`~/.hermes/state.db`) with **FTS5 full-text search**
- Queries return relevant past conversations with **Gemini Flash summarization**
- Enables recall of discussions from weeks ago

| Feature | Memory (MEMORY.md/USER.md) | Session Search |
|---------|---------------------------|----------------|
| Capacity | ~1,300 tokens total | Unlimited (all sessions) |
| Speed | Instant (in system prompt) | Requires search + LLM summarization |
| Use case | Key facts always available | "Did we discuss X last week?" |
| Management | Agent-curated | Automatic |

### 3.3 Honcho Integration (Dialectic User Modeling)

For deeper AI-generated user understanding, Hermes integrates [Honcho](https://github.com/plastic-labs/honcho):
- Runs alongside built-in memory in **hybrid mode**
- MEMORY.md and USER.md stay as-is
- Honcho adds a persistent **user modeling layer** on top
- Cross-session, cross-platform user understanding

---

## 4. Skills System (Procedural Memory)

### 4.1 Progressive Disclosure

Skills use a token-efficient loading pattern:
```
Level 0: skills_list()            → [{name, description, category}, ...]   (~3k tokens)
Level 1: skill_view(name)         → Full content + metadata                (varies)
Level 2: skill_view(name, path)   → Specific reference file               (varies)
```

### 4.2 Skill Format (SKILL.md)

```yaml
---
name: my-skill
description: Brief description
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [python, automation]
    category: devops
    fallback_for_toolsets: [web]
    requires_toolsets: [terminal]
---
# Skill Title
## When to Use
## Procedure
## Pitfalls
## Verification
```

### 4.3 Agent Self-Improvement Loop

The agent creates skills autonomously via `skill_manage` tool:
- **Triggers**: After complex tasks (5+ tool calls), when errors were discovered and resolved, when user corrected approach, when non-trivial workflows were discovered
- **Actions**: `create`, `patch` (preferred — token-efficient), `edit`, `delete`, `write_file`, `remove_file`
- **This is the agent's procedural memory** — when it figures out how to do something, it saves it for reuse

### 4.4 Skills Ecosystem

Integrated hub sources:
1. **Official** — shipped with Hermes (builtin trust)
2. **skills.sh** — Vercel's public directory
3. **Well-known endpoints** — URL-based `/.well-known/skills/index.json` discovery
4. **GitHub** — direct repo installs (OpenAI, Anthropic skills repos)
5. **ClawHub** — third-party marketplace
6. **Claude marketplace** — Anthropic skills repos
7. **LobeHub** — converted LobeHub agents

Security:
- All hub-installed skills go through a **security scanner** (data exfiltration, prompt injection, destructive commands)
- Trust levels: `builtin` → `official` → `trusted` → `community`
- `--force` can override non-dangerous policy blocks but never dangerous verdicts

---

## 5. Tools & Toolsets

### 5.1 Tool Categories

| Category | Tools | Description |
|----------|-------|-------------|
| Web | `web_search`, `web_extract` | Search and extract web content |
| Terminal & Files | `terminal`, `process`, `read_file`, `patch` | Execute commands, manipulate files |
| Browser | `browser_navigate`, `browser_snapshot`, `browser_vision` | Interactive browser automation |
| Media | `vision_analyze`, `image_generate`, `text_to_speech` | Multimodal analysis and generation |
| Agent Orchestration | `todo`, `clarify`, `execute_code`, `delegate_task` | Planning, clarification, code execution, subagent delegation |
| Memory & Recall | `memory`, `session_search`, `honcho_*` | Persistent memory, session search |
| Automation | `cronjob`, `send_message` | Scheduled tasks, outbound messaging |
| Integrations | `ha_*`, MCP tools, `rl_*` | Home Assistant, MCP, RL training |

### 5.2 Terminal Backends

| Backend | Description | Use Case |
|---------|-------------|----------|
| `local` | Direct machine execution | Development, trusted tasks |
| `docker` | Isolated containers | Security, reproducibility |
| `ssh` | Remote server | Sandboxing, separation from own code |
| `singularity` | HPC containers | Cluster computing, rootless |
| `modal` | Serverless cloud | Scale, pay-per-use |
| `daytona` | Cloud sandbox workspace | Persistent remote dev |

Container security: read-only root FS, all capabilities dropped, no privilege escalation, PID limits, full namespace isolation.

---

## 6. Architecture

### 6.1 Codebase Structure

```
hermes-agent/
├── run_agent.py              # AIAgent core loop
├── cli.py                    # Interactive terminal UI
├── model_tools.py            # Tool discovery/orchestration
├── toolsets.py               # Tool groupings and presets
├── hermes_state.py           # SQLite session/state database
├── batch_runner.py           # Batch trajectory generation
├── agent/                    # Prompt building, compression, caching, metadata
├── hermes_cli/               # Command entrypoints, auth, setup, config
├── tools/                    # Tool implementations and terminal environments
├── gateway/                  # Messaging gateway, session routing, delivery
├── cron/                     # Scheduled job storage and scheduler
├── honcho_integration/       # Honcho memory integration
├── acp_adapter/              # ACP editor integration server
├── environments/             # RL / benchmark environment framework
├── skills/                   # Bundled skills
├── optional-skills/          # Official optional skills
└── tests/
```

### 6.2 Major Subsystems

1. **Agent Loop** (`AIAgent` in `run_agent.py`): Core synchronous orchestration — provider selection, prompt construction, tool execution, retries, compression, persistence
2. **Prompt System**: Split across `run_agent.py`, `prompt_builder.py`, `prompt_caching.py`, `context_compressor.py`
3. **Provider/Runtime Resolution**: Shared resolver used by CLI, gateway, cron, ACP, auxiliary calls
4. **Tooling Runtime**: Tool registry, toolsets, terminal backends, process manager, dispatch rules
5. **Session Persistence**: SQLite-based, with lineage preserved across compression splits
6. **Messaging Gateway**: Long-running orchestrator for platform adapters, session routing, pairing, delivery, cron ticking
7. **ACP Integration**: Editor-native agent over stdio/JSON-RPC
8. **Cron**: First-class agent tasks (not just shell tasks)
9. **RL/Environments/Trajectories**: Full environment framework for evaluation, RL integration, SFT data generation

### 6.3 Design Themes

- Prompt stability matters
- Tool execution must be observable and interruptible
- Session persistence must survive long-running use
- Platform frontends share one agent core
- Optional subsystems remain loosely coupled

---

## 7. Key Takeaways for Architecture Design

### Strengths to Adopt
1. **SOUL.md pattern** — Clean separation of identity (global) vs project context (per-workspace) vs session overlay
2. **Bounded, agent-curated memory** — Character-limited, always-in-context, agent-managed
3. **Skills as procedural memory** — Agent creates, patches, and reuses learned workflows
4. **Progressive disclosure** — Minimize token usage by loading skill details on demand
5. **Security scanning at every boundary** — Memory, SOUL.md, skills all scanned before injection
6. **Multiple terminal backends** — Execution isolation without locking into one model
7. **RL integration** — Trajectory export and training loop built into the agent

### Weaknesses/Gaps
1. **Memory is flat text** — No structured relationships between memories; can't traverse connections
2. **Limited memory capacity** — 2,200 + 1,375 chars is very small; relies on session search for everything else
3. **No graph-based retrieval** — Session search uses FTS5 (keyword-based), not semantic or relational
4. **Single-user focus** — Memory and personality designed for one user per instance
5. **Python-based** — May have performance concerns for high-throughput scenarios
6. **No native web UI** — Relies on CLI or external messaging platforms
