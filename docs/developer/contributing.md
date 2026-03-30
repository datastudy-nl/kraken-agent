---
layout: layouts/docs.njk
title: Contributing
description: Development setup, conventions, and PR process
---

# Contributing

Kraken Agent is open source and welcomes contributions. This guide covers the development setup, project conventions, and PR process.

## Development Setup

### Prerequisites

- **Node.js 22+** — The server is TypeScript
- **Python 3.11+** — For the SDK
- **Docker & Docker Compose** — For PostgreSQL, Neo4j, Redis, and Browserless
- **Git**

### Clone and install

```bash
git clone https://github.com/kraken-agent/kraken-agent.git
cd kraken-agent
```

### Start infrastructure

```bash
docker compose up -d postgres neo4j redis browserless
```

### Server

```bash
cd server
npm install
cp .env.example .env   # Edit with your LLM API key
npm run db:push         # Apply database schema
npm run dev             # Start with hot reload
```

The server runs on `http://localhost:8080` by default.

### Python SDK

```bash
cd sdk/python
pip install -e ".[dev]"   # Editable install with dev dependencies
```

---

## Project Structure

See [Project Structure](project-structure.md) for a detailed breakdown of every directory and file.

Quick overview:

```
server/           # TypeScript API + worker
  src/
    api/          # Route handlers (Hono)
    services/     # Business logic
    db/           # Drizzle schema + migrations
sdk/
  python/         # Python SDK (httpx + Pydantic)
docs/             # This documentation site
docker-compose.yml
```

---

## Code Conventions

### TypeScript (server)

- **Framework:** Hono for HTTP routing
- **ORM:** Drizzle for PostgreSQL
- **Queues:** BullMQ on Redis
- **AI:** Vercel AI SDK for LLM calls
- **Style:** Consistent with existing code. No specific linter enforced yet.

### Python (SDK)

- **HTTP:** httpx (sync)
- **Models:** Pydantic v2 for all API types
- **Style:** Standard Python conventions. Type hints on all public APIs.

### Commits

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(memory): add time range filter to query endpoint
fix(sessions): prevent duplicate session key creation
docs: update quickstart guide
chore: bump dependencies
```

---

## Making Changes

### 1. Create a branch

```bash
git checkout -b feat/my-feature
```

### 2. Make your changes

- **Server changes:** Edit files in `server/src/`, the dev server hot-reloads
- **SDK changes:** Edit files in `sdk/python/kraken/`, reinstall with `pip install -e .` if needed
- **Docs changes:** Edit files in `docs/`, preview with `npm run docs:dev`

### 3. Test

```bash
# Server
cd server
npm test

# SDK
cd sdk/python
pytest

# Docs
npm run docs:dev   # Preview at http://localhost:8080
```

### 4. Submit a PR

```bash
git push origin feat/my-feature
```

Then open a pull request on GitHub. Include:

- A clear description of what changed and why
- Any breaking changes noted
- Screenshots if the change affects UI or output

---

## Development Tips

### Previewing docs locally

```bash
npm install
npm run docs:dev
```

Opens at `http://localhost:8080` with hot reload.

### Database changes

The project uses Drizzle ORM. To modify the schema:

1. Edit `server/src/db/schema.ts`
2. Run `npm run db:push` to apply changes
3. For production, generate a migration: `npm run db:generate`

### Testing GraphRAG memory

Use the API directly to test entity extraction and graph queries:

```bash
# Add entities manually
curl -X POST http://localhost:8080/v1/memory/entities \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Project", "type": "project"}'

# Query the graph
curl -X POST http://localhost:8080/v1/memory/query \
  -H "Content-Type: application/json" \
  -d '{"query": "What projects exist?", "mode": "local"}'
```

### Debugging the worker

The worker runs in a separate process. Start it independently for debugging:

```bash
cd server
npm run worker
```

Worker logs show entity extraction, community detection, skill reflection, and dream cycle activity.

---

## Areas for Contribution

Contributions are welcome in all areas. Some particularly impactful ones:

- **New integrations** — Telegram, Slack, Matrix, or other platforms
- **Tool implementations** — New built-in tools (calendar, git, file system, etc.)
- **Memory improvements** — Better entity extraction, graph algorithms, query strategies
- **SDK ports** — TypeScript/JavaScript SDK, Go SDK, Rust SDK
- **Documentation** — Examples, tutorials, better explanations
- **Tests** — Unit tests, integration tests, end-to-end tests
