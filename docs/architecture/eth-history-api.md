# ETH browser history gateway

## Purpose

The Digital Asset Intelligence Console needs time-series evidence without exposing the append-only research store, raw vendor payloads, credentials, or unrestricted query access.

The browser contract therefore sits above canonical `MetricObservation` history:

```text
GrowThePie / Coin Metrics / other approved adapters
                        ↓
validated ETH snapshots
                        ↓
MetricObservation append-only JSONL
                        ↓
point-in-time daily selection
                        ↓
GET /api/v1/eth/history
                        ↓
Digital Asset Intelligence Console
```

This API supports analysis of the distinction between Ethereum ecosystem activity and ETH value accrual. It does not produce a price forecast or trade instruction.

## Collection change

`npm run intelligence-collect` now collects both:

- ETH protocol value-capture metrics; and
- Ethereum ecosystem-capture metrics, including L2 user fees, rent paid to Ethereum, settlement-cost share, and stablecoin supply.

The two source families are collected independently. If one fails, the other may still be persisted and the run is reported as `partial`. Provider exception text is not copied into the run result.

## Endpoint

```text
GET /api/v1/eth/history
```

Query parameters:

| Parameter | Default | Allowed |
|---|---|---|
| `metrics` | six Overview metrics | comma-separated allowlisted metric keys, max 8 |
| `range` | `90d` | `30d`, `90d`, `180d`, `365d` |
| `window` | `30d` | `7d`, `30d`, `90d` |
| `cutoff` | request time | ISO timestamp with timezone, not in the future |

Unknown and duplicate parameters fail with `400 invalid_history_query`.

## Allowlisted metrics

The first browser-safe set is restricted to daily, point-in-time-safe ETH features already registered in the Intelligence Core. It includes protocol fees and supply, L2 rent, L2 user fees, settlement-cost share, and Ethereum L1/L2 stablecoin supply.

Arbitrary metric keys, entity labels, wallet histories, and raw evidence are not queryable through this route. The current JSONL provider reads the store once per request, prefilters to the bounded query, and rejects more than 20,000 candidate revisions before response construction. A storage migration is still required when the append-only file becomes too large for one bounded in-memory read.

## Point-in-time rules

A row is eligible only when all of the following hold:

```text
subject_ref == ethereum
metric_key is allowlisted
observed_at >= requested start
observed_at <= cutoff
ingested_at <= cutoff
dimensions.window == requested window
```

The `ingested_at <= cutoff` rule prevents later-arriving revisions from leaking into historical views.

## Daily revision selection

The response contains at most one point per metric per UTC day.

For each day:

1. select the latest `observed_at` known by the cutoff;
2. select the latest `ingested_at` for that observation;
3. retain the number of candidate revisions;
4. omit the day if equally latest revisions disagree on value, unit, or methodology.

Ambiguous days are not averaged and are never replaced with zero.

## Response

Each series includes:

- feature description, unit, family, and cadence;
- selected points with observation and ingestion timestamps;
- confidence and methodology version;
- revision count;
- expected, observed, and missing day counts;
- bounded missing-date samples;
- source references;
- methodology segments;
- explicit gap codes.

The top-level response also reports:

- `complete`, `partial`, or `unavailable` status;
- point-in-time cutoff enforcement;
- discarded and ambiguous revision counts;
- latest selected ingestion time;
- commercial redistribution and attribution constraints.

## Distribution controls

Source references are assessed using the Intelligence Core source-license registry.

The browser history may be used in the personal research console. It does not make restricted source data commercially redistributable. GrowThePie, DefiLlama, Coin Metrics Community, Dune, and unknown sources remain blocked or review-gated according to their current registry policy.

The response exposes bounded source identifiers and restriction status, not vendor payloads or entitlement overrides.

## Missing data

Missing dates remain missing. A real zero remains zero.

A series with some observations and missing dates is `partial`. A request with no selected points is `unavailable`. The service does not invent historical data before forward collection began.

## Current limitations

- The endpoint reflects canonical observations already collected; it does not create a hidden backfill.
- The first implementation returns daily snapshots of windowed metrics, not raw transaction-level values.
- Historical Demand Compass classifications are not encoded as numeric metrics in this slice.
- Categorical decisions, policy conclusions, and Decision OS review records remain outside this repository boundary.
- Full L2-level drill-down requires a later contract with chain-specific dimensions and bounded series selection.
