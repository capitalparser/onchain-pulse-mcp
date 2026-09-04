# History Collection Operationalization

## Why this plan exists

Cross-repo verification already happened in `upbit-autotrader-research`
(`docs/validation/CROSS_REPO_INTEGRATION_DECISION.md`,
`docs/validation/H_ETH_READINESS_V1.md`). The full pipeline was exercised
end-to-end with real checksums: this repo's `intelligence-export` at commit
`ee7698c` (merged via PR #56, `0f33b91`) fed the research bundle builder
directly. The pipeline code on both sides is correct and fail-closed.

The verdict came back `DATA_NOT_READY` for exactly one reason: the
`OPM_INTELLIGENCE_HISTORY_PATH` JSONL store the exporter read from does not
exist. Nothing has ever run the forward collector (`npm run
intelligence-collect`) on a schedule, and no backfill exists. This is not a
code defect — it is unfinished operational work. This plan closes it.

**Do not modify `upbit-autotrader-research`.** Its bundle builder and
validator (`src/master_score/research/intelligence_bundle_builder.py`,
`tests/test_intelligence_bundle_builder.py`) are already correct and tested.
The only touch to that repo is Task 4 below, which re-runs its existing
script unmodified.

## Roadmap linkage

This closes items 5 and 6 of
`docs/architecture/crypto-intelligence-roadmap.md` §9 ("Add scheduled
collector and forward observation manifest", "Backfill public historical
features") — the remaining unfinished P1 deliverables blocking P2.

## Task 1 — Scheduled forward collection

- Add a GitHub Actions cron workflow that runs `npm run intelligence-collect`
  on a daily cadence for at minimum the three H-ETH-01 candidate metrics named
  in `H_ETH_READINESS_V1.md`: `eth.net_issuance_eth`, `eth.total_burn_eth`,
  `eth.l2_rent_paid_eth`.
- Persistence target is an open decision — **write an ADR before the
  workflow**, per the existing "deviations require an ADR" convention. Two
  candidates: (a) commit the append-only JSONL to a dedicated data path/branch
  in this repo, (b) push to whatever durable store
  `OPM_INTELLIGENCE_HISTORY_PATH` is configured to point at outside the repo.
  Either way: append-only, tamper-evident, no BYOK secret ever enters a log or
  a diff.
- Reuse `FileHistoryStore` as tested in `tests/pulse/history.test.ts` — do not
  fork it.
- A run that cannot reach a source must record the gap explicitly (roadmap
  principle 3, "fail closed") and must never synthesize a value to fill it.

## Task 2 — Historical backfill (at least one family)

- Backfill `eth.net_issuance_eth` first — it is H-ETH-01's highest-priority
  candidate. Use a public source and record a source-boundary manifest stating
  exactly which historical window the vendor can actually support and where
  its methodology changed.
- An absent window stays an explicit gap. Never interpolate or claim coverage
  before the vendor's own reconstructable history begins.

## Task 3 — Data-quality report

- Per roadmap P1: coverage / freshness / duplicates / revisions / source-gap
  report, so `upbit-autotrader-research` can check readiness without
  re-deriving it from raw JSONL.

## Task 4 — Re-run the existing readiness check (no new code in this repo or research)

- Once Tasks 1–2 produce at least one real, non-empty export window, re-run
  the **unmodified** `upbit-autotrader-research` bundle builder end-to-end
  (same command shape already recorded in `H_ETH_READINESS_V1.md`) and update
  that document's verdict there. Do not edit the validator to force a pass.

## Explicitly out of scope

- The separate "on-chain DeFi protocol universe" idea (TVL/LP-based token
  selection, not tied to Upbit-listed symbols) is **not** part of this plan.
  No execution venue exists for it (`upbit-autotrader-execution` only places
  Upbit orders), and the roadmap's protocol-intelligence phase (P4) is scoped
  for due-diligence scorecards, not a trading signal. It needs its own scoping
  ADR before any code — escalate it rather than building it opportunistically
  here.

## Constraints carried over

- BYOK keys via env vars only — never read from disk, never log.
- No new runtime dependency without an ADR.
- TDD discipline: failing test first for every new code path.
- Node engine mismatch: `package.json` requires `>=24`. Pin an explicit
  compatible version in the new workflow rather than inheriting whatever
  `actions/setup-node` defaults to.
