# CLAUDE.md — onchain-pulse-mcp

> Cascade: vault `CLAUDE.md` (`~/vault/CLAUDE.md`) → `01_Projects/CLAUDE.md` (Tier 3 zone) → this file.

## Project identity

- **GitHub origin**: `capitalparser/onchain-pulse-mcp` (public, MIT)
- **Type**: OSS read-only MCP server
- **Tier**: 3 (New Module) — Codex handoff workflow obligatory.
- **Branch**: `feat/v0.1-implementation` for v0.1 work; merge to `main` after cross-model code review.

## Stack

- TypeScript 5.x, Node 20+
- `@modelcontextprotocol/sdk`, `zod`, `lru-cache`, `yaml`, `cheerio`
- `vitest` (testing), `tsup` (bundle)
- Distribution: npm (`npx onchain-pulse-mcp`)

## Domain

See `CONTEXT.md` (seeded by `/grill-with-docs`) and `docs/adr/0001-domain-frame-and-language.md`.

## Workflow gate

Implementation is delegated to **Codex CLI** through `HANDOFF.md`. Claude (Opus) responsibilities are limited to: design spec, plan, scaffold, ADRs, cross-model reviews, merge decisions. Claude must not implement Tasks 2–23 plus Task 8.5, Task 16a/b/c, and Task 22.5 of `plans/2026-05-08-onchain-pulse-mcp.md` directly.

## Documents

- `plans/2026-05-08-onchain-pulse-mcp.md` — v0.1 TDD plan (source of truth for implementation)
- `docs/superpowers/specs/2026-05-08-onchain-pulse-mcp-design.md` — design spec
- `CONTEXT.md` — domain dictionary (Mattpocock seed)
- `HANDOFF.md` — Codex pickup gate
- `docs/adr/` — architecture decisions
