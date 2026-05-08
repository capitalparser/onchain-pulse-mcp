# ADR-0000: Tier 3 Workflow Alignment (Mid-stream Correction)

- **Status**: Accepted
- **Date**: 2026-05-08
- **Decider**: Kim Kyung-jun

## Context

`onchain-pulse-mcp` is a new project placed under `~/vault/01_Projects/`, the **Heavy Zone** that mandates the Tier 3 workflow defined in `01_Projects/CLAUDE.md`. That CLAUDE.md prescribes:

1. `/grill-with-docs` → `CONTEXT.md` + `docs/adr/0001-domain.md` (Opus)
2. `/office-hours` → YC 6 forcing questions (Opus)
3. `/superpowers:brainstorming` → spec
4. `/superpowers:writing-plans` → `plans/{date}-{title}.md`
5. **Plan cross-model 2-stage review** (mandatory for Tier 3):
   - (a) New Opus session `/plan-eng-review`
   - (b) `/codex:rescue` or `/codex:review`
   - Differences merged into plan or ADR
6. `/superpowers:executing-plans` — Claude (Opus) writes scaffold/skeleton only
7. `HANDOFF.md` → **Codex CLI takes over** (code + tests + debug)
8. **Code cross-model 2-stage review** (mandatory):
   - (a) Opus `/review` + `/security-review`
   - (b) `/codex:adversarial-review`
   - Differences recorded in `docs/adr/{NNNN}-review-findings.md`

The standard scaffold for `01_Projects/{project}/` includes `CLAUDE.md` (project), `CONTEXT.md`, `HANDOFF.md`, `docs/adr/`, `plans/`, `src/`, `tests/`.

## What actually happened

Initial work proceeded under the generic `superpowers` flow without loading the `01_Projects/CLAUDE.md` zone instructions. Specifically:

- ✅ `superpowers:brainstorming` ran → design spec written.
- ✅ `superpowers:writing-plans` ran → 23-task plan written (committed at `d22cae3`).
- ❌ `grill-with-docs` skipped → `CONTEXT.md` not seeded.
- ❌ `office-hours` skipped.
- ❌ Plan cross-model review skipped.
- ❌ Standard scaffold (project `CLAUDE.md`, `CONTEXT.md`, `HANDOFF.md`, `docs/adr/`) not created — files were instead placed under `docs/superpowers/{plans,specs}/`.
- ❌ Implementation began via `superpowers:subagent-driven-development` with Sonnet subagents instead of via Codex handoff.
- ⚠️ Task 1 (TypeScript scaffolding) was completed via Sonnet subagent + Sonnet spec reviewer (commit `85aba76`).

The `01_Projects/CLAUDE.md` zone instructions surfaced via system reminder mid-execution — after Task 1 was already committed.

## Decision

Realign immediately to Tier 3.

1. **Keep**: Task 1 scaffolding commit `85aba76`. It is project init (TypeScript config, vitest, tsup, smoke test) — not domain code. Re-doing it through Codex would be churn for no quality gain. The risk surface is package.json + config files, which the Sonnet spec reviewer independently verified.
2. **Discard**: The plan to execute Tasks 2–23 via Sonnet subagents. These are now delegated to Codex per the standard Tier 3 path.
3. **Rebuild scaffold to standard**:
   - `git mv docs/superpowers/plans/ → plans/`
   - Add project `CLAUDE.md`, `CONTEXT.md` (seed), `HANDOFF.md` (gate document)
   - Add `docs/adr/` directory with this ADR-0000.
   - Spec stays at `docs/superpowers/specs/` (the brainstorming flow's natural location; plan correctly references it there).
4. **Resume in correct order**:
   1. `/grill-with-docs` (user invocation) — populate `CONTEXT.md` + `docs/adr/0001-domain.md`.
   2. (Optional, OSS-light) `/office-hours` — six forcing questions.
   3. **Plan cross-model review**: separate Opus session `/plan-eng-review` + `/codex:rescue`. Differences merged into plan or recorded in ADR-0002.
   4. Update `HANDOFF.md` quality gate.
   5. Codex picks up Tasks 2–23 from the (possibly-updated) plan.
   6. Cross-model code review: Opus `/review` + `/security-review` + `/codex:adversarial-review`. Findings recorded in ADR-{NNNN}.
   7. Merge `feat/v0.1-implementation` → `main`, tag `v0.1.0`, `npm publish`.

## Consequences

- **Plan integrity**: The 23-task plan survives. Cross-model review may surface gaps; those are merged in before Codex picks up.
- **Cost of correction**: One Sonnet-subagent-implemented scaffolding commit kept. Quality risk: low (config files only, independently spec-reviewed). One additional ADR to write (this one). No code rewrites required.
- **Process scar / preventive measure**: Future Tier 3 projects must read `01_Projects/CLAUDE.md` *before* invoking any superpowers skill. Hook idea: on `cd` into `01_Projects/{name}/`, surface zone tier and required workflow steps. Out of scope for this ADR; track separately.

## Follow-ups

- [ ] ADR-0001 — domain seed (from `/grill-with-docs`)
- [ ] ADR-0002 — plan cross-model review findings (if any)
- [ ] ADR-{NNNN} — code cross-model review findings (post-Codex)
