# Intelligence Core Foundation - Detailed Implementation Plan

Date: 2026-08-21
Branch: `feat/intelligence-core-foundation`

## 1. Objective

Introduce a canonical intelligence core without breaking the current MCP server, dashboard, alerting, ETH value-capture, or Demand Compass behavior.

This implementation is deliberately additive. Existing domain modules remain authoritative until migrated behind explicit adapters.

## 2. Scope of this branch

### Included
- canonical schemas for raw evidence, entities, relationships, economic events, and metric observations
- event-time invariants
- local append-only JSONL metric store
- deterministic replay/query helpers
- tests for schema strictness, ordering, duplicate ids, malformed rows, and time-window filtering
- architecture and long-term roadmap documentation

### Explicitly excluded from this first branch
- changing current MCP tool responses
- live database deployment
- scheduled collectors
- historical backfill network calls
- model training
- Upbit strategy changes
- entity-label provider integration
- production HTTP APIs

These exclusions are intentional so that foundation contracts can be reviewed before live pipelines depend on them.

## 3. Canonical data contracts

### 3.1 Time model

Three times must never be conflated:

- `source_at`: time represented by the upstream source, e.g. block timestamp or market observation time
- `observed_at`: time the observation becomes valid for analytical use
- `ingested_at`: time our system recorded it

Invariant:

`source_at <= observed_at <= ingested_at`

Some sources can be revised. A later revision must be a new observation with its own id/version; historical rows are never silently overwritten.

### 3.2 Provenance

Every canonical record must include enough provenance to answer:
- which source produced this fact?
- what source timestamp did it represent?
- when did our system know it?
- what methodology interpreted it?
- what evidence reference/hash allows reproduction?

### 3.3 IDs

IDs are opaque strings generated upstream by deterministic or random mechanisms. The core does not prescribe UUID vs content hash yet, but persistence requires uniqueness.

Recommended future deterministic pattern for metrics:

`sha256(metric_key | subject | observed_at | methodology_version | source-set)`

## 4. Schemas

### RawEvidence

Purpose: immutable reference to source evidence before semantic interpretation.

Fields:
- `id`
- `source`
- `source_type`
- `source_at`
- `observed_at`
- `ingested_at`
- `subject_refs[]`
- `evidence_ref`
- `evidence_hash?`
- `stale`
- `confidence`
- `methodology_version`
- `metadata`

### Entity

Purpose: canonical actor/system identity.

Fields:
- `id`
- `type`
- `display_name?`
- `identifiers[]`
- `labels[]`
- `confidence`
- `methodology_version`

Each identifier and label should later support effective-time history. P0 keeps the entity object bounded and explicit.

### EntityRelationship

Purpose: graph edge between entities.

Examples:
- owns_wallet
- controls
- custodies_for
- market_makes_for
- issued_by
- interacts_with
- bridges_to
- supplies_to
- borrows_from

### EconomicEvent

Purpose: translate technical transactions into reusable economic semantics.

Required dimensions:
- event type
- chain
- transaction/block reference where applicable
- actors
- assets and amounts
- protocol
- economic dimensions
- raw evidence ids
- confidence
- methodology version

### MetricObservation

Purpose: canonical time-series row consumed by research, signals, and models.

Fields:
- `id`
- `metric_key`
- optional subject/entity/asset references
- `value`
- `unit`
- `source_at`
- `observed_at`
- `ingested_at`
- `confidence`
- `source_refs[]`
- `methodology_version`
- `dimensions`

## 5. Persistence contract

Define `MetricObservationStore` with:
- `append(observation)`
- `readAll()`
- `query({metricKey?, subjectRef?, startObservedAt?, endObservedAt?})`

### JSONL P0 implementation

Reason:
- no new dependency
- easy human inspection
- append-only semantics
- deterministic fixtures
- suitable for local development and low-volume forward collection

Safety requirements:
- parent directory creation
- strict schema validation before writes
- duplicate id rejection against persisted content
- reject malformed historical rows on read; never silently skip corruption
- stable chronological sort on query output
- bounded single-file use only; not production scale

Production migration path:
- SQLite adapter for local research and scheduled collectors
- Postgres/Timescale adapter if institutional multi-user workloads appear

The interface keeps callers storage-agnostic.

## 6. First migration after foundation review

Target: ETH Demand Compass/value-capture because the existing limitation is known: collateral and several inputs are point-in-time only.

### Proposed adapter

At snapshot completion, emit `MetricObservation` rows for:
- `eth.gross_l1_fees_eth`
- `eth.total_burn_eth`
- `eth.blob_fee_burn_eth`
- `eth.net_issuance_eth`
- `eth.l2_rent_paid_eth`
- `eth.l2_blob_fee_eth`
- `eth.l2_rent_share_of_l1_fees`
- `stablecoin.supply_delta_7d_pct`
- `aave.eth_family_supplied`
- `lido.total_pooled_eth`

Do not persist the final Compass judgment as if it were raw evidence. Persist both inputs and, separately, a versioned derived signal if needed.

## 7. Feature registry - P1

Create a registry containing:
- feature key
- semantic definition
- unit
- expected cadence
- source preference
- lookback requirements
- staleness threshold
- methodology version
- whether historical backfill is valid
- whether the feature is safe for point-in-time research

This prevents semantic drift when multiple verticals consume the same feature.

## 8. Historical backfill design - P1

Each backfill run must generate a manifest:
- run id
- source
- requested time range
- actual source coverage
- retrieval time
- source version/endpoints
- record count
- checksum of emitted rows
- methodology version
- gaps/revisions

Historical backfill must not overwrite forward observations. If a source revises history, write a new version and retain lineage.

## 9. Upbit research integration - P2

Expose a point-in-time export function that receives a decision timestamp and returns only observations where `observed_at <= decision_at`.

Feature families should enter research one at a time:
1. stablecoin liquidity
2. ETF flow
3. funding/OI
4. KR premium
5. ETH/BTC structural demand
6. entity/exchange flow once labels are reliable

Evaluation order:
1. single-factor descriptive statistics
2. horizon outcomes (7/30/90d or strategy-relevant bars)
3. regime-conditioned diagnostics
4. baseline vs baseline+feature
5. ablation
6. locked holdout
7. cost stress and concentration checks

No feature gets promoted because its narrative is compelling.

## 10. Entity graph implementation - P3

Introduce provider-neutral `EntityLabelProvider` interface.

Minimum label record:
- entity id
- wallet/address
- label
- category
- provider/source
- confidence
- valid_from/valid_to
- observed_at

Graph storage should not be selected until actual query patterns exist. Start with canonical edge records and indexed relational storage; add a graph database only if traversal workloads justify it.

## 11. Predictive layer - P2/P4

Separate descriptive rules from predictions.

- Evidence layer: facts only
- Metric layer: deterministic transformations
- Signal layer: explainable descriptive states such as Demand Compass
- Prediction layer: statistical/ML outcomes with calibration metrics
- Decision layer: product-specific action policy

Initial prediction targets:
- forward return distributions
- volatility
- drawdown probability
- regime transition
- protocol liquidity stress

Models must record:
- training cutoff
- feature versions
- data manifest checksum
- validation protocol
- calibration/performance
- model version

## 12. Testing strategy

P0 tests:
- strict Zod schemas
- event-time ordering
- confidence bounds
- append and replay
- duplicate id rejection
- malformed row rejection
- metric/time filtering
- deterministic chronological output

P1 tests:
- source manifests
- backfill/forward separation
- feature registry compatibility
- revision handling

P2 tests:
- no lookahead exports
- cutoff reproducibility
- train/validation/holdout separation

## 13. Security and data governance

- no API keys or RPC URLs in canonical records
- source payloads containing secrets must be sanitized before evidence persistence
- user/private wallet labels require tenancy and authorization controls before commercialization
- commercial redistribution rights must be tracked per source
- sensitive provider data must not leak through public MCP responses

## 14. Operational metrics

Track these before calling the core production-ready:
- feature coverage by day
- freshness SLA
- failed collection rate
- revision rate
- duplicate rate
- unknown entity rate
- unknown economic-event rate
- source cost per successful observation
- downstream reuse count per feature

## 15. Implementation sequence

### Current branch
1. canonical schemas
2. JSONL store
3. unit tests
4. docs

### Next PR
5. feature registry
6. ETH metric adapter
7. forward collector CLI
8. SQLite store

### Following PR
9. public-history backfill
10. data-quality report
11. point-in-time dataset export
12. Upbit research ingestion contract

### Later
13. entity provider abstraction
14. relationship graph
15. token/protocol intelligence
16. institutional research/API
17. treasury/risk
18. RWA and specialist verticals

## 16. Definition of done for this foundation branch

- additive code only; existing runtime behavior unchanged
- canonical contracts documented and tested
- local observation store can append, replay, filter, and detect duplicate/corrupt data
- no new runtime dependency
- `npm run typecheck`, `npm test`, and `npm run build` expected to remain compatible
- branch is reviewable independently before any live data migration
