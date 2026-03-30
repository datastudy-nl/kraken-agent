# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-03-29

### Added

- Core API server with Hono framework
- GraphRAG memory system with Neo4j knowledge graph
- Five query modes: auto, local, global, drift, basic
- SOUL.md personality system with auto-maintained user model
- Session routing with stable keys and context compaction
- Self-improving skills via reflection loop
- Background worker with BullMQ (entity extraction, community detection, dream cycle)
- Built-in tools: browser automation (Playwright/Chromium), sandboxed code execution (Docker)
- Cron-based task scheduling
- OpenAI-compatible `/v1/chat/completions` endpoint
- Cross-platform identity linking
- Python SDK (`pip install kraken-agent`)
- Docker Compose deployment (PostgreSQL + pgvector, Neo4j 5, Redis 7, Browserless)
- Documentation site (Eleventy) at kraken-agent.com

[Unreleased]: https://github.com/kraken-agent/kraken-agent/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/kraken-agent/kraken-agent/releases/tag/v0.1.0
