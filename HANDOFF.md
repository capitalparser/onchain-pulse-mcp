# HANDOFF.md — Codex Pickup Gate

> **Status**: NOT READY. Pending: `/grill-with-docs` + cross-model plan review.

## What Codex receives

- `plans/2026-05-08-onchain-pulse-mcp.md` — 23-task TDD plan (source of truth)
- `docs/superpowers/specs/2026-05-08-onchain-pulse-mcp-design.md` — design spec
- `CONTEXT.md` — domain dictionary (must be populated before handoff)
- `docs/adr/` — must include ADR-0001 (domain seed) and plan-review findings

## Branch state

- Working branch: `feat/v0.1-implementation`
- Already done: Task 1 scaffolding (commit `85aba76` — TypeScript + vitest + tsup baseline). Codex starts at Task 2.
- Not on `main`: do not merge until cross-model code review complete.

## Tasks for Codex (Tasks 2–23)

Per `plans/2026-05-08-onchain-pulse-mcp.md`. Each task includes red→green→commit steps. Follow plan exactly; deviations require an ADR.

## Constraints

1. **TDD discipline**: write the failing test first, run to confirm it fails, implement minimum, run to confirm pass, commit. Plan steps are explicit about this.
2. **No new dependencies** beyond those declared in `package.json` without an ADR justifying.
3. **`config/mood.yaml`** is the source of truth for composite weights — do not hardcode in TypeScript.
4. **stdio transport only** in v0.1; HTTP is v0.4.
5. **No persistence**; in-memory cache only (`lru-cache`).
6. **Locale**: `summary` field defaults to English; `OPM_LANG=ko` switches to Korean. Both branches required.
7. **BYOK keys via env vars only** — never read from disk, never log.

## Pre-handoff gate (must check ☑)

- ☐ `CONTEXT.md` populated (post `/grill-with-docs`)
- ☐ `docs/adr/0001-domain.md` written
- ☐ Plan cross-model review complete:
    - ☐ Opus `/plan-eng-review` (separate session)
    - ☐ `/codex:rescue` (or `/codex:review`)
    - ☐ Differences merged into plan or recorded in ADR
- ☐ This file updated with any plan-review-driven changes

## Post-handoff gate (Codex returns work; verify before merge)

- ☐ All 22 task commits exist on `feat/v0.1-implementation` (Task 2 through Task 23)
- ☐ `npm run typecheck` / `npm run test` / `npm run build` all green
- ☐ `dist/index.js` has shebang and runs as `node dist/index.js`
- ☐ Cross-model code review:
    - ☐ Opus `/review`
    - ☐ Opus `/security-review`
    - ☐ `/codex:adversarial-review`
    - ☐ Findings in `docs/adr/{NNNN}-review-findings.md`
- ☐ Merge `feat/v0.1-implementation` → `main`
- ☐ Tag `v0.1.0`
- ☐ `npm publish` (after `npm whoami` and 2FA confirmed)

## Codex shell preflight

```bash
cd /Users/kjun/vault/01_Projects/onchain-pulse-mcp
git checkout feat/v0.1-implementation
npm install
npm run typecheck && npm run test && npm run build
```

If preflight fails, do not start Tasks 2–23 — escalate.
