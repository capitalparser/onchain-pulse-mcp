# HANDOFF.md — Codex Pickup Gate

> **Status**: NOT READY. Pending: `/codex:rescue` (Codex phase of cross-model plan review). Opus phase complete (ADR-0002).

## What Codex receives

- `plans/2026-05-08-onchain-pulse-mcp.md` — TDD plan, **24 tasks** (Tasks 1–23 + Task 8.5 + Task 22.5 inserted by ADR-0002)
- `docs/superpowers/specs/2026-05-08-onchain-pulse-mcp-design.md` — design spec
- `CONTEXT.md` — domain dictionary (populated by `/grill-with-docs`, commit `5cc236d`)
- `docs/adr/` — ADR-0000 (Tier 3 alignment), ADR-0001 (domain language), ADR-0002 (plan review findings, Opus phase), ADR-0003 (history persistence design)

## Branch state

- Working branch: `feat/v0.1-implementation`
- Already done: Task 1 scaffolding (commit `85aba76` — TypeScript + vitest + tsup baseline). Codex starts at Task 2.
- Not on `main`: do not merge until cross-model code review complete.

## Tasks for Codex (Tasks 2–23, including Task 8.5 + Task 22.5)

Per `plans/2026-05-08-onchain-pulse-mcp.md`. Each task includes red→green→commit steps. Follow plan exactly; deviations require an ADR. Task 8.5 (history persistence) and Task 22.5 (warmup CLI) were inserted post-Opus-review per ADR-0002 / ADR-0003 — read those ADRs before starting Task 8.5.

## Constraints

1. **TDD discipline**: write the failing test first, run to confirm it fails, implement minimum, run to confirm pass, commit. Plan steps are explicit about this.
2. **No new dependencies** beyond those declared in `package.json` without an ADR justifying.
3. **`config/pulse.yaml`** is the source of truth for composite weights — do not hardcode in TypeScript.
4. **stdio transport only** in v0.1; HTTP is v0.4.
5. **No persistence**; in-memory cache only (`lru-cache`).
6. **Locale**: `summary` field defaults to English; `OPM_LANG=ko` switches to Korean. Both branches required.
7. **BYOK keys via env vars only** — never read from disk, never log.

## Pre-handoff gate (must check ☑)

- ☑ `CONTEXT.md` populated (post `/grill-with-docs`, commit `5cc236d`)
- ☑ `docs/adr/0001-domain-frame-and-language.md` written
- Plan cross-model review:
    - ☑ Opus `/plan-eng-review` (this session, 2026-05-09 — findings in ADR-0002, plan amended with Task 8.5 + Task 22.5)
    - ☐ `/codex:rescue` (or `/codex:review`) — pending
    - ☐ Differences merged into plan or recorded in ADR-0004 (if any)
- ☑ This file updated with plan-review-driven changes (2026-05-09)

## Post-handoff gate (Codex returns work; verify before merge)

- ☐ All task commits exist on `feat/v0.1-implementation` (Task 2 through Task 23, plus Task 8.5 and Task 22.5)
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
