# HANDOFF.md — Codex Pickup Gate

> **v0.1 gate (Tasks 1–23 + 8.5 + 22.5): COMPLETE.** `feat/v0.1-implementation`
> was merged to `main` and the branch no longer exists. Scope has since grown
> well past the original v0.1 MCP-server plan (dashboard, console-gateway,
> telegram-alert/daemon, compass-backtest, intelligence-collect/export,
> `src/intelligence_core/`). This file previously still pointed Codex at the
> old branch and task list — that was stale and has been corrected below.

## Active pickup: history collection operationalization

- Plan: `plans/2026-09-04-history-collection-operationalization.md`
- Why: `upbit-autotrader-research` already exercised the full cross-repo
  export → bundle pipeline end-to-end (real commit, real checksums — see that
  repo's `docs/validation/H_ETH_READINESS_V1.md`) and got `DATA_NOT_READY`
  because no history has ever actually been collected. This plan is the fix:
  operationalize scheduled collection + backfill. It does not touch
  `upbit-autotrader-research`.
- Read `docs/architecture/crypto-intelligence-roadmap.md` (§9, items 5–6) and
  `docs/implementation/2026-08-31-intelligence-research-export.md` for full
  context before starting.

## Branch state

- Working branch: `main` (no active feature branch as of this handoff)
- Do not check out `feat/v0.1-implementation` — it is merged and deleted.

## Constraints

1. **TDD discipline**: write the failing test first, run to confirm it fails, implement minimum, run to confirm pass, commit.
2. **No new dependencies** beyond those declared in `package.json` without an ADR justifying.
3. **`config/pulse.yaml`** is the source of truth for composite weights — do not hardcode in TypeScript.
4. **BYOK keys via env vars only** — never read from disk, never log.
5. History persistence exists (`FileHistoryStore`, ADR-0003) — reuse it, do not fork it.
6. Node engine requirement is `>=24` (`package.json` `engines`) — verify against whatever runner executes a new scheduled workflow; do not assume parity with local/dev Node.

## Pre-handoff gate (must check ☑)

- ☑ Cross-repo pipeline already verified end-to-end from the research side (`upbit-autotrader-research` commit history, `H_ETH_READINESS_V1.md`)
- ☑ Root cause of `DATA_NOT_READY` isolated to missing scheduled collection + backfill, not a code defect
- ☑ Plan written: `plans/2026-09-04-history-collection-operationalization.md`
- ☐ ADR for persistence-target decision (Task 1) — write before implementing the workflow

## Post-handoff gate (Codex returns work; verify before merge)

- ☐ Scheduled workflow runs `intelligence-collect` and produces append-only, non-empty history for at least the three H-ETH-01 candidate metrics
- ☐ Backfill implemented for `eth.net_issuance_eth` with an explicit source-boundary manifest
- ☐ Data-quality report exists
- ☐ `npm run typecheck` / `npm run test` / `npm run build` all green
- ☐ No BYOK secret appears in any workflow log or diff
- ☐ `upbit-autotrader-research`'s bundle builder/validator files are untouched
- ☐ `docs/validation/H_ETH_READINESS_V1.md` in `upbit-autotrader-research` re-run and updated (Task 4) — not edited by hand to force a pass
- ☐ Cross-model review before merge to `main` (Opus `/review`, `/security-review`; `/codex:adversarial-review`)

## Codex shell preflight

```bash
git checkout main
git pull
npm install
npm run typecheck && npm run test && npm run build
```

If preflight fails, do not start — escalate.
