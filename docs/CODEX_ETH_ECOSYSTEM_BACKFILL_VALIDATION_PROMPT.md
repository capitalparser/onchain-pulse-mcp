# Codex execution prompt — Ethereum ecosystem backfill

Work directly from GitHub. Do not use GitHub Actions and do not create another repository.

## Primary repository

```text
https://github.com/capitalparser/onchain-pulse-mcp
branch: feat/eth-ecosystem-backfill
```

This is a stacked branch based on:

```text
feat/eth-history-gateway
PR #50
```

Validate PR #50 first if its branch has changed. Rebase or merge the latest parent branch only when necessary, preserve the stacked diff, and do not merge either PR.

## Product boundary

This task backfills browser-chart history for Ethereum ecosystem activity and ETH settlement capture. It is not a price forecast, trade signal, or source-data resale feature.

The first source family is GrowThePie only:

- L2 user fees;
- rent paid to Ethereum;
- settlement-cost share;
- Ethereum L1 and Ethereum-DA L2 stablecoin supply.

Do not add protocol burn, issuance, Dune, Coin Metrics, wallet, entity, RWA, or order-execution backfills in this task.

## Critical provenance rule

The current GrowThePie export is the latest payload available at retrieval time, not an archived payload version for each historical date.

The implementation must preserve:

```text
revision_basis = latest_available_at_retrieval
ingested_at = actual backfill execution time
eligible_before_backfill_run = false
historical_source_versions_available = false
```

Do not backdate `ingested_at` to make the rows appear available in a historical walk-forward test. Do not describe the resulting dataset as historically versioned or hindsight-free.

## Required commands

Use Node.js 24 and run:

```bash
node --version
npm --version
npm ci
npm run typecheck
npm test
npm run build
```

Fix all failures on the same branch and rerun the complete sequence.

## Focused review

Validate the following:

1. `npm run intelligence-backfill -- --start <day> --end <day> --window 30d` is wired correctly.
2. Start and end are inclusive cutoff days and cannot be reversed or future-dated.
3. More than 366 cutoff days is rejected.
4. Unknown or duplicate CLI flags fail closed.
5. The four GrowThePie payloads are fetched once per run, not once per cutoff.
6. The manifest stores hashes and metadata, never raw payloads.
7. Missing origin-day data remains missing and is not replaced with zero.
8. Partial cutoffs may emit only independently complete metrics.
9. All reconstructed observations use the actual backfill ingestion time.
10. A point-in-time query before that ingestion time excludes the rows.
11. An identical rerun with a different run id is idempotent.
12. A revised derived value at the same observed date receives a different observation id.
13. Live and backfill observations with identical semantic content do not duplicate solely because of operational run metadata.
14. `JsonlMetricObservationStore.appendMany()` does not read and append once per row.
15. Manifest coverage counts equal the requested cutoff count.
16. Manifest and payload fingerprints are deterministic for their captured inputs.
17. Manifest files use exclusive creation and cannot silently overwrite a previous run.
18. GrowThePie license policy remains non-commercial/review-gated and attribution-required.
19. Existing forward collection and history gateway behavior are not regressed.
20. No credentials, raw payloads, provider exception text, or entitlement state enter the manifest or console API.

## Runtime smoke test

Use temporary paths:

```bash
export OPM_INTELLIGENCE_HISTORY_PATH="$(mktemp -d)/intelligence-history.jsonl"
MANIFEST_DIR="$(mktemp -d)"

npm run intelligence-backfill -- \
  --start 2026-05-01 \
  --end 2026-05-07 \
  --window 30d \
  --manifest-dir "$MANIFEST_DIR" \
  --run-id codex-smoke-001
```

Then inspect:

```bash
wc -l "$OPM_INTELLIGENCE_HISTORY_PATH"
find "$MANIFEST_DIR" -maxdepth 1 -type f -print
cat "$MANIFEST_DIR/codex-smoke-001.json"
```

Run the exact command again with `--run-id codex-smoke-002` and confirm that unchanged semantic observations are skipped rather than duplicated.

Start the stacked history gateway and query a current cutoff. Confirm that backfilled points are visible at a cutoff after ingestion but excluded by a cutoff before ingestion.

If external source access is blocked, distinguish the environment limitation from application behavior and validate the same path with controlled fixtures.

## Code-review emphasis

Check for:

- operational run id accidentally entering semantic observation ids;
- current chain-universe metadata being misrepresented as historical metadata;
- unbounded memory, cutoff range, response, or manifest growth;
- source payload or URL credential leakage;
- partial metric values accidentally interpreted as zero;
- local timezone use instead of UTC days;
- source response memoization returning a consumed body;
- duplicate JSONL ids under concurrent or repeated execution;
- schema drift between manifest TypeScript types and serialized JSON;
- accidental changes to existing npm scripts or live-test environment variable names.

## Required output

Commit to the same branch:

```text
docs/CODEX_ETH_ECOSYSTEM_BACKFILL_VALIDATION_REPORT.md
```

Include:

- Node/npm versions;
- exact commands;
- typecheck/test/build results;
- focused test and smoke-test results;
- source-access result;
- sample manifest summary without raw source data;
- idempotency and revision result;
- unresolved risks;
- final status: `ready_for_owner_review` or `not_ready`.

Push fixes and the report to `feat/eth-ecosystem-backfill`. Leave the stacked PR unmerged for owner review.
