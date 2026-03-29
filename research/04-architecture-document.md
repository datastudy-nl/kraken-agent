# Kraken Agent — Open-Source Agent Architecture Document

> **Synthesis of**: Hermes Agent (Nous Research) + OpenClaw (Peter Steinberger) + GraphRAG (Microsoft Research)
> **Purpose**: Architecture for an open-source autonomous agent with the best of all three systems
> **Date**: 2026-03-27

---

## 1. Vision & Design Philosophy

### 1.1 What We're Building

**Kraken** is an open-source personal AI agent that combines:
- **Hermes Agent's** identity system, bounded memory discipline, and self-improvement loop
- **OpenClaw's** plugin architecture, typed capabilities, multi-channel communication, and browser automation
- **GraphRAG's** knowledge graph memory with relational reasoning and holistic understanding

The result is an agent that **knows who it is** (identity), **grows smarter over time** (skills + GraphRAG memory), **extends itself through plugins** (capability system), and **truly understands the user** (graph-based relational memory instead of flat text).

### 1.2 Deployment Model

Kraken is deployed as a **Docker Compose stack** where the core agent runs as a **REST/WebSocket API**. Consumers interact through a **Python pip library** (`kraken-agent`) that wraps the API — point it at any Kraken instance URL and go.

```
┌──────────────────────────────────────────────────┐
│              YOUR CODE / NOTEBOOK / APP            │
│                                                    │
│   from kraken import KrakenClient                  │
│   client = KrakenClient("http://kraken:8080")      │
│   client.chat("Hello!")                            │
│   client.memory.query("What do I know?")           │
└────────────────────┬─────────────────────────────┘
                     │ HTTP / WebSocket
                     ▼
┌──────────────────────────────────────────────────┐
│           DOCKER COMPOSE STACK                    │
│                                                    │
│  ┌────────────┐  ┌────────┐  ┌────────────────┐  │
│  │ kraken-api │  │ worker │  │   Neo4j        │  │
│  │ (Hono API) │  │(BullMQ)│  │ (Knowledge     │  │
│  │ Port 8080  │──│ Redis  │──│  Graph)        │  │
│  └────────────┘  └────────┘  └────────────────┘  │
│                                                    │
│  ┌──────────────────┐  ┌───────────────────────┐  │
│  │  PostgreSQL      │  │  Redis                │  │
│  │  + pgvector      │  │  (queues, sessions,   │  │
│  │  (episodic,      │  │   pub/sub)            │  │
│  │   skills, FTS)   │  │                       │  │
│  └──────────────────┘  └───────────────────────┘  │
└──────────────────────────────────────────────────┘
```

### 1.3 Core Principles

| Principle | Rationale | Inspiration |
|-----------|-----------|-------------|
| **API-first** | Core agent is a service; any language/tool can consume it | Original |
| **Identity-first** | Agent's personality, values, and behavior should be configurable and consistent | Hermes SOUL.md |
| **Memory is a graph, not a file** | Flat text memory can't connect dots or provide holistic understanding | GraphRAG |
| **Plugins over monoliths** | Capabilities should be modular, loadable, and community-contributed | OpenClaw plugin system |
| **Bounded by design** | All context windows, memory stores, and prompts have explicit size budgets | Hermes bounded memory |
| **Open and extensible** | MIT license, clear abstractions, community-friendly | All three projects |
| **Privacy-aware** | User controls what is remembered, shared, and persisted | OpenClaw ownership model |

---

## 2. High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                        KRAKEN API SERVER                             │
│                       (Docker: kraken-api)                            │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │                    REST + WebSocket API                         │  │
│  │  POST /v1/chat          — send message, get response           │  │
│  │  POST /v1/chat/completions — OpenAI-compatible endpoint        │  │
│  │  CRUD /v1/sessions      — manage conversation sessions         │  │
│  │  POST /v1/memory/query  — GraphRAG multi-mode search           │  │
│  │  CRUD /v1/memory/*      — entities, relationships, graph       │  │
│  │  CRUD /v1/skills        — procedural memory                    │  │
│  │  GET|PUT /v1/identity/* — SOUL.md, user model                  │  │
│  └────────────────────────────┬───────────────────────────────────┘  │
│                               │                                      │
│  ┌──────────────┐   ┌────────┴───────┐   ┌──────────────────────┐   │
│  │   IDENTITY    │   │    BRAIN       │   │     MEMORY           │   │
│  │   (SOUL.md)   │   │  (LLM Core)    │   │  (GraphRAG Store)    │   │
│  │               │   │                │   │                      │   │
│  │  Personality   │   │  Reasoning     │   │  Knowledge Graph     │   │
│  │  Values        │──▶│  Planning      │◀──│  Community Summaries │   │
│  │  Behavior      │   │  Reflection    │   │  Entity Memory       │   │
│  │  Boundaries    │   │  Tool Use      │   │  Episodic Store      │   │
│  └──────────────┘   └───────┬────────┘   │  User Model          │   │
│                              │            └──────────────────────┘   │
│                     ┌────────┼────────┐                              │
│                     ▼        ▼        ▼                              │
│   ┌──────────────┐ ┌────────────┐ ┌──────────────┐                  │
│   │   SKILLS     │ │   TOOLS    │ │   PLUGINS    │                  │
│   │ Procedural   │ │ Built-in   │ │ Community    │                  │
│   │ Self-taught  │ │ Sandboxed  │ │ Typed Caps   │                  │
│   └──────────────┘ └────────────┘ └──────────────┘                  │
└──────────────────────────────────────────────────────────────────────┘
│                                                                      │
│  ┌──────────────────┐  ┌────────┐  ┌─────────┐  ┌────────────────┐  │
│  │  PostgreSQL      │  │ Redis  │  │ Neo4j   │  │ Background     │  │
│  │  + pgvector      │  │ queues │  │ graph   │  │ Worker         │  │
│  │  (episodes,FTS)  │  │ + kv   │  │ store   │  │ (BullMQ)       │  │
│  └──────────────────┘  └────────┘  └─────────┘  └────────────────┘  │
│                    Infrastructure Services                           │
└──────────────────────────────────────────────────────────────────────┘

                    ▲ consumed by ▲
    ┌───────────────┴───────────────────────────────┐
    │           PYTHON SDK (pip install kraken-agent) │
    │   KrakenClient("http://...")                   │
    │   .chat()  .memory  .sessions  .skills         │
    └───────────────────────────────────────────────┘
```

---

## 3. Identity System

### 3.1 SOUL.md — Agent Personality

**Adopted from**: Hermes Agent (with enhancements)

The agent's identity lives in a single, editable Markdown file: `SOUL.md`.

```markdown
# SOUL.md

## Personality
You are Kraken, a knowledgeable and resourceful AI assistant...

## Values
- Honesty and transparency in communication
- User privacy and data sovereignty
- Continuous self-improvement
- ...

## Communication Style
- Concise and direct
- Uses technical vocabulary when appropriate
- Adapts formality to context
- ...

## Behavioral Boundaries
- Never fabricate information
- Always cite sources when possible
- Ask for clarification rather than assume
- ...
```

**Key design decisions**:
- **User-editable**: The user can modify `SOUL.md` to customize the agent's personality
- **Injected into system prompt**: SOUL.md content is included in every LLM call
- **Bounded size**: Maximum 2000 characters (enforced) — forces conciseness
- **Version-controlled**: Changes to SOUL.md are tracked so the user can revert

### 3.2 AGENTS.md — Project Context

**Adopted from**: Hermes Agent

An optional `AGENTS.md` file gives the agent project-specific context:

```markdown
# AGENTS.md

## Project: Kraken Agent
Description: Open-source autonomous AI agent
Tech Stack: TypeScript, Node.js, PostgreSQL
Repository: github.com/user/kraken-agent
Key Conventions: ...
```

---

## 4. Memory System (GraphRAG-Powered)

This is the most significant architectural innovation — replacing flat text memory with a structured knowledge graph.

### 4.1 Memory Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     MEMORY SYSTEM                                │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │              WORKING MEMORY (Context Window)             │     │
│  │  Current conversation + retrieved context + system prompt │     │
│  │  Budget: ~80% of model context window                     │     │
│  └─────────────────────────────────────────────────────────┘     │
│                          ▲                                        │
│           ┌──────────────┼──────────────┐                        │
│           ▼              ▼              ▼                        │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐            │
│  │   ENTITY     │ │  COMMUNITY   │ │  EPISODIC    │            │
│  │   MEMORY     │ │  MEMORY      │ │  MEMORY      │            │
│  │              │ │              │ │              │            │
│  │  Knowledge   │ │  Community   │ │  Conversation │            │
│  │  Graph nodes │ │  Summaries   │ │  Transcripts  │            │
│  │  & edges     │ │  (holistic)  │ │  (raw logs)   │            │
│  │              │ │              │ │              │            │
│  │  People      │ │  "Work"      │ │  Session #42  │            │
│  │  Projects    │ │  "Family"    │ │  Session #43  │            │
│  │  Preferences │ │  "Hobbies"   │ │  ...          │            │
│  │  Concepts    │ │  "Goals"     │ │              │            │
│  └──────────────┘ └──────────────┘ └──────────────┘            │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │              USER MODEL (Honcho-inspired)                │     │
│  │  Dialectic representation of user: facts, preferences,    │     │
│  │  communication style, goals, behavioral patterns          │     │
│  └─────────────────────────────────────────────────────────┘     │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │              SKILL MEMORY (Procedural)                    │     │
│  │  How-to documents for learned procedures                   │     │
│  │  Progressive disclosure: auto-loaded by relevance          │     │
│  └─────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 Knowledge Graph (Entity Memory)

**Adopted from**: GraphRAG (with real-time adaptation)

The knowledge graph is the agent's structured understanding of the world:

#### Entity Types (Domain-Specific)

| Entity Type | Examples | Properties |
|-------------|----------|------------|
| **Person** | User, colleagues, family | name, role, relationship_to_user |
| **Project** | Kraken Agent, client work | name, status, tech_stack, repo |
| **Preference** | "Prefers TypeScript", "Uses Vim" | category, value, confidence |
| **Concept** | "GraphRAG", "microservices" | domain, definition, related_topics |
| **Goal** | "Ship MVP by Q2", "Learn Rust" | description, deadline, status |
| **Tool** | VS Code, Docker, PostgreSQL | category, user_proficiency |
| **Event** | "Deployed v2.0", "Met with client" | date, participants, outcome |
| **Location** | Office, home, coworking space | type, context |

#### Relationship Types

| Relationship | Description | Example |
|-------------|-------------|---------|
| **works_on** | Person → Project | "User works_on Kraken Agent" |
| **uses** | Person/Project → Tool | "Kraken Agent uses TypeScript" |
| **prefers** | Person → Preference | "User prefers dark themes" |
| **relates_to** | Concept → Concept | "GraphRAG relates_to knowledge graphs" |
| **depends_on** | Project → Project | "Frontend depends_on API" |
| **scheduled_for** | Event → Date | "Demo scheduled_for Friday" |
| **has_goal** | Person → Goal | "User has_goal 'Ship MVP'" |
| **knows_about** | Person → Concept | "User knows_about Rust (beginner)" |

#### Incremental Graph Updates

Unlike batch GraphRAG, agent memory needs **real-time incremental updates**:

```
Conversation ends
       ↓
[1. Extract entities & relationships from new messages]
       → Use fast model (e.g., GPT-4o-mini / local model)
       → Domain-tuned extraction prompts
       ↓
[2. Entity Resolution]
       → Match extracted entities against existing graph
       → Deduplicate ("TypeScript" = "TS" = "typescript")
       → Merge properties
       ↓
[3. Graph Update]
       → Add new nodes and edges
       → Update weights on existing relationships
       → Update entity properties (e.g., project status changed)
       ↓
[4. Incremental Community Update]
       → Re-run clustering only on affected subgraph
       → Re-summarize only changed communities
       ↓
[5. User Model Update]
       → Update dialectic user representation
       → New preferences, communication patterns, goals
```

### 4.3 Community Memory (Holistic Understanding)

**Adopted from**: GraphRAG Leiden clustering + community summaries

Communities are **automatically discovered** clusters of related entities:

```
Community: "User's Active Work"
├── Entities: [Kraken Agent, TypeScript, PostgreSQL, GraphRAG, VS Code]
├── Summary: "User is actively building an open-source AI agent called 
│   Kraken using TypeScript and PostgreSQL, with GraphRAG for memory.
│   Primary development happens in VS Code."
└── Sub-communities:
    ├── "Kraken Architecture" → [Plugin system, Memory system, Identity]
    └── "Development Environment" → [VS Code, Docker, Node.js]
```

**Community summaries enable**:
- "What am I working on?" → Global search over community summaries
- "What are my strengths?" → Community summaries about user's skills
- "What patterns do you see?" → Cross-community theme analysis

### 4.4 Episodic Memory (Conversation Store)

**Adopted from**: Hermes (FTS5 session search) + OpenClaw (daily Markdown logs)

Raw conversation transcripts are stored and searchable:

| Feature | Implementation |
|---------|---------------|
| **Storage** | SQLite with FTS5 for full-text search |
| **Indexing** | Each message indexed with timestamp, role, session_id |
| **Search** | Keyword search (FTS5) + semantic search (vector embeddings) |
| **Summarization** | On-demand summarization of old sessions (Hermes pattern) |
| **Provenance** | GraphRAG entities link back to source episodes |
| **Retention** | Configurable: keep forever, auto-summarize after N days, etc. |

### 4.5 User Model (Dialectic)

**Adopted from**: Hermes Honcho integration

A structured, continuously-updated model of the user:

```markdown
# USER_MODEL.md (auto-maintained)

## Communication Style
- Prefers concise, direct answers
- Technical vocabulary acceptable
- Uses informal tone

## Expertise
- Expert: TypeScript, Node.js, PostgreSQL
- Intermediate: Python, Docker, Kubernetes
- Beginner: Rust, ML/AI

## Work Patterns
- Most productive mornings
- Prefers to plan before coding
- Reviews PRs thoroughly

## Current Goals
- Ship Kraken Agent MVP
- Learn GraphRAG internals
- Improve test coverage habits
```

### 4.6 Query Engine (Multi-Mode)

**Adopted from**: GraphRAG's 4 query modes, adapted for agent context

```typescript
interface MemoryQuery {
  text: string;
  mode: 'auto' | 'local' | 'global' | 'drift' | 'basic';
  timeRange?: { start: Date; end: Date };
  entityFilter?: string[];
  maxResults?: number;
}
```

| Mode | When Used | What It Does |
|------|-----------|-------------|
| **auto** | Default — agent picks best mode | Analyzes query intent, selects appropriate strategy |
| **local** | Specific entity questions | Finds entity → fans out to neighbors → gathers context |
| **global** | Holistic/overview questions | Maps over community summaries → reduces to answer |
| **drift** | Entity + broader context | Local search + community context enrichment |
| **basic** | Simple factual recall | Vector similarity search over episodic memory |

---

## 5. Skills System

### 5.1 Skills as Procedural Memory

**Adopted from**: Hermes Agent (with OpenClaw's plugin infrastructure)

Skills are **learned procedures** the agent can create, modify, and invoke:

```markdown
# skills/git-workflow.md

## Git Workflow
When the user asks to commit and push code:

1. Run `git status` to check for changes
2. Stage changed files: `git add -A`
3. Commit with descriptive message: `git commit -m "<summary>"`
4. Push to current branch: `git push`
5. If push fails due to upstream changes, pull with rebase first

## Learned Exceptions
- User prefers conventional commit format: `type(scope): description`
- User wants to review staged files before committing
- Never force push to main/master
```

### 5.2 Progressive Disclosure

**Adopted from**: Hermes Agent

Not all skills are loaded into every conversation:

```
System Prompt Assembly:
├── SOUL.md (always loaded, ~2000 chars)
├── AGENTS.md (always loaded if present, ~1000 chars)
├── User Model summary (~500 chars)
├── GraphRAG context (retrieved per-query, ~2000 chars)
├── Relevant skills (top-3 by semantic similarity, ~1500 chars)
└── Conversation history (remaining budget)
```

### 5.3 Self-Improvement Loop

**Adopted from**: Hermes Agent

```
Task execution
    ↓
[Reflection: Did the approach work?]
    ↓
[If new pattern learned → Create/update skill]
    ↓
[If existing skill was wrong → Modify skill]
    ↓
[Graph update: new entities/relationships from task]
```

---

## 6. Plugin System

### 6.1 Plugin Architecture

**Adopted from**: OpenClaw's 4-layer architecture (with security improvements)

```
┌──────────────────────────────────────────────────────┐
│                  PLUGIN LIFECYCLE                      │
│                                                        │
│  [1. Manifest]  →  [2. Validation]  →  [3. Loading]  │
│       ↓                   ↓                  ↓        │
│  Declare caps      Verify perms         Init plugin    │
│  & dependencies    & signatures         & sandbox      │
│                                              ↓        │
│                                     [4. Consumption]   │
│                                     Runtime capability  │
│                                     invocation          │
└──────────────────────────────────────────────────────┘
```

### 6.2 Capability Contracts

**Adopted from**: OpenClaw's typed capability contracts

Plugins declare what capabilities they provide and require:

```typescript
// Plugin manifest
interface PluginManifest {
  name: string;
  version: string;
  description: string;
  
  provides: CapabilityDeclaration[];  // What this plugin offers
  requires: CapabilityDeclaration[];  // What this plugin needs
  
  permissions: Permission[];          // Required permissions
  sandbox: SandboxConfig;             // Isolation requirements
}

// Capability types
type CapabilityType = 
  | 'tool'           // Function callable by the agent
  | 'memory'         // Memory pipeline plugin (context engine)
  | 'gateway'        // Communication channel
  | 'browser'        // Browser automation
  | 'storage'        // Storage backend
  | 'search'         // Search provider
  | 'model'          // LLM provider
  ;
```

### 6.3 Plugin Categories

| Category | Description | Examples |
|----------|-------------|---------|
| **Tool Plugins** | Functions the agent can call | File operations, API calls, calculations |
| **Memory Plugins** | Extend/replace memory pipeline | Custom entity extractors, alternative graph stores |
| **Gateway Plugins** | Communication channels | WhatsApp, Telegram, Discord, Slack |
| **Browser Plugins** | Web automation capabilities | CDP-based browsing, form filling, scraping |
| **Storage Plugins** | Data persistence backends | SQLite, PostgreSQL, S3, local filesystem |
| **Model Plugins** | LLM provider abstraction | OpenAI, Anthropic, local models (Ollama), Groq |

### 6.4 Security Model

**Improvements over**: OpenClaw (which runs plugins in-process)

| Mechanism | Description |
|-----------|-------------|
| **Process isolation** | Plugins run in separate processes / workers |
| **Permission system** | Declared permissions, user-approved at install |
| **Capability filtering** | Plugins only access capabilities they declared |
| **Resource limits** | CPU, memory, network, and filesystem limits per plugin |
| **Audit logging** | All plugin actions logged for user review |

---

## 7. Tool System

### 7.1 Built-in Tools

**Adopted from**: Hermes (categories) + OpenClaw (typed contracts)

| Category | Tools | Sandbox |
|----------|-------|---------|
| **Shell** | Terminal execution, command running | Sandboxed (Docker/VM) |
| **File** | Read, write, search, watch | Scoped to workspace |
| **Browser** | Navigate, click, extract, screenshot | CDP with profile isolation |
| **Search** | Web search, documentation search | Rate-limited |
| **Code** | Edit, refactor, test, build | Workspace scoped |
| **Memory** | Query graph, update entities, search episodes | Full access |
| **Communication** | Send messages (via gateway plugins) | User-approved |

### 7.2 Tool Execution

```typescript
interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
  // Execution metadata
  timeout: number;
  retryPolicy: RetryConfig;
  sandbox: SandboxType;
}

interface ToolResult {
  success: boolean;
  output: string;
  artifacts?: Artifact[];  // Files, screenshots, etc.
  sideEffects?: SideEffect[];  // What changed
}
```

### 7.3 Terminal Backends

**Adopted from**: Hermes Agent (6 backends)

| Backend | Use Case | Security |
|---------|----------|----------|
| **Local** | Development/personal use | User's machine |
| **Docker** | Sandboxed execution | Container isolation |
| **SSH** | Remote machine access | Key-based auth |
| **Cloud VM** | Temporary compute | Ephemeral, auto-cleanup |

---

## 8. Gateway Layer (Multi-Channel)

### 8.1 Architecture

**Adopted from**: OpenClaw's multi-channel gateway

```
┌─────────────────────────────────────────────────┐
│                  GATEWAY LAYER                    │
│                                                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│  │ WhatsApp │ │ Telegram │ │ Discord  │   ...    │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘         │
│       │             │            │                │
│       ▼             ▼            ▼                │
│  ┌──────────────────────────────────────────┐    │
│  │         MESSAGE NORMALIZER                │    │
│  │  Converts all formats → unified Message   │    │
│  └──────────────────┬───────────────────────┘    │
│                     ▼                             │
│  ┌──────────────────────────────────────────┐    │
│  │         SESSION MANAGER                   │    │
│  │  Routes messages to correct session       │    │
│  │  Manages conversation state               │    │
│  └──────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

### 8.2 Unified Message Format

```typescript
interface Message {
  id: string;
  sessionId: string;
  channel: string;          // 'whatsapp' | 'telegram' | 'discord' | ...
  role: 'user' | 'assistant' | 'system';
  content: MessageContent;  // text, image, file, etc.
  timestamp: Date;
  metadata: Record<string, unknown>;
}
```

---

## 9. Context Assembly Pipeline

### 9.1 How Context Is Built Per Request

This is the critical pipeline that assembles the agent's context for each LLM call:

```
User Message arrives
       ↓
[1. Session Resolution]
       → Identify or create session
       → Load conversation history
       ↓
[2. Memory Retrieval]
       → Query knowledge graph (auto-mode selects Local/Global/DRIFT)
       → Retrieve relevant community summaries
       → Search episodic memory for relevant past conversations
       → Load user model summary
       ↓
[3. Skill Selection]
       → Semantic search over skill library
       → Select top-N most relevant skills
       → Apply progressive disclosure budget
       ↓
[4. Context Assembly]
       → SOUL.md (identity)
       → AGENTS.md (project context)
       → User model summary
       → Retrieved memory context (graph + episodic)
       → Selected skills
       → Available tools
       → Conversation history (most recent, within budget)
       ↓
[5. Budget Enforcement]
       → Total context must fit within model's context window
       → Priority: identity > user model > memory > skills > history
       → Truncate/summarize lowest priority items if over budget
       ↓
[6. LLM Call]
       → Send assembled context to LLM
       → Parse response for tool calls, memory updates, skill creation
       ↓
[7. Post-Processing]
       → Execute tool calls
       → Queue memory graph updates
       → Check for skill creation/modification
       → Send response via gateway
```

### 9.2 Context Budget Allocation

```
Model Context Window (e.g., 128K tokens)
├── System Prompt + SOUL.md        [  4K] (fixed)
├── AGENTS.md                      [  2K] (fixed, if present)
├── User Model                     [  1K] (fixed)
├── GraphRAG Memory Context        [  8K] (variable, from retrieval)
├── Relevant Skills                [  4K] (variable, top-N)
├── Available Tools Schema         [  4K] (fixed)
├── Episodic Memory (search hits)  [  4K] (variable)
├── Conversation History           [ 96K] (fills remaining budget)
└── Response Budget                [  5K] (reserved for output)
```

---

## 10. Data Flow & Lifecycle

### 10.1 Conversation Lifecycle

```
[Start Session]
     ↓
[Receive Message] ◀──┐
     ↓                │
[Assemble Context]    │
     ↓                │
[LLM Reasoning]       │
     ↓                │
[Execute Actions]     │  (loop per conversation turn)
     ↓                │
[Send Response]       │
     ↓                │
[Update Working Memory]
     ↓                │
[Continue?] ──Yes─────┘
     │
     No
     ↓
[End Session]
     ↓
[Post-Session Processing]
     ├── Extract entities & relationships → update knowledge graph
     ├── Update community structure (incremental Leiden)
     ├── Re-summarize affected communities
     ├── Update user model
     ├── Store session in episodic memory
     └── Check for skill creation opportunities
```

### 10.2 Memory Update Flow

```
New information (conversation, tool output, observation)
     ↓
[Entity Extraction] — fast model, domain-tuned prompts
     ↓
[Entity Resolution] — match against existing graph
     ├── New entity → add node
     ├── Existing entity → update properties
     └── Duplicate → merge
     ↓
[Relationship Extraction] — identify connections
     ├── New relationship → add edge
     └── Existing relationship → update weight/description
     ↓
[Incremental Clustering] — re-run Leiden on affected subgraph
     ↓
[Community Summary Update] — re-summarize changed communities only
     ↓
[User Model Update] — reflect new knowledge about user
```

---

## 11. Technology Stack

### 11.1 Recommended Stack

| Layer | Technology | Rationale |
|-------|-----------|----------|
| **Runtime** | Node.js / TypeScript | Type safety, async I/O, large ecosystem, OpenClaw-proven |
| **API Framework** | Hono | Fast, lightweight, runs everywhere, built-in validation |
| **LLM Integration** | AI SDK (Vercel) | Multi-provider, streaming, tool calling support |
| **Knowledge Graph** | Neo4j 5 Community | Native graph DB, Cypher queries, APOC procedures, community edition free |
| **Vector + Relational** | PostgreSQL + pgvector | Episodes, skills, FTS, embeddings — one production-grade store |
| **Queue / Cache** | Redis + BullMQ | Background jobs (entity extraction, community updates), session cache |
| **Plugin Isolation** | Node.js Worker Threads / subprocess | Process-level isolation |
| **Browser Automation** | Playwright (CDP) | Multi-browser, reliable, well-maintained |
| **Python SDK** | httpx + pydantic | Typed client, sync + async, pip-installable |
| **Deployment** | Docker Compose | Single `docker compose up` to run the full stack |
| **Configuration** | Environment variables + .env | 12-factor app, works with Docker/K8s |

### 11.2 Docker Compose Services

| Service | Image / Build | Purpose |
|---------|--------------|----------|
| `kraken-api` | `./server` (custom) | Core API server — Hono on port 8080 |
| `worker` | `./server` (same image, different entrypoint) | Background BullMQ workers for GraphRAG extraction, community updates |
| `postgres` | `pgvector/pgvector:pg17` | Episodic memory, skills, user model, vector embeddings |
| `neo4j` | `neo4j:5-community` | Knowledge graph: entities, relationships, communities |
| `redis` | `redis:7-alpine` | Job queues, session cache, pub/sub |

### 11.3 Data Storage

```
Docker volumes:
├── postgres-data/        # PostgreSQL data (episodes, skills, vectors)
├── neo4j-data/           # Neo4j graph data (entities, relationships, communities)
├── redis-data/           # Redis persistence (queue state)
└── kraken-data/          # App data volume
    ├── soul.md           # Agent personality
    ├── agents.md         # Project context (optional)
    ├── plugins/          # Loaded plugins
    └── logs/             # Audit trail
```

### 11.4 Python SDK (`pip install kraken-agent`)

The SDK is a thin, typed client that wraps the REST API:

```python
from kraken import KrakenClient

# Point at any Kraken instance
client = KrakenClient("http://localhost:8080", api_key="sk-...")

# Every API surface is available
client.chat("Hello!")                     # → ChatResponse
client.sessions.create()                   # → Session
client.memory.query("what do I know?")     # → MemoryQueryResult
client.skills.list()                        # → list[Skill]
client.identity.get_soul()                  # → Soul
```

- **Sync + async transports** (httpx)
- **Pydantic models** for all request/response types
- **Streaming** support for chat
- **Context manager** for connection lifecycle
- **Zero dependencies beyond httpx + pydantic**

---

## 12. Development Phases

### Phase 1: Core Foundation
- [ ] Project scaffolding (TypeScript, build system, testing)
- [ ] Docker Compose stack (API + PostgreSQL + Redis + Neo4j)
- [ ] Identity system (SOUL.md loading and injection)
- [ ] Hono API server with auth, health, chat endpoints
- [ ] Basic LLM integration (multi-provider via AI SDK)
- [ ] Basic memory (PostgreSQL episodic store + pgvector)
- [ ] Python SDK — `pip install kraken-agent` with chat + sessions

### Phase 2: GraphRAG Memory
- [ ] Entity extraction pipeline (LLM-powered)
- [ ] Knowledge graph storage (Neo4j)
- [ ] Entity resolution / deduplication
- [ ] Leiden community detection (incremental)
- [ ] Community summarization
- [ ] Multi-mode query engine (local, global, drift, basic)
- [ ] Context assembly pipeline with graph retrieval

### Phase 3: Skills & Self-Improvement
- [ ] Skill file format and loading
- [ ] Progressive disclosure (semantic similarity ranking)
- [ ] Skill creation from conversation
- [ ] Skill modification and versioning
- [ ] Self-improvement reflection loop

### Phase 4: Plugin System
- [ ] Plugin manifest format
- [ ] Plugin loading and validation
- [ ] Capability contract system
- [ ] Process isolation for plugins
- [ ] Permission system
- [ ] Plugin marketplace / registry

### Phase 5: Multi-Channel & Browser
- [ ] Gateway abstraction layer
- [ ] CLI gateway (primary)
- [ ] Web UI gateway
- [ ] Telegram gateway
- [ ] Browser automation (Playwright/CDP)
- [ ] Multi-profile browser support

### Phase 6: Advanced Features
- [ ] User model (dialectic, auto-maintained)
- [ ] RL / trajectory collection for fine-tuning
- [ ] Background task execution
- [ ] Scheduled actions
- [ ] Multi-agent collaboration

---

## 13. Key Architectural Decisions

### 13.1 Why TypeScript Over Python

| Factor | TypeScript | Python |
|--------|-----------|--------|
| **Type Safety** | Native, excellent tooling | Requires mypy, partial |
| **Async I/O** | First-class (Node.js event loop) | asyncio (good but secondary) |
| **Plugin Ecosystem** | npm (massive) | pip (massive, different strengths) |
| **Web/Gateway** | Natural fit (Express, Fastify) | Django/FastAPI (good but heavier) |
| **LLM SDKs** | AI SDK, LangChain.js | LangChain, LlamaIndex (more mature) |
| **User Adoption** | More web developers | More ML/AI researchers |

**Decision**: TypeScript — better for the gateway-centric, plugin-heavy architecture. Python SDKs for GraphRAG components can be used via subprocess if needed.

### 13.2 Why Neo4j in Docker Compose

| Factor | SQLite Graph | Neo4j in Docker |
|--------|-------------|-----------------|
| **Deployment** | Zero-dependency, embedded | One `docker compose up` — no manual install |
| **Graph Queries** | Custom query layer needed | Cypher — powerful, battle-tested |
| **Community Detection** | Must implement from scratch | APOC + GDS library support |
| **Scale** | Millions of nodes (personal agent) | Billions if needed |
| **Visualization** | None built-in | Neo4j Browser on port 7474 for free |
| **Portability** | Single file | Docker volume, easy backup with `docker cp` |

**Decision**: Neo4j Community Edition in Docker. The Docker Compose model eliminates the "requires separate server" objection — it's just another container. Cypher queries and built-in graph algorithms are worth it for a GraphRAG agent.

### 13.3 Why Not Just Use Microsoft's GraphRAG

Microsoft's GraphRAG is designed as a **batch indexing pipeline** for static document corpora. Agent memory needs:
- **Incremental updates** (not full re-index)
- **Real-time queries** (not batch processing)
- **Personal entity types** (preferences, goals, not just NER)
- **Temporal awareness** (recency matters)
- **Integration with conversation flow** (not standalone CLI)

**Decision**: Implement GraphRAG concepts (entity extraction, Leiden clustering, community summaries, multi-mode queries) natively in TypeScript, adapted for real-time agent memory. Use Microsoft's research as the theoretical foundation, not the implementation.

### 13.4 Memory Boundedness

**From Hermes**: All memory stores have explicit size limits:

| Store | Budget | When Full |
|-------|--------|-----------|
| **Working memory** | Model context window | Truncate old conversation turns |
| **Entity memory** | 100K entities (configurable) | Prune low-importance, old entities |
| **Community summaries** | Dynamic (one per community) | Merge small communities |
| **Episodic memory** | 1M messages (configurable) | Summarize + archive old sessions |
| **Skill memory** | 200 skills (configurable) | Archive unused skills |
| **User model** | 2000 chars | LLM compresses to fit |

---

## 14. Comparison Summary

| Feature | Hermes | OpenClaw | GraphRAG | **Kraken (Proposed)** |
|---------|--------|----------|----------|----------------------|
| **Identity** | SOUL.md ✅ | None ❌ | N/A | SOUL.md ✅ |
| **Memory Structure** | Flat text 📄 | Flat Markdown 📄 | Knowledge graph 🕸️ | **Knowledge graph** 🕸️ |
| **Relational Reasoning** | None ❌ | None ❌ | Full ✅ | **Full** ✅ |
| **Holistic Queries** | None ❌ | None ❌ | Community summaries ✅ | **Community summaries** ✅ |
| **Plugin System** | None ❌ | 4-layer typed ✅ | N/A | **4-layer typed + sandboxed** ✅ |
| **Multi-Channel** | CLI only 📟 | 6 channels ✅ | N/A | **Multi-channel** ✅ |
| **Browser** | Basic 🌐 | CDP + multi-profile ✅ | N/A | **CDP + profiles** ✅ |
| **Skills** | Self-taught ✅ | Markdown + hot reload ✅ | N/A | **Self-taught + progressive** ✅ |
| **Search** | FTS5 keyword 🔍 | BM25 + vector 🔍 | Graph + vector 🔍 | **Graph + vector + FTS5** ✅ |
| **User Model** | Honcho dialectic ✅ | None ❌ | N/A | **Dialectic** ✅ |
| **Self-Improvement** | RL trajectories ✅ | None ❌ | N/A | **Reflection loop** ✅ |
| **License** | MIT ✅ | Source-available ⚠️ | MIT ✅ | **MIT** ✅ |
| **Language** | Python 🐍 | TypeScript 📘 | Python 🐍 | **TypeScript** 📘 |
| **Sandbox** | 6 backends ✅ | None ❌ | N/A | **Docker + VM** ✅ |

---

## 15. Summary

Kraken Agent takes the **identity discipline and self-improvement** from Hermes, the **plugin architecture and multi-channel reach** from OpenClaw, and makes the fundamental leap from **flat text memory to GraphRAG-powered knowledge graphs**. This combination produces an agent that:

1. **Has a consistent personality** — SOUL.md ensures coherent behavior across all channels
2. **Truly understands the user** — knowledge graph connects dots that flat text cannot
3. **Grows smarter over time** — skills system + graph memory compound learning
4. **Extends itself** — plugin system allows community contributions and customization
5. **Meets users where they are** — multi-channel gateway (chat, CLI, web, API)
6. **Respects privacy** — local-first SQLite, user-controlled memory, audit logging
7. **Is genuinely open-source** — MIT license, TypeScript for accessibility, clean architecture
