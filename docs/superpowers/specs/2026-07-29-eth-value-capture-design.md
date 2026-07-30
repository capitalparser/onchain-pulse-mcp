# ETH Value Capture MCP Design

Date: 2026-07-29

Status: Approved for implementation planning

Owner project: `onchain-pulse-mcp`

Target branch: `feat/eth-value-capture`, created in a separate linked worktree
from the approved design commit on `feat/v0.1-implementation`

## 1. Purpose

Add a read-only MCP snapshot that shows whether Ethereum usage is accruing to
ETH through fee burn, validator execution tips, L2 payments to Ethereum, and
net supply change.

The snapshot answers:

> Is Ethereum receiving economically meaningful payment, and is that payment
> reducing ETH supply or accruing to validators?

It does not predict ETH price, prescribe a trade, or collapse overlapping
metrics into a single value-capture score.

## 2. Project Fit

This enhancement belongs in `onchain-pulse-mcp`, not a new project.

- The project already exposes read-only onchain market snapshots through MCP.
- External systems enter through adapters.
- Responses expose source provenance, stale data, confidence, and explicit
  gaps.
- The project already uses DefiLlama, CoinGecko, and Ethereum RPC paths.
- `21_blockchain_onchain_program` names `onchain-pulse-mcp` as the owner of the
  onchain data lens; the program project itself does not own implementation.

## 3. Scope

### 3.1 MVP

Add one MCP tool:

```text
get_eth_value_capture
```

It supports 7-day, 30-day, and 90-day windows and returns the current window
and the immediately preceding equal-length window.

The MVP reports:

- gross L1 fees,
- base fee burn,
- blob fee burn,
- priority fees,
- total burn,
- consensus issuance,
- net issuance,
- total L2 rent paid to Ethereum,
- L2 calldata, blob, and verification fee components,
- optional rollup-level L2 rent breakdown,
- blob share of burn,
- L2 rent share of gross L1 fees.

### 3.2 Explicitly Deferred

- ETH price and ETH/BTC comparison,
- ETF or treasury-company flow comparison,
- bullish, bearish, structural, or supply-driven classifications,
- ETH collateral demand,
- protocol-specific Aave, Spark, Maker/Sky, Lido, or EigenLayer parsers,
- local web dashboard,
- SQLite or Postgres ETL,
- full Beacon API reward indexing,
- full execution receipt indexing,
- automatic trading or investment recommendations.

These are separate follow-up design cycles.

## 4. Domain Definitions and Invariants

### 4.1 Definitions

**Gross L1 fees**

The execution base fee, execution priority fee, and blob fee paid during the
measurement window.

```text
gross_l1_fees
  = base_fee_burn
  + priority_fee
  + blob_fee_burn
```

**Base fee burn**

ETH burned through the EIP-1559 execution base fee.

**Blob fee burn**

ETH burned through the independent blob fee market.

**Priority fee**

Execution tips paid to block proposers. It is not total validator revenue and
does not include out-of-protocol MEV or builder payments.

**Total burn**

```text
total_burn = base_fee_burn + blob_fee_burn
```

**Net issuance**

The change in total ETH supply over the exact measurement window. A negative
number means net supply contraction.

**Consensus issuance**

For aligned post-Merge windows:

```text
consensus_issuance = net_issuance + total_burn
```

This derivation is allowed only when net supply change and burn cover identical
UTC boundaries.

**L2 rent paid to Ethereum**

L1 costs paid by labelled L2 rollups for calldata, blobs, and proof
verification.

### 4.2 Invariants

- L2 rent is a subset of Ethereum L1 fees.
- L2 blob rent overlaps with blob fee burn.
- Burn and L2 rent must never be added to produce a synthetic total
  value-capture number.
- Priority fees must not be labelled as total validator revenue.
- A missing component is `null`, not zero.
- Consensus issuance is `null` when source periods do not align.
- The response reports measurements and gaps, not a trading recommendation.
- All periods use completed UTC-day boundaries.
- The current partial UTC day is excluded.

## 5. Public MCP Contract

### 5.1 Input

```ts
type GetEthValueCaptureInput = {
  window?: "7d" | "30d" | "90d";
  paid_mode?: "free_only" | "byok_allowed";
  include_rollups?: boolean;
};
```

Defaults:

```ts
{
  window: "30d",
  paid_mode: "free_only",
  include_rollups: false
}
```

`free_only` must never submit a new Dune execution. It may return a valid
in-process cached Dune result produced by an earlier explicitly authorized
call, with its original source timestamp.

`byok_allowed` may submit one Dune SQL execution only when `DUNE_API_KEY` is
present.

### 5.2 Window Metric

```ts
type EthWindowMetric = {
  current: number | null;
  previous: number | null;
  delta: number | null;
  pct_change: number | null;
  unit: "ETH";
};
```

`pct_change` is `null` when either value is missing or the previous value is
zero.

### 5.3 Response

```ts
type EthValueCaptureSnapshot = {
  summary: string;
  window: "7d" | "30d" | "90d";
  cutoff_day: string | null;
  as_of: string;
  status: "complete" | "partial" | "unavailable";
  metrics: {
    gross_l1_fees_eth: EthWindowMetric;
    base_fee_burn_eth: EthWindowMetric;
    blob_fee_burn_eth: EthWindowMetric;
    priority_fee_eth: EthWindowMetric;
    total_burn_eth: EthWindowMetric;
    consensus_issuance_eth: EthWindowMetric;
    net_issuance_eth: EthWindowMetric;
    l2_rent_paid_eth: EthWindowMetric;
    l2_calldata_fee_eth: EthWindowMetric;
    l2_blob_fee_eth: EthWindowMetric;
    l2_verification_fee_eth: EthWindowMetric;
  };
  ratios: {
    blob_share_of_total_burn: {
      current: number | null;
      previous: number | null;
      delta: number | null;
      unit: "ratio";
    };
    l2_rent_share_of_l1_fees: {
      current: number | null;
      previous: number | null;
      delta: number | null;
      unit: "ratio";
    };
  };
  rollups?: Array<{
    name: string;
    l1_rent_eth: EthWindowMetric;
    calldata_fee_eth: EthWindowMetric;
    blob_fee_eth: EthWindowMetric;
    verification_fee_eth: EthWindowMetric;
  }>;
  sources: string[];
  source_status: Array<{
    source: string;
    role: string;
    as_of: string | null;
    stale: boolean;
  }>;
  stale_data: string[];
  confidence: number;
  capabilities: {
    byok_active: string[];
    paid_sources_active: string[];
  };
  gaps: Array<{
    code:
      | "source_access_gap"
      | "source_stale"
      | "dune_execution_failed"
      | "dune_execution_timeout"
      | "dune_schema_drift"
      | "partial_result"
      | "period_mismatch"
      | "derivation_blocked";
    detail: string;
  }>;
  methodology_version: "eth-value-capture-v1";
};
```

The specialized snapshot does not reuse the existing score-oriented
`ToolResponse`; `score` and `reading` are not meaningful for this measurement.
`summary` follows the project's existing `OPM_LANG` setting and supports
English and Korean without adding a new language argument to the tool.

## 6. Source Contract

### 6.1 Dune

Tables:

- `gas.fees`
- `rollup_economics_ethereum.l1_fees`

Roles:

- `gas.fees` provides fee components.
- `rollup_economics_ethereum.l1_fees` provides total and component L2 rent.

Authentication:

- `DUNE_API_KEY` is read from environment configuration.
- It is sent only in the `X-DUNE-API-KEY` header.
- It is never persisted, returned, or included in errors.

Execution:

- Use Dune direct SQL execution rather than an externally maintained query ID.
- Keep SQL in a bundled, version-controlled TypeScript query module.
- Submit at most one SQL execution per cache key.
- Use Dune's `small` performance tier.
- Poll status until a bounded timeout.
- Do not automatically submit another execution after failure or timeout.

The SQL returns current and previous windows in one execution. With
`include_rollups=true`, it also returns rollup rows without a second execution.

The query must:

- filter `blockchain = 'ethereum'`,
- include `block_month` and `block_date` partition filters,
- use validated server-generated UTC dates,
- derive gross L1 fees from explicit base, priority, and blob components,
- expose evidence that expected fee-component map keys were present,
- reconcile L2 component sums to `l1_fee_native`,
- return no partial current UTC day.

If required columns or component keys are absent, affected metrics are `null`
and the response contains `dune_schema_drift`. A missing component must not
silently become zero.

### 6.2 Coin Metrics

Endpoint:

```text
https://community-api.coinmetrics.io/v4/timeseries/asset-metrics
```

Parameters include:

```text
assets=eth
metrics=SplyCur
frequency=1d
```

Role:

- Provide daily total ETH supply points.
- Net issuance is the difference between exact boundary points.

Rules:

- Parse decimal strings only after schema validation.
- Reject duplicate or non-monotonic timestamps.
- Do not interpolate a missing boundary.
- Treat the source as stale when its latest completed daily point lags by more
  than two UTC days.
- Request enough history for current and previous windows plus a small boundary
  buffer.

Coin Metrics is the MVP primary supply source because its Community API
currently returns fresh ETH `SplyCur` history without a key.

### 6.3 ultrasound.money

ultrasound.money is not a canonical MVP input.

Its public `supply-over-time` response was inspected on 2026-07-29 and reported
an API timestamp of 2026-07-21. It may be added later as a fresh-only
cross-check, but it must not fill a stale or missing Coin Metrics boundary.

### 6.4 Future RPC and Beacon Sources

Execution RPC and Beacon API adapters remain follow-up verification paths.
They may eventually independently verify:

- base fee burn,
- blob fee burn,
- execution priority fees,
- consensus reward and penalty totals.

They do not block the Dune-first MVP.

## 7. Data Flow

1. Parse and validate MCP input.
2. Fetch Coin Metrics daily supply history.
3. Choose a candidate cutoff: the latest valid Coin Metrics UTC boundary when
   available, otherwise the most recent completed UTC day from the runtime
   clock.
4. If `paid_mode=byok_allowed` and a Dune key exists, submit the single Dune
   query using that boundary.
5. If the Dune path is not authorized, try a valid in-process cache entry.
6. Validate each adapter response independently.
7. When both sources are valid, require the queried Dune boundary and the Coin
   Metrics boundary to match. When only one source is valid, retain that
   source's boundary so its independent metrics can still be returned.
8. Construct current and previous equal-length intervals.
9. Compute deterministic metrics and ratios in the domain module.
10. Derive consensus issuance only for exactly aligned intervals.
11. Assemble status, confidence, source status, stale data, and gaps.
12. Validate the complete output schema before returning it through MCP.

Intervals are half-open:

```text
current  = [cutoff_day - window, cutoff_day)
previous = [cutoff_day - 2 * window, cutoff_day - window)
```

## 8. Module Responsibilities

| Module | Responsibility |
|---|---|
| `src/adapters/eth_value_dune.ts` | Dune authentication, execution, polling, result validation, caching |
| `src/adapters/eth_supply_coinmetrics.ts` | Coin Metrics request and daily supply normalization |
| `src/queries/eth_value_capture.ts` | Bundled deterministic Dune SQL |
| `src/eth_value_capture/metrics.ts` | Pure metric, ratio, and interval calculations |
| `src/eth_value_capture/types.ts` | Specialized Zod schemas and TypeScript types |
| `src/tools/get_eth_value_capture.ts` | Snapshot assembly and summary generation |
| `src/server.ts` | MCP registration, input parsing, adapter orchestration |

Domain calculation modules must not perform network, filesystem, environment,
or cache access.

## 9. Cost and Cache Controls

- Default mode is `free_only`.
- Dune execution requires both explicit `byok_allowed` and `DUNE_API_KEY`.
- Dune performance tier is fixed to `small` in the MVP.
- Cache key includes window, cutoff day, and rollup-breakdown flag.
- Fresh cache TTL is 30 minutes.
- Concurrent identical requests share one in-flight execution.
- A stale cached result may be returned only with its original `as_of` and a
  stale marker.
- A timeout does not trigger a second execution.
- Dune execution IDs may be logged for diagnosis; API keys and SQL headers may
  not.

## 10. Failure Semantics

`complete`:

- Dune fee and L2 rent data are valid.
- Coin Metrics supply data are valid.
- Current and previous boundaries align.
- Consensus issuance is derivable.

`partial`:

- At least one valid metric is available, but a source or derivation is missing,
  stale, misaligned, or rejected.

`unavailable`:

- No valid core metric is available.

Adapter failures do not become fabricated zeros. The tool returns a partial
snapshot unless the MCP input itself is invalid or output validation detects an
internal programming error.

## 11. Confidence

Confidence measures source coverage, not investment certainty.

Weights:

- Dune fee components: 0.35
- Dune L2 rent: 0.25
- Coin Metrics net issuance: 0.25
- aligned consensus issuance derivation: 0.15

Unavailable or stale components contribute zero. Weights are not
re-normalized; missing data lowers confidence.

## 12. Testing

### 12.1 Pure Domain Tests

- gross fee equals base plus priority plus blob,
- total burn equals base plus blob,
- burn and L2 rent are never added into a synthetic total,
- current, previous, delta, and percent-change calculations,
- zero previous value produces `pct_change=null`,
- negative net issuance remains negative,
- consensus issuance derivation requires identical intervals,
- missing inputs remain `null`,
- ratio division by zero produces `null`.

### 12.2 Dune Adapter Tests

- pending to completed polling,
- failed, canceled, and partial execution states,
- timeout without automatic resubmission,
- concurrent-call deduplication,
- missing blob component key,
- missing required result column,
- L2 component reconciliation failure,
- stale-cache fallback,
- API key absence,
- API key redaction from errors and output.

### 12.3 Coin Metrics Adapter Tests

- valid decimal-string conversion,
- missing, duplicate, reversed, and non-monotonic daily points,
- exact boundary selection,
- stale latest point,
- negative supply delta,
- upstream HTTP and schema errors.

### 12.4 MCP Contract Tests

- `listTools()` exposes `get_eth_value_capture`,
- defaults and enum validation,
- `free_only` never submits Dune execution,
- `byok_allowed` without a key returns an explicit access gap,
- partial adapter failure returns a `partial` snapshot,
- rollup rows appear only when requested,
- methodology and source fields are preserved,
- output passes the specialized Zod schema.

### 12.5 Verification Commands

```bash
npm test
npm run typecheck
npm run build
```

Live tests are opt-in:

- Coin Metrics free smoke verifies the actual response structure and freshness.
- Dune smoke requires a user-provided `DUNE_API_KEY`.
- Live tests are excluded from the default deterministic suite.

## 13. Kickoff Contract

### Input Data

- Dune curated fee and rollup-economics tables.
- Coin Metrics daily total ETH supply.
- Environment-provided Dune API credentials when explicitly authorized.

### Data Schema

- ETH is the unit for all monetary metrics.
- Ratios are decimal fractions, not percentages.
- Windows are 7, 30, or 90 completed UTC days.
- Current and previous periods are equal-length and non-overlapping.
- Current partial-day data is excluded.

### Source Priority

1. Dune curated tables for execution fees and L2 rent.
2. Coin Metrics `SplyCur` for total supply change.
3. Deterministic derivations from aligned primary inputs.
4. Stale cache only as explicitly marked fallback.
5. ultrasound.money is not an MVP fallback.

### Business Terms

The definitions and invariants in Section 4 are binding. In particular,
priority fees are not total validator revenue and L2 rent is not additive to
burn.

### Output Shape

A single `EthValueCaptureSnapshot` returned by the
`get_eth_value_capture` MCP tool.

### Stop Conditions

Stop a derivation and return `null` plus a gap when:

- required source boundaries do not match,
- required Dune fields or map components are missing,
- supply boundaries are absent,
- a source is beyond its freshness limit,
- an input is non-finite,
- reconciliation checks fail,
- a paid query was not explicitly authorized.

### Done Criteria

- Public schema and MCP tool are implemented.
- Deterministic tests cover formulas, failures, redaction, and period alignment.
- Coin Metrics live free smoke has reviewed output.
- Dune live smoke has reviewed output when a key is available.
- Default tests, typecheck, and build pass.
- README and domain documentation explain definitions, costs, sources, gaps,
  and deferred scope.

## 14. Documentation Changes During Implementation

Implementation updates:

- `CONTEXT.md` with ETH value-capture terms and overlap invariants,
- `AGENTS.md` module responsibility table,
- `README.md` tool arguments, example response, environment variables, and
  Dune cost warning,
- a focused ADR if live Dune validation forces a durable change to the approved
  source or schema contract.

## 15. Worktree and Delivery

The design document is committed on the clean
`feat/v0.1-implementation` checkout.

Implementation then occurs in a separate linked worktree on:

```text
feat/eth-value-capture
```

No push, pull request, or merge is performed without explicit user approval.
