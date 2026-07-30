# ADR-0002: Plan Cross-Model Review Findings (Opus phase)

- **Status**: Accepted (Opus `/plan-eng-review` complete; Codex `/codex:rescue` phase pending)
- **Date**: 2026-05-09
- **Decider**: Kim Kyung-jun
- **Reviewer**: Claude Opus 4.7 (`/plan-eng-review`)
- **Plan reviewed**: `plans/2026-05-08-onchain-pulse-mcp.md` (commit `5e93f39` baseline)

## Context

Per `01_Projects/CLAUDE.md` §"권장 호출 순서" step 5, the Tier 3 workflow mandates a two-stage cross-model plan review before Codex picks up Tasks 2–23: (a) Opus `/plan-eng-review` and (b) Codex `/codex:rescue`. This ADR records the Opus phase findings and the user-accepted decisions. Codex phase findings will follow in a subsequent commit (or appended to this ADR if changes are mechanical).

## Findings (Opus phase)

| ID | Severity | Confidence | Area | Summary |
|----|----------|------------|------|---------|
| **A1** | **P0** | 9/10 | Architecture | v0.1 composite pulse score degenerates to 50/neutral on every call: `handleMarketPulse` injects `history = {}` (Task 22 line ~3299), so `computePulseScore` returns `sigmoid(0)*100 = 50`. Acceptance criteria pass; user value zero. |
| A2 | P1 | 10/10 | Architecture | Variable-name mismatch in Task 16: interface field `byok_active: string[]` vs. usage `args.byokActive` — TypeScript strict-mode compile error. |
| A3 | P2 | 8/10 | Architecture | `confidence` semantic misleading: weight ratio only, history sufficiency not reflected. |
| A4 | P3 | 6/10 | Architecture | Adapter retry/backoff policy unspecified in Task 6 (not deeply read). |
| A5 | P3 | 7/10 | Architecture | Domain-language residue: `examples/rules/kimchi-spread-spike.yaml` violates ADR-0001 (`kimchi` is prose-only; code keys are `kr_premium`). |
| Q1 | P1 | 10/10 | Code Quality | Task 23 Step 5 commands `git push origin main`; conflicts with HANDOFF.md gate "do not merge to main until cross-model code review complete". |
| Q2 | P2 | 10/10 | Code Quality | HANDOFF.md gate has stale unchecked boxes (CONTEXT.md, ADR-0001 already exist; filename is `0001-domain-frame-and-language.md`). |
| T1 | P0 | 9/10 | Tests | History-empty production path untested; golden test injects history fixture, production path is never exercised. Test/production divergence. |
| T2 | P2 | 7/10 | Tests | Spec §8 leaves "nock or msw" undecided; plan should fix one for adapter Tasks 10–15. |
| P2 | P2 | 6/10 | Performance | LRU cache size cap unverified in Task 5 (not deeply read). |

Sections fully read for this review: Tasks 1, 7, 8, 9, 16, 22, 23, plus full design spec, ADR-0001, ADR-0000, HANDOFF.md, README.md. Tasks 2–6, 10–15, 17–21 not read line-by-line; A4 / P2 / T2 carry medium-confidence flags pending the Codex phase.

## Decisions

### Accepted (apply to plan + scaffold this commit)

- **A1 → option (a)**: include history persistence in v0.1. New `Task 8.5: History persistence` inserted between Tasks 8 and 9. Filesystem ring buffer at `~/.cache/onchain-pulse-mcp/history.json`. Architectural rationale and N5-conflict reconciliation captured separately in **ADR-0003**.
- **A2**: rename Task 16 interface field `byok_active` → `byokActive` (camelCase, matches usage and project convention).
- **A5**: rename `examples/rules/kimchi-spread-spike.yaml` → `examples/rules/kr-premium-spike.yaml`. Internal `name:` field updated to `kr-premium-spike` for parser consistency. Human-facing description retains "(commonly known as kimchi premium)" allowance per ADR-0001.
- **Q1**: Task 23 Step 5 corrected to `git push origin feat/v0.1-implementation`. Main-branch merge belongs to the post-handoff gate, not the implementation push.
- **Q2**: HANDOFF.md gate boxes updated — `☑ CONTEXT.md populated`, `☑ docs/adr/0001-domain-frame-and-language.md`, `☑ Plan cross-model review (a) Opus`. Filename corrected.

### Deferred (carry to Codex phase or v0.2)

- **A3 (confidence semantic)**: superseded by A1-(a) — once history is populated in production, `confidence = activeWeightSum` stops being misleading because z-scores carry real signal. Re-evaluate if Codex review surfaces residual concern.
- **A4 (adapter retry/backoff)**: flag for `/codex:rescue` to verify against Tasks 6, 10–15.
- **T2 (HTTP fixture lib)**: flag for `/codex:rescue` (Codex will implement Tasks 10–15 and is closer to the choice).
- **P2 (LRU cache size)**: flag for `/codex:rescue` to verify against Task 5.

## Consequences

- Plan grows from 23 to 24 tasks (Task 8.5 inserted; Tasks 9–23 retain their numbers — Task 8.5 is non-renumbered to keep diff minimal and preserve commit-message references like `feat(pulse): composite ...`).
- Task 22 `handleMarketPulse` is rewritten to load history via the new module instead of synthesising `[]`. Placeholder zeros for `btc_dominance_7d_delta` and `rwa_tvl_7d_delta` are removed — Task 8.5 / 22 wiring now provides them from history.
- Acceptance criterion added: `npx onchain-pulse-mcp warmup` seeds ≥5 historical points per key, after which `get_market_pulse` returns non-trivial scores.
- Plan's "Out of scope" section loses its first bullet ("Real history series … z-scores degenerate to 0") — now in scope.
- Branch `feat/v0.1-implementation` integrity preserved; Task 1 commit `85aba76` unchanged.

## Follow-ups

- [ ] **ADR-0003** — v0.1 history persistence design (companion to A1-(a)).
- [ ] `/codex:rescue` (Codex phase) — append findings to this ADR, or open ADR-0004 if material disagreements surface.
- [ ] Post-Codex code review — ADR-{NNNN}-review-findings.md (per ADR-0000 §"Resume in correct order" item 6).
