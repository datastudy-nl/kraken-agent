# Contributing to Kraken Agent

Thanks for your interest in contributing! This guide will help you get started.

## Development Setup

### Prerequisites

- **Node.js 22+**
- **Python 3.11+** (for the SDK)
- **Docker & Docker Compose**

### Quick Start

```bash
# Clone the repo
git clone https://github.com/kraken-agent/kraken-agent.git
cd kraken-agent

# Start infrastructure
docker compose up -d postgres neo4j redis chromium

# Server setup
cd server
npm install
cp ../.env.example ../.env   # Edit with your LLM API key
npm run db:push
npm run dev                   # http://localhost:8080

# Python SDK (optional)
cd ../sdk/python
pip install -e ".[dev]"
```

## Making Changes

1. **Fork** the repo and create a feature branch from `main`
2. Make your changes
3. Run tests:
   ```bash
   # Server
   cd server && npm test

   # SDK
   cd sdk/python && pytest
   ```
4. Commit using [Conventional Commits](https://www.conventionalcommits.org/):
   ```
   feat(memory): add time range filter to query endpoint
   fix(sessions): prevent duplicate session key creation
   docs: update quickstart guide
   ```
5. Open a **Pull Request** against `main`

## Project Structure

```
server/         → TypeScript API + background worker
sdk/python/     → Python SDK (pip install kraken-agent)
docs/           → Documentation site (MkDocs Material)
```

## Code Style

- **TypeScript:** Follow existing patterns. Use Hono for routes, Drizzle for DB.
- **Python:** Type hints on all public APIs. Pydantic v2 for models.
- No specific formatter is enforced yet — match the style of surrounding code.

## What to Contribute

- **Integrations** — Telegram, Slack, Matrix bots
- **Tools** — New built-in agent tools
- **Memory** — Graph algorithms, query strategies
- **SDK ports** — TypeScript, Go, Rust SDKs
- **Tests** — Unit, integration, e2e
- **Docs** — Tutorials, examples, translations

## Reporting Bugs

Open an [issue](https://github.com/kraken-agent/kraken-agent/issues) with:
- Steps to reproduce
- Expected vs actual behavior
- Kraken version, OS, Docker version

## Security Issues

**Do not open a public issue for security vulnerabilities.** See [SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
