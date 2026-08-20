# Crypto Economic Intelligence Infrastructure Roadmap

## 1. Product thesis

`onchain-pulse-mcp` should evolve from a collection of snapshot-oriented MCP tools into a reusable crypto economic intelligence core.

The durable asset is not the dashboard, MCP transport, trading strategy, accounting workflow, or any single score. The durable asset is the normalized chain of evidence:

`raw observation -> entity -> economic event -> metric/feature -> signal -> prediction -> decision`

Every vertical must consume the same canonical evidence and may apply its own decision policy.

## 2. Architectural principles

1. **Evidence before inference**: every derived value must retain source provenance and observation time.
2. **Event-time correctness**: `source_at`, `observed_at`, and `ingested_at` are separate fields. No future information may enter historical evaluation.
3. **Fail closed**: missing or stale evidence stays explicit; absence never becomes a positive signal.
4. **Version everything**: methodology, labels, models, and feature definitions are versioned.
5. **Core/vertical separation**: trading, research, treasury, DD, RWA, and accounting/audit are consumers, not core modules.
6. **Deterministic base layer**: normalization and accounting of facts stay deterministic; probabilistic models live above them.
7. **Externalize commodity data**: buy or integrate labels, RPC, pricing, sanctions, and market data where practical. Build proprietary economic interpretation and cross-source normalization.
8. **No premature monolith**: introduce the intelligence core alongside existing modules and migrate incrementally.

## 3. Target architecture

```text
Sources
  Chain RPC / indexers / CEX / derivatives / ETF / macro / news / social / GitHub / RWA
    |
    v
Raw Evidence
  source payload / hash / source_at / observed_at / ingested_at
    |
    v
Normalization
  chain / asset / protocol / units / canonical identifiers
    |
    v
Entity + Event Graph
  wallet / exchange / protocol / fund / company / economic-event ontology
    |
    v
Feature Store + Time Series
  flow / liquidity / leverage / supply / demand / value capture / risk
    |
    +-------------------+
    |                   |
    v                   v
Descriptive signals     Predictive models
Demand Compass          return / regime / volatility / stress
    |                   |
    +---------+---------+
              v
Intelligence API
  TypeScript API / MCP / HTTP / agent tools
              |
              +--> Trading / Upbit research
              +--> Research agent / terminal
              +--> Token & protocol intelligence
              +--> Treasury & risk
              +--> Due diligence
              +--> RWA intelligence
              +--> Accounting / audit / compliance
```

## 4. Core canonical model

### 4.1 RawObservation

Immutable evidence obtained from a source.

Required concepts:
- observation id
- source name and source type
- `source_at`
- `observed_at`
- `ingested_at`
- subject identifiers
- evidence hash or source reference
- source freshness
- confidence
- methodology version

### 4.2 Entity

Canonical economic actor or system.

Initial entity types:
- wallet
- exchange
- custodian
- protocol
- token issuer
- market maker
- fund
- company
- DAO
- bridge
- oracle
- unknown cluster

Labels must carry source, confidence, effective time, and version.

### 4.3 EconomicEvent

Initial event ontology:
- transfer
- swap
- stake / unstake
- lend / borrow / repay
- liquidate
- lp_add / lp_remove
- bridge
- mint / burn
- reward_claim
- vest / unlock
- treasury_transfer
- cex_deposit / cex_withdrawal
- collateral_add / collateral_remove
- governance_action

Higher-level economic dimensions:
- capital_flow
- liquidity
- leverage
- supply
- demand
- yield
- collateral
- ownership
- settlement
- risk_transfer

### 4.4 MetricObservation

Canonical time-series record for all derived metrics.

Required concepts:
- metric key
- subject/entity/asset
- numeric value and unit
- `source_at`, `observed_at`, `ingested_at`
- confidence
- source references
- methodology version
- tags/dimensions

## 5. Delivery roadmap

### P0 - Intelligence core foundation

Goal: make future data accumulation and migration safe before adding more tools.

Deliverables:
- canonical Zod schemas for evidence, entities, events, and metric observations
- append-only time-series persistence interface
- local JSONL implementation for development and deterministic tests
- duplicate-id rejection and strict parsing
- documented event-time invariants
- migration adapters for at least one existing signal family
- historical-backfill design

Exit criteria:
- new metric observations can be persisted and replayed deterministically
- methodology version is present on every stored metric
- future timestamps and malformed records are rejected by schema or validation policy
- unit tests pass independently of network access

### P1 - History and feature foundation

Goal: turn snapshot tools into researchable time series.

Deliverables:
- production persistence adapter (SQLite initially; Postgres/Timescale optional later)
- scheduled snapshots for ETH value capture, Demand Compass inputs, ETF, stablecoin, funding/OI, KR premium, RWA
- historical backfill jobs with source-boundary manifests
- feature registry with definitions, versions, expected cadence, and units
- data-quality report: coverage, freshness, duplicates, revisions, source gaps
- observation cutoffs usable by backtests

Exit criteria:
- at least 12 months of backfilled history where public sources allow it
- daily forward collection for non-backfillable features
- every research row reproducible from a cutoff timestamp

### P2 - Trading research integration

Goal: test whether onchain intelligence reduces false positives or improves risk-adjusted outcomes in `upbit-autotrader-research`.

Deliverables:
- point-in-time export contract from the intelligence core
- feature families: ETF, stablecoin liquidity, exchange flow, funding/OI, KR premium, ETH/BTC structural demand
- baseline vs baseline+onchain experiments
- single-factor diagnostics before multivariate modeling
- ablation tests and leave-one-family-out tests
- purged/embargoed walk-forward and locked holdout

Success gate:
- improvement must survive locked holdout and cost stress
- no strategy promotion merely because in-sample metrics improve
- existing SHADOW policy remains authoritative until all gates pass

### P3 - Entity resolution and graph

Goal: move from asset-level market signals to actor-level intelligence.

Deliverables:
- entity registry and alias graph
- external-label adapters (provider-neutral interface)
- wallet/entity relationship edges
- label confidence and temporal validity
- transaction flow graph builder
- entity exposure and concentration metrics

Do not attempt to recreate Chainalysis/Nansen proprietary label coverage from scratch. Integrate external labels while accumulating reviewed proprietary labels around economically important entities.

### P4 - Token and protocol intelligence

Goal: produce auditable token/protocol quality views.

Feature families:
- holder concentration
- insider/entity exposure
- treasury runway
- exchange flows
- liquidity depth
- unlock/emissions pressure
- governance concentration
- protocol usage and fees
- token value capture
- developer activity
- derivatives positioning

Outputs:
- evidence-backed token scorecard
- protocol health view
- explicit `insufficient-evidence` state
- API/MCP surfaces for downstream agents

### P5 - Research agent and institutional terminal

Goal: monetize the intelligence layer without relying on trading returns.

Capabilities:
- explain market moves with structured evidence
- compare competing hypotheses
- show confirming and contradicting evidence
- historical analogue retrieval
- source/cutoff/confidence display
- institution-facing dashboards and exports

Commercial tests:
- paid analyst/PM pilots
- API/MCP usage pricing
- premium entity/feature packages

### P6 - Treasury and risk

Goal: map digital-asset positions into economic exposure and risk.

Capabilities:
- spot/staking/restaking/lending/LP exposure graph
- smart-contract, counterparty, liquidation, liquidity, bridge, depeg, concentration risk
- scenario and stress testing
- portfolio-level look-through
- policy alerts

### P7 - Due diligence

Goal: compare disclosed claims with observable blockchain behavior.

Capabilities:
- treasury movement
- issuer/founder/investor/market-maker relationships
- token issuance and unlock reconciliation
- liquidity sustainability
- protocol usage versus narrative
- exposure and concentration red flags

### P8 - RWA intelligence

Goal: link onchain token behavior to offchain economic claims.

Requires:
- asset/legal-claim model
- custody and servicing data
- underlying cash flows
- valuation observations
- collateral and waterfall data
- onchain holder/liquidity/collateral behavior

This is a long-term option, not the first product wedge.

### P9 - Accounting, audit, compliance verticals

Use the same entity/event/evidence graph for specialist workflows. These are downstream applications, not the architecture center.

## 6. Commercial sequencing

1. **Internal research proof**: use Upbit research as a demanding validation consumer.
2. **Research/API product**: monetize explanations and structured signals without taking execution responsibility.
3. **Token/protocol intelligence**: higher-value B2B research and DD.
4. **Treasury/risk**: recurring institutional workflow.
5. **RWA and specialist assurance/compliance**: later verticals after the graph and evidence foundation are mature.

## 7. Falsification gates

The roadmap must be stopped or narrowed if any of the following persist:
- derived features do not add stable out-of-sample information
- external data costs exceed realistic customer gross margin
- entity resolution quality is too low for decision use
- customers value existing dashboards enough that structured evidence adds no willingness to pay
- core complexity grows faster than reusable vertical value
- source licensing prevents redistribution/API commercialization

## 8. Repository strategy

For now keep one repository and introduce `src/intelligence_core/` in parallel.

Do **not** split repositories until at least two consumers use the same core contract. A future split is justified only when:
- core release cadence diverges from applications
- independent deployment is required
- consumer repos need a versioned package

Potential future layout:
- `crypto-intelligence-core`
- `onchain-pulse-mcp` as an interface/application
- `crypto-research-terminal`
- existing Upbit research/execution repos as downstream consumers

## 9. Immediate implementation order

1. Add canonical core schemas.
2. Add append-only metric store and tests.
3. Persist selected existing ETH Demand Compass/value-capture metrics.
4. Add feature registry.
5. Add scheduled collector and forward observation manifest.
6. Backfill public historical features.
7. Export point-in-time research dataset to `upbit-autotrader-research`.
8. Run single-factor and ablation studies before any ML model.
