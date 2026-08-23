# Digital Asset Intelligence Console — frontend decision

## Decision

The product frontend should be a separate analytical web workspace:

```text
capitalparser/digital-asset-intelligence-console
```

The target stack is:

```text
Next.js App Router
TypeScript
React Server Components for initial reads
Route Handlers as a backend-for-frontend boundary
TanStack Query for refresh, cache, and drill-down reads
Apache ECharts for dense time-series and cross-metric charts
Zod contracts shared with the evidence engine
```

`onchain-pulse-mcp` remains the evidence and semantic engine. Its current embedded HTML dashboard remains a local diagnostics and smoke-test surface, not the long-term product shell.

## Why a web analytical workspace

The primary workflow is not simply checking a price or receiving an alert. A user needs to move through:

```text
state
→ movement
→ drivers
→ evidence
→ source quality
→ decision context
```

The frontend therefore needs:

- several coordinated charts;
- drill-down by chain, metric, and period;
- evidence lineage and source-license visibility;
- history and backtest views;
- saved filters and watchlists later;
- role-aware decision surfaces later;
- a clean separation between research evidence and execution.

A web workspace supports those needs while remaining usable on desktop and mobile browsers. A desktop wrapper can be considered later without changing the data contracts.

## Surface roles

The system should expose the same evidence through several surfaces, but only one surface is the source of truth.

| Surface | Role | Product status |
|---|---|---|
| Web console | Primary research and decision workspace | Target frontend |
| Embedded HTML dashboard | Local diagnostics, smoke tests, emergency fallback | Keep thin |
| Telegram | Alert and exception delivery | Secondary |
| TradingView | Price/technical context and final derived factor overlays | Secondary |
| MCP / LLM | Conversational investigation and evidence retrieval | Secondary |
| Upbit execution | Explicitly separated order execution | Never embedded in the research UI |

## Why not use the existing embedded dashboard as the final frontend

The embedded dashboard is useful because it is:

- dependency-light;
- local-first;
- credential-safe;
- easy to test with the Node service.

It is not a strong long-term product shell because it couples HTML, presentation logic, API routes, and the data server in one file. That becomes difficult to maintain when adding:

- multiple assets;
- user preferences;
- comparison windows;
- historical chart interactions;
- source detail drawers;
- authentication;
- decision packs;
- institutional workflows.

It should remain a bounded operational surface.

## Why not Streamlit

Streamlit is useful for a short-lived data prototype, but this project already has a typed TypeScript engine and needs a durable product shell. Using Streamlit would create:

- a second language/runtime boundary;
- duplicated metric semantics;
- weaker control over complex interaction and responsive layouts;
- migration work when authentication and multi-workspace features arrive.

## Why not TradingView as the primary frontend

TradingView is excellent for price, volume, technical indicators, and event overlays. It is not suitable as the system of record for:

- source lineage;
- licensing status;
- evidence gaps;
- chain-scope definitions;
- collateral attribution;
- scenario assumptions;
- decision-review history.

The console can later publish a small number of validated factors to TradingView, but TradingView should not own the analytical model.

## Why not Telegram as the primary frontend

Telegram is appropriate for:

- threshold alerts;
- anomaly summaries;
- scheduled briefings;
- links back to the relevant console view.

It is not appropriate for multi-dimensional analysis or auditability.

## Repository boundary

```text
onchain-pulse-mcp
├─ source adapters
├─ semantic definitions
├─ point-in-time metrics
├─ source lineage and licensing gates
├─ demand/value-accrual classifications
└─ transport-safe frontend contracts

Digital Asset Intelligence Console
├─ authentication and workspace settings
├─ navigation and page state
├─ charts, tables, and drill-down
├─ saved views and watchlists
├─ annotations and report composition
└─ BFF routes that call the evidence engine

upbit-autotrader-research
└─ factor research and backtests

upbit-autotrader-execution
└─ credentials, controls, and order execution

digital-asset-decision-os
└─ institutional policy, review, and decision artifacts
```

The console must not call GrowThePie, DefiLlama, Dune, Ethereum RPC, or other sources directly. All source access remains behind the evidence engine so point-in-time, null handling, provenance, and commercialization controls cannot be bypassed.

## First frontend contract

`src/frontend_contract/eth_overview.ts` defines a compact overview response with:

```text
decision
├─ ecosystem_state
├─ eth_capture_state
├─ classification
├─ capture_tier
├─ judgment
├─ confidence
└─ evidence

hero_metrics
├─ protocol_total_burn_eth
├─ protocol_net_issuance_eth
├─ l2_user_fees_usd
├─ l2_rent_paid_usd
├─ l2_settlement_cost_share
└─ ethereum_ecosystem_stablecoin_supply_usd

coverage
├─ included Ethereum-DA L2s
└─ excluded external-DA chains

data_quality
├─ aligned cutoff
├─ source statuses
├─ stale sources
├─ gap codes
└─ methodology versions
```

The contract deliberately omits:

- BYOK or paid-source capability fields;
- raw credentials;
- execution controls;
- trade recommendations;
- direct source payloads.

## Information architecture

### 1. Overview

Default decision surface.

```text
Header
├─ as-of timestamp
├─ aligned cutoff
├─ data quality state
└─ refresh state

Decision matrix
├─ ecosystem growth state
└─ ETH value-accrual state

Hero metrics
├─ burn
├─ net issuance
├─ L2 user fees
├─ L2 rent
├─ settlement-cost share
└─ Ethereum ecosystem stablecoin supply

Drivers
├─ demand compass axes
├─ strongest evidence
└─ unresolved gaps
```

### 2. Ethereum protocol capture

- L1 fees;
- base-fee burn;
- blob burn;
- priority fees;
- issuance;
- net issuance;
- source reconciliation.

### 3. L2 economics

- user fees by L2;
- rent paid to Ethereum by L2;
- settlement-cost share;
- included and excluded DA scope;
- current-versus-prior window comparisons.

### 4. Stablecoin and RWA

- Ethereum L1 stablecoin supply;
- Ethereum-settled L2 supply;
- ecosystem share;
- RWA attribution only after source and methodology gates pass.

### 5. Collateral and credit

- supplied capacity;
- actual collateral activation when available;
- ETH-family collateral share;
- stablecoin debt attribution;
- liquidation and rehypothecation risk.

### 6. Evidence and sources

- metric definitions;
- source lineage;
- coverage;
- freshness;
- license classification;
- known gaps.

### 7. History, backtest, and alerts

- observation history;
- forward outcomes;
- regime comparisons;
- alert thresholds;
- links to Telegram and downstream research.

## Default visual model

The first screen should lead with the analytical question rather than a raw metric grid:

```text
Is the Ethereum ecosystem growing?
              ×
Is value accruing to ETH?
```

The primary classification is a 2×2 decision matrix:

| | ETH capture strengthening | ETH capture weak or leaking |
|---|---|---|
| Ecosystem expanding | Growth with capture | Growth without capture |
| Ecosystem stable/contracting | Capture without growth | Weak |

Below the matrix, charts should explain the classification rather than repeat it.

## Delivery sequence

### F0 — contract and diagnostics

- keep the embedded dashboard;
- add a compact overview contract;
- maintain strict Zod validation;
- show source and cutoff quality prominently.

### F1 — standalone console shell

- create the separate private frontend repository;
- scaffold Next.js App Router and TypeScript;
- add the overview page;
- implement server-side BFF calls to the evidence engine;
- do not add authentication until the local workflow is useful.

### F2 — analytical drill-down

- protocol capture page;
- L2 economics page;
- history endpoint and charts;
- source/evidence drawer;
- URL-addressable filters.

### F3 — research workflow

- annotations;
- saved views;
- watchlists;
- backtest comparisons;
- Telegram deep links;
- optional TradingView factor export.

### F4 — institutional product surface

Only after independent decision validation:

- workspace authentication;
- role permissions;
- mandate and review pages;
- decision packs;
- organization-level source-entitlement controls.

## Frontend success criteria

The first console iteration succeeds only if a user can answer these questions in under two minutes:

1. Is the Ethereum ecosystem expanding or contracting?
2. Is ETH value capture strengthening, stable, weakening, or unknown?
3. Which metrics caused that classification?
4. Is the conclusion fee-led, settlement-led, supply-led, or collateral-confirmed?
5. Which evidence is missing or stale?
6. Which chains and data-availability scopes are included or excluded?
7. Can the user open the supporting metric and source definition without leaving the workflow?

A visually polished dashboard that cannot answer those questions is not a successful frontend.
