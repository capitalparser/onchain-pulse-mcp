# UTC history and collection completion time

## Scope and baseline

Repository: `capitalparser/onchain-pulse-mcp`  
Reviewed base: `dc62eeb8b18e2b67820e09ee5ac6135e2d156434`  
Branch: `fix/history-utc-completion`

This change implements the time-contract portion of the September 5 review.
It does not merge or depend on open PR #58. That PR owns canonical JSONL
write locking, newline safety, and generic forward-collection preflight.
At review time, none of this change's paths overlap PR #58, #44, or #46.

## Evidence and correction

### ETH browser history

`src/frontend_contract/eth_history.ts` accepted ISO timestamps with offsets,
but used their first ten characters as UTC day keys and lexicographical ordering
for latest observation/ingestion selection. For example,
`2026-09-01T00:30:00+09:00` belongs to August 31 UTC, not September 1.

The builder now:

- groups observations and computes expected/missing days in UTC;
- orders observations and ingestion revisions by epoch milliseconds;
- treats equivalent observed/ingested instants as ties even when their text differs;
- compares source timestamps by instant in the ambiguity signature;
- still rejects genuinely conflicting value, unit, entity, asset, source,
  confidence, methodology, or dimensions;
- finds `latest_ingested_at` by epoch, with a deterministic textual tie-breaker.

The selected row's original timestamp strings remain in public points,
coverage endpoints, and methodology segments. Direct typed-query boundaries
also retain their original representation. No canonical observation, ID,
immutable manifest, or persisted history is rewritten. Wire fields and
`eth-frontend-history-v1` remain unchanged: this repairs the existing UTC
contract rather than adding an analytical methodology.

### Robinhood collector lifecycle

`runRobinhoodChainCollectionOnce()` previously used the pre-write clock sample
as both observation ingestion time and run completion time.

The corrected lifecycle is:

```text
started_at -> fetch/domain -> ingested_at -> await persistence -> completed_at
```

`ingested_at` retains the existing data-acceptance meaning. It is not changed to
storage-commit time or backdated. `completed_at` is sampled only after the whole
`appendUnique()` operation succeeds, including the append-only fallback.
Read/write errors propagate and do not return a successful completion receipt.
Identical-snapshot retries keep existing observations and ingestion times.

Clock samples are copied to prevent an injected mutable `Date` from changing an
earlier sample. Invalid/nonfinite or backwards samples fail with bounded
`robinhood_collection_clock_invalid`. Injected clocks now receive three calls
on success (start, ingestion, completion), rather than two. A stable clock or a
sequence repeating its final value is compatible; equal times are allowed.

If the completion clock is invalid AFTER persistence, the operation rejects,
but already-written rows remain. Likewise, an append-only custom store may
retain a prefix after a later append fails. This change does not promise
rollback, fsync, power-loss durability, writer locking, or atomic reader
visibility. Ingestion time is still not proof of durable storage availability.

## Regression coverage

Two new offline Vitest files contain 24 cases (including parameterized cases):

- `tests/frontend_contract/eth_history_time.test.ts`: 11 cases covering positive
  and negative offsets, UTC midnight, leap day, chronological revision order,
  equal-instant equivalence/conflict, source-time provenance, latest ingestion,
  typed query boundaries, cutoff exclusion, zero, units, and methodology segments.
- `tests/robinhood_chain_pulse/collection_time.test.ts`: 13 cases covering delayed
  batch/append-only writes, read and first/later-write failure, duplicate retries,
  invalid/backwards clocks, and a reused mutable Date. The repository tests use
  the real domain, mapper, and observation schema with injected source fixtures.

## Verification actually performed here

- Both reconstructed source baselines match their exact Git blob hashes:
  - ETH history: `a491cbe1a72a7324eccaa648c1956eaf4df1a6e9`.
  - Robinhood history: `c7de2db5309ec5cd5a5472fb1bfcdcce8f8a27b5`.
- TypeScript syntax/transpilation checks passed for the two changed source files
  and the two new test files.
- An isolated Node `v22.16.0` logic harness executed the added cases against
  extracted/transpiled production logic: baseline 5 pass / 19 fail; corrected
  logic 24 pass / 0 fail. That harness used test-only schema, registry, adapter,
  domain, and ID-builder doubles. It is NOT a Vitest run, repository typecheck,
  full-schema integration test, provider smoke test, or Node 24 validation.

This environment has Node 22, not Node 24, and direct GitHub/npm DNS access
failed. Dependencies were not installed. No repository-wide `npm ci`,
`npm run typecheck`, `npm test`, build, or dependency audit pass is claimed.
GitHub Actions were not dispatched and workflows were not changed. Publication
uses `[skip ci]`; the PR stays Draft pending the Node 24 gate below.

## Remaining gate

Follow `docs/CODEX_TIME_CONTRACT_VALIDATION_PROMPT.md` on this same branch.
Record the exact code/test SHA, Node/npm versions, focused and full-suite
results, build, and audit outcome. Keep failures and environment limitations
explicit; do not infer current audit status from older reports.

Status: `implementation_complete / node24_validation_pending`.
This is not an automated-trading, commercial-release, or deployment approval.
