# Codex Ethereum ecosystem backfill validation report

Date: 2026-08-31 (Asia/Seoul)

## Decision

`ready_for_owner_review`

PR #51 was restacked onto the current main that contains the merged work from
PRs #50, #53, #54, and #56. The implementation was validated with Node.js 24
and remains unmerged. GitHub Actions were not used.

## Repository and revision identity

| Item | Value |
|---|---|
| Repository | `capitalparser/onchain-pulse-mcp` |
| Pull request | `#51` |
| Target branch | `feat/eth-ecosystem-backfill` |
| Original stacked head | `8db078b7537da726579026e7fd20168052201276` |
| Original history parent | `145a294eeea71d50f88ceffb3f5950b4909bfa24` |
| Current `origin/main` | `0f33b91884297a852abe031f3e03e1c644ac7a59` |
| Initial restacked commit | `4aa6c6fbf3358c77be0ab791caaf7ba345a0d0a2` |
| Validated final implementation head | `2fca0b26580224579d35e2e4da71438c56c3c5f6` |
| Node.js | `v24.15.0` |
| npm | `11.12.1` |

PR #50 was verified merged before work began. Its merge commit is
`90e294a991c61daf1e63371b58db78f1fb58e4f3`, and its committed validation
report says `ready_for_owner_review`. Before publication, `origin/main`
advanced to `0f33b91884297a852abe031f3e03e1c644ac7a59` with merged PR #56, so the
branch was restacked and fully revalidated again on that base.

## Restack and conflict resolution

Only PR #51's unique backfill commit was replayed onto current main. The first
rebase onto merged PR #50 produced two conflicts:

- `package.json`: retained the current `robinhood-chain-pulse` script and added
  `intelligence-backfill` without changing dependency versions;
- `src/index.ts`: retained the Robinhood CLI mode and added the backfill CLI
  mode as an independent branch.

No blanket `ours` or `theirs` resolution was used. `package-lock.json`, the
current MCP server, bounded MCP error contract, Robinhood Chain source and
tests, and the PR #50 history gateway were not reverted.

When main advanced again, the second rebase produced one `src/index.ts`
import conflict. The merged result preserves the PR #56
`intelligence-export` CLI and research-export modules alongside the PR #51
`intelligence-backfill` CLI. The PR #56 package script, core exports, tests,
and dependency state remain intact.

## Validation commands and results

```text
node --version                                      PASS  v24.15.0
npm --version                                       PASS  11.12.1
npm ci                                              PASS
npm run typecheck                                   PASS
npm test                                            PASS  1087 passed / 11 skipped
npm run build                                       PASS
npm audit --omit=dev                                PASS  0 vulnerabilities
```

`npm ci` reported one low-severity development-only advisory. No force install,
legacy peer override, test relaxation, or audit fix was used.

Focused command:

```text
npx vitest run \
  tests/intelligence_core/backfill_cli.test.ts \
  tests/intelligence_core/eth_ecosystem_backfill.test.ts \
  tests/intelligence_core/observation_id.test.ts \
  tests/intelligence_core/store_append_many.test.ts \
  tests/intelligence_core/research_export.test.ts \
  tests/intelligence_core/research_export_cli.test.ts \
  tests/intelligence_core/eth_ecosystem_capture_adapter.test.ts \
  tests/intelligence_core/eth_value_capture_adapter.test.ts \
  tests/intelligence_core/collection_run.test.ts \
  tests/intelligence_core/history.test.ts \
  tests/dashboard/console_history_provider.test.ts \
  tests/frontend_contract/eth_history.test.ts \
  tests/robinhood_chain_pulse \
  tests/server.test.ts
```

Result: `19` test files passed, `165 / 165` tests passed.

## Provenance and semantic observation IDs

The backfill preserves the required boundary:

```text
revision_basis = latest_available_at_retrieval
historical_source_versions_available = false
eligible_before_backfill_run = false
observed_at = economic history date
ingested_at = actual backfill execution time
```

It does not claim that the current GrowThePie export was historically
available on each observation date. The current master payload also defines
the reconstructed chain universe, so the result is not hindsight-free vendor
history.

`metric-observation-id-v2` includes value, unit, source and observation time,
confidence, sorted source references, methodology, entity/asset/subject, and
semantic dimensions. It excludes ingestion time, run ID, collection mode,
revision basis, and source-versioning metadata.

Regression results:

- identical semantic rerun under another run ID: same IDs;
- live and backfill operational metadata around identical content: same IDs;
- changed value: new revision IDs;
- changed methodology: new revision IDs;
- missing metric value: no observation emitted;
- actual zero: preserved by the existing observation/history contract.

The original implementation hashed full observation rows for
`observation_set_sha256`, causing identical semantic sets to change with run ID
or ingestion time. The repaired implementation hashes sorted semantic
observation IDs. A controlled and live rerun now produces the same
observation-set hash while the run-specific full manifest fingerprint remains
distinct.

## Operational and manifest bounds

Automated checks verify:

- inclusive canonical UTC cutoff days;
- reversed range rejection;
- future end-day rejection;
- rejection above 366 cutoff days before any source request;
- unknown and duplicate CLI flag rejection;
- all four source payloads fetched once per run;
- 32 MiB maximum per source response; the regression covers oversized declared
  length and the reader also stops when streamed bytes cross the same bound;
- maximum manifest arrays enforced by strict schemas;
- `appendMany()` validates a batch and performs one persisted-history
  duplicate check rather than one read per row;
- reused run ID rejected before source fetch or observation persistence;
- final manifest write retains exclusive-create mode;
- manifest coverage counts reconcile to the requested cutoff count.

Raw source payloads are not persisted. Manifest source entries contain only a
fixed sanitized public URL, bounded status, actual retrieval time, HTTP status,
byte count, and SHA-256 body hash. Fixture payload keys such as `chains` and
`origin_key` are absent from the serialized manifest.

## Live 3-day smoke

Temporary history and manifest paths outside the repository were used:

```text
npm run intelligence-backfill -- \
  --start 2026-07-01 \
  --end 2026-07-03 \
  --window 30d \
  --manifest-dir <temporary-directory>/manifests \
  --run-id codex-backfill-smoke-3d
```

Result:

- status: `partial`;
- cutoff coverage: `3 partial / 0 complete / 0 unavailable`;
- observations: `12 inserted`;
- emitted daily metric families: L2 user fees and Ethereum L1/L2/ecosystem
  stablecoin supply;
- L2 rent and settlement-cost share remained missing because the current
  export did not provide complete rent coverage for those windows;
- no missing metric was replaced with zero.

## Live 7-day and idempotency smoke

After the three-day run, the final implementation was run for `2026-07-01`
through `2026-07-07` twice with different run IDs against the same temporary
JSONL store.

```text
first 7-day run   partial  16 inserted 12 skipped  28 semantic observations
second 7-day run  partial   0 inserted 28 skipped  28 semantic observations
JSONL rows after all three runs                28
observation_set_sha256                         identical across 7-day runs
observation_set_sha256  07f16017fd6f068a80df8f6df97b1af615df95dfd9e688c45913e6c57ffd05a3
```

Each run captured the same four payload hashes. Live body sizes were bounded:

```text
master.json          164,562 bytes
fees.json          6,823,508 bytes
rent_paid.json     5,714,594 bytes
stables_mcap.json  7,873,541 bytes
```

The manifest reported
`commercial_redistribution_allowed = false` and
`attribution_required = true` for all GrowThePie source references.

## Point-in-time history gateway smoke

The three-day run and the first seven-day run used their actual ingestion
timestamps. The minimum and maximum persisted timestamps were:

```text
2026-08-31T06:47:44.553Z
2026-08-31T06:47:45.898Z
```

The current history gateway returned:

```text
cutoff 2026-08-31T06:47:44.552Z  unavailable   0 selected points
cutoff 2026-08-31T06:47:45.898Z  partial      28 selected points
```

The post-ingestion response contained seven points each for L2 user fees,
Ethereum L1 stablecoin supply, Ethereum-DA L2 stablecoin supply, and their
ecosystem total. It retained `no-store` and `nosniff` headers and did not expose
observation IDs, raw payloads, credentials, RPC URLs, BYOK/paid-source state,
entitlement state, or provider exception text.

## Current-main regressions

The complete and focused suites retain:

- the PR #50 full point-in-time history eligibility and revision accounting;
- composite forward collection and bounded history gateway behavior;
- the current Node 24 and Vitest 4 dependency state;
- all Robinhood Chain CLI, adapter, MCP, license, and server behavior;
- the PR #56 immutable research-export CLI and contract tests;
- bounded shared MCP error payloads;
- production dependency audit at zero reported vulnerabilities.

## Remaining risks

- GrowThePie history is `latest_available_at_retrieval`, not archived
  point-in-time vendor history. It must not be used as hindsight-free
  walk-forward evidence.
- Historical chain membership and DA classification use the current master
  payload and may differ from the universe known on the historical date.
- Live rent coverage was incomplete for the tested July windows, so rent and
  settlement-cost-share history remained absent rather than zero.
- JSONL reads the full file and is suitable only for bounded single-writer
  internal research. Large history, multi-writer operation, or transactional
  requirements need indexed storage.
- A process or filesystem failure between JSONL append and final manifest write
  cannot be made transactional across the two files. The run ID preflight and
  exclusive manifest create prevent normal rerun overwrite, but durable
  cross-file transactions require a database-backed implementation.
- The full dependency graph retains one development-only low advisory;
  production dependencies have zero reported advisories.

## Final decision

`ready_for_owner_review`

Validated final implementation head:
`2fca0b26580224579d35e2e4da71438c56c3c5f6`.

PR #51 must remain open and unmerged until owner review.
