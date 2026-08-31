# Ethereum ecosystem historical backfill

## Purpose

The browser history endpoint can only display observations already present in the canonical append-only store. Forward collection is point-in-time clean, but it starts with an empty historical range. This backfill fills an initial chartable history for the Ethereum ecosystem metrics that GrowThePie publishes as daily exports.

It does **not** fabricate a historically versioned vendor dataset.

```text
GrowThePie current export at retrieval time
                ↓
reconstruct rolling 7D / 30D / 90D snapshots
                ↓
canonical MetricObservation rows
                ↓
actual backfill ingestion timestamp
                ↓
manifest with payload hashes, coverage, gaps, and license status
```

## First supported source family

```text
growthepie-ecosystem
```

Supported metrics:

- `eth.l2_user_fees_usd`
- `eth.l2_rent_paid_usd`
- `eth.l2_settlement_cost_share`
- `eth.l1_stablecoin_supply_usd`
- `eth.l2_stablecoin_supply_usd`
- `eth.ecosystem_stablecoin_supply_usd`

The backfill uses four public endpoints:

- chain and DA metadata;
- L2 user fees;
- rent paid to Ethereum;
- stablecoin market capitalization.

The payloads are fetched once per run and reused across all requested cutoff days. Each response body is capped at 32 MiB before replay; declared or streamed overflow fails closed. Raw payloads are not written to the repository or manifest. The manifest records only bounded endpoint identifiers, retrieval timestamps, response status, byte counts, and SHA-256 hashes.

## Command

```bash
npm run intelligence-backfill -- \
  --start 2025-01-01 \
  --end 2025-12-31 \
  --window 30d
```

Optional:

```text
--manifest-dir <path>
--run-id <stable run reference>
```

`--start` and `--end` are inclusive **cutoff days**. A cutoff day aggregates the completed interval ending immediately before that day. The first implementation allows at most 366 cutoff days in one run.

## Revision semantics

GrowThePie exports are retrieved as they exist at the time of the backfill. They do not provide an archived payload version for every historical date.

The manifest therefore states:

```text
revision_basis = latest_available_at_retrieval
historical_source_versions_available = false
ingestion_timestamp_basis = actual_backfill_run
eligible_before_backfill_run = false
```

Every reconstructed observation receives its actual backfill ingestion timestamp. Consequently:

```text
observed_at = historical metric date
ingested_at = actual backfill execution time
```

A point-in-time query before the backfill execution does not see the reconstructed row. This prevents a current revised export from leaking into an earlier historical cutoff.

The backfill is suitable for:

- present-day historical charts;
- exploratory long-window diagnostics;
- identifying source coverage and methodology gaps.

It is not sufficient by itself for:

- a historical walk-forward simulation pretending the current export was known at the time;
- audit evidence that a vendor published the exact same value on the historical date;
- commercial redistribution of the source data.

## Chain-universe limitation

The historical calculation uses the chain, production, rollup, metric-support, and DA metadata present in the current master payload. The master payload hash is frozen in the manifest, but the source does not prove that the same classification existed on every historical date.

This creates a known current-universe bias:

- a chain removed from the current master may be absent;
- a chain's current DA or production classification may differ from its historical status;
- current metric coverage metadata is applied to historical rows.

Future work may add an internally versioned chain registry. Until then, the manifest remains the source of truth for the universe used in each run.

## Observation identifiers and revisions

Metric observation ids use `metric-observation-id-v2`.

The id includes:

- metric, subject, and asset;
- value and unit;
- source and observation timestamps;
- confidence;
- sorted source references;
- methodology and semantic dimensions.

It excludes ingestion time and operational run metadata. Therefore:

- an identical retry remains idempotent;
- the same live and backfill observation does not duplicate;
- a corrected value at the same historical observation time creates a new append-only revision.

## Manifest

Each run writes a strict `eth-ecosystem-backfill-manifest-v1` file containing:

- requested and actual ranges;
- run and completion timestamps;
- status and cutoff coverage;
- observation, inserted, and duplicate counts;
- metric keys and methodology versions;
- source payload hashes;
- source-license assessment;
- bounded gap summaries;
- a deterministic manifest SHA-256 fingerprint.

`observation_set_sha256` hashes the sorted semantic observation IDs, so an
idempotent rerun with another run ID or ingestion timestamp retains the same
observation-set fingerprint. A corrected value or methodology creates a new
semantic ID and therefore a different set fingerprint. The full manifest
fingerprint still binds run-specific timestamps, counts, payload hashes, and
the requested run identity.

The manifest is written with exclusive-create semantics. A reused run id is rejected before source fetch or observation persistence and cannot silently overwrite an earlier run record.

## Missing data

The source adapter remains fail closed.

- A missing origin-day makes the affected window metric unavailable.
- Missing values are not changed to zero.
- Partial cutoffs may still emit independent metrics whose coverage is complete.
- An unavailable cutoff emits no observations and is counted in the manifest.

## Persistence

`JsonlMetricObservationStore.appendMany()` validates and appends a batch after one persisted-history duplicate check. This avoids reading the full JSONL file once per backfilled row.

The same storage migration triggers remain in force:

- excessive file size;
- unacceptable p95 history latency;
- multi-writer requirements;
- transaction requirements;
- institutional deployment.

## Licensing

The source-license registry currently marks GrowThePie as requiring commercial review and attribution. The backfill manifest evaluates every source reference and normally reports:

```text
commercial_redistribution_allowed = false
attribution_required = true
```

The backfill is part of the personal Research/Evidence Core. It does not create a right to resell raw or near-raw source data through an API, MCP, download, or paid dashboard.

## Deliberately deferred

- protocol fee, burn, and issuance backfill that depends on independently versioned Coin Metrics, Dune, RPC, or other sources;
- historical chain-universe snapshots;
- per-L2 browser series;
- historical categorical Demand Compass decisions;
- automatic scheduled execution;
- commercial API export.
