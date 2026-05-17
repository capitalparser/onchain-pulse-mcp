# ADR-0004: Plan Cross-Model Review Findings (Codex phase)

- **Status**: Accepted (Codex `/codex:rescue` complete; plan revisions applied this commit)
- **Date**: 2026-05-09
- **Decider**: Kim Kyung-jun
- **Reviewer**: Codex CLI (GPT-5.4) via `/codex:rescue`
- **Plan reviewed**: `plans/2026-05-08-onchain-pulse-mcp.md` (commit `5e93f39` baseline + ADR-0002 Opus-phase amendments)
- **Companion to**: ADR-0002 (Opus phase). Together these complete the two-stage cross-model plan review mandated by `01_Projects/CLAUDE.md` §"권장 호출 순서" step 5.

## Context

Per Tier 3 workflow, after the Opus `/plan-eng-review` phase recorded in ADR-0002, the plan goes to Codex (GPT-5.4) for a second cross-model pass to catch blind spots that share-family review (Opus reviewing Opus-authored plan) cannot surface. Codex returned 26 findings across 6 classifications (COVERAGE_GAP, MISSING_FAILURE_MODE, DOD_GAP, FEASIBILITY_FLAG, ORDER_RISK, SCOPE_CREEP) at HIGH/MEDIUM/LOW severity.

This ADR records the 5 HIGH-severity findings that were applied to the plan in this commit, the rationale for each fix, and the deferred items.

## Findings applied (HIGH severity, this commit)

| ID  | Task    | Classification        | Resolution location                     |
|-----|---------|-----------------------|------------------------------------------|
| F7  | 9       | DOD_GAP               | Task 9 Step 5 (golden value lock policy) |
| F8  | 8.5     | FEASIBILITY_FLAG      | Task 8.5 header (spec §2 N5 reconciliation pointer to ADR-0003) |
| F6  | 8.5     | MISSING_FAILURE_MODE  | Task 8.5 Step 3 (corrupt/partial/permission tests) + Step 5 quarantine logic |
| F23 | 6, 22   | ORDER_RISK            | Task 6 (`cacheFor` API) + Task 22 (cache isolation invariant + server test) |
| F2  | 6       | ORDER_RISK            | Task 6 (per-adapter `ttlMs` honoured, no shared default) |
| F25 | 22.5    | DOD_GAP               | Task 22.5 Step 2 (per-key fetcher contract table; "left to Codex" removed) |
| F24 | 3, 22.5 | FEASIBILITY_FLAG      | Task 3 (`OPM_HISTORY_PATH` + `~` expansion in `loadEnv`) + Task 22.5 (single source of truth note) |

## Decisions

### Accepted (applied to plan in this commit)

- **F7 (Task 9 golden value)**: Step 5's "adjust the golden number if needed" wording is replaced with a **lock-once-then-immutable** policy. First-pass calibration is permitted in a single commit if the plan-author's estimate of `63` proved off; from that commit forward, golden value changes require an ADR (`docs/adr/{NNNN}-pulse-weight-retune.md`) and a same-commit bump. The previous wording allowed silent retunes that would defeat the regression-detection contract of the fixture.

- **F8 / F6 (Task 8.5 persistence vs spec §2 N5)**: The plan now points readers explicitly at ADR-0003's reconciliation (per-installation local-only ring buffer is offline materialisation, not state) before they read the implementation. Three failure-mode tests (`corrupt JSON`, `partial write`, `permission error on save`) are added to Step 3, raising the expected pass count from 8 to 11. `readEnvelope` in Step 5 now **quarantines** corrupt files to `${path}.corrupt-${Date.now()}` instead of silently overwriting them — preserves evidence for postmortem and prevents silent data loss.

- **F23 / F2 (Task 6 + Task 22 cache isolation)**: `AdapterContext.cache: TTLCache<AdapterResult>` is replaced with `AdapterContext.cacheFor(spec): TTLCache<T>` — a per-adapter cache factory that respects each adapter's declared `ttlMs` and `max`. The previous shared cache silently flattened spec §4's adapter-specific TTLs (derivatives 90s, macro_rwa 10min) to a single 60s default and let one adapter's evictions thrash another's hot keys. Task 22's `tests/server.test.ts` gains an isolation regression guard.

- **F25 (Task 22.5 per-key fetcher contract)**: The "left to Codex" deferral is replaced with a binding 7-row table specifying source endpoint, auth, parse-to-datapoint logic, and failure mode for each of the 7 composite-score keys. Per-key fetcher tests are required additions to existing adapter test files (Tasks 10–14), not deferred to follow-up.

- **F24 (`OPM_HISTORY_PATH` not in `EnvConfig`)**: Task 3 (`loadEnv`) gains a `historyPath: string` field and three new tests covering the default, `~` expansion, and absolute-path passthrough. Task 22.5 dispatcher reads `env.historyPath` directly — no duplicate `resolveHistoryPath` helper.

### Deferred (Codex phase, lower severity — applied in next commit or v0.1 follow-up)

The following 21 findings are not addressed in this commit. They will be batched into a follow-up commit before Codex begins implementation, OR — for items judged informational — left for code-review phase.

- **MEDIUM coverage gaps**: F1 (TTLCache in-flight coalescing), F3 (config bucket continuity), F9–F14 (per-adapter symbol-level + auth failure tests), F15 (Bithumb scope decision), F19 (ETF window key semantics), F20 (stablecoin window key semantics).
- **MEDIUM/LOW DOD gaps**: F4 (summary formatter contract tightening), F12 (per-source stale annotation), F26 (Task 23 acceptance count off-by-one).
- **MEDIUM scope creep**: F18 (Task 16 split into adapter-aggregation / score-mapping / response-format).
- **HIGH coverage gap requiring design**: F16 (Nansen path in `wallet_id`), F17 (`get_market_pulse` adapter fan-out test), F22 (`zod-to-json-schema` dependency vs manual schema unification).
- **HIGH feasibility flag requiring design**: F11 (Farside HTML regex robustness + parser fallback contract).

These will be triaged in a subsequent ADR-0005 once the user has reviewed Codex's MEDIUM-severity findings; the goal of this ADR is to land the structural fixes that block Codex implementation start.

## Why a separate ADR rather than an ADR-0002 amendment

ADR-0002 records the Opus phase (`/plan-eng-review`) findings as a single point-in-time review. Layering Codex findings on top would conflate two reviewer perspectives in one document and obscure which model caught what. Cross-model review value comes precisely from the *difference* between the two passes; preserving that separation in the ADR record makes the project's blind-spot map legible to future contributors.

## Consequences

- Plan revisions are **structural** (interface change in Task 6, new tests + quarantine logic in Task 8.5, new env field in Task 3, new fetcher contract in Task 22.5). Codex will see a stricter contract on day 1.
- Test pass counts increase: Task 3 (4 → 7), Task 6 (5 → 8), Task 8.5 (8 → 11). Task 23 acceptance criterion "0 failures" remains valid.
- ADR-0003 is now load-bearing: it is the formal record of the spec §2 N5 amendment. Future contributors who change the persistence design must amend ADR-0003 and re-run `/codex:rescue` on Task 8.5.
- The `cacheFor` API is the single mechanism for adapter-cache acquisition; introducing a parallel cache pathway (e.g. a module-level Map) would silently re-introduce F23's cross-adapter eviction risk.

## Follow-up

- [ ] ADR-0005: triage of remaining 21 Codex findings (MEDIUM/LOW + HIGH non-structural).
- [ ] HANDOFF.md gate update: add "☑ Plan cross-model review (b) Codex" once this commit lands.
- [ ] Run `npm run typecheck` against the plan's TypeScript snippets after Codex begins implementation; the per-adapter `cacheFor({ name, ttlMs, max })` signature must be exercised by every adapter test.
