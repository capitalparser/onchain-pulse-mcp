# GrowThePie L2 Rent Fallback Design

## Goal

Provide current and previous Ethereum L2 rent totals in
`get_eth_value_capture` without requiring a Dune API key. GrowThePie is a
free fallback for L2 rent only. It does not replace Dune for L1 fees or for
the calldata, blob, and verification fee decomposition.

## Scope

This slice adds:

- a cached GrowThePie `rent_paid_eth` adapter;
- current and previous equal-window aggregation for 7, 30, and 90 days;
- optional rollup-level rent totals;
- deterministic source precedence between Dune and GrowThePie;
- source, freshness, confidence, and gap reporting for the fallback;
- unit, server integration, tool assembly, and opt-in live-source tests.

This slice does not add:

- L1 base fee, blob fee, or priority fee data from GrowThePie;
- calldata, blob, or verification fee decomposition from GrowThePie;
- L2 user revenue, profit, or Ethereum take-rate calculations;
- execution RPC or Beacon API indexing;
- ETH collateral demand.

## External Contract

The adapter reads:

`https://api.growthepie.com/v1/export/rent_paid.json`

The endpoint is selected instead of `v1/fundamentals.json` because the
snapshot compares two adjacent windows. A 90-day request therefore requires
180 completed UTC days, while the fundamentals endpoint is limited to recent
daily history.

The response is an array. Relevant rows have this exact shape:

```ts
interface GrowThePieRentRow {
  metric_key: "rent_paid_eth";
  origin_key: string;
  date: string; // YYYY-MM-DD
  value: number;
}
```

Rows whose `metric_key` is not `rent_paid_eth`, including
`rent_paid_usd`, are ignored. Every selected row must have a non-empty
`origin_key`, a canonical UTC date, and a finite non-negative numeric value.
Duplicate `(origin_key, date)` rows are schema drift.

## Window Semantics

The existing Coin Metrics supply adapter continues to establish the exclusive
`cutoffDay`. The GrowThePie adapter receives that cutoff and uses the same
half-open windows as the snapshot:

- current: `[cutoffDay - windowDays, cutoffDay)`
- previous: `[cutoffDay - 2 * windowDays, cutoffDay - windowDays)`

GrowThePie `date` is interpreted as the UTC day whose rent is measured.
Rows on or after `cutoffDay` and rows before the previous-window start do not
contribute.

Each calendar day in the combined two-window range must contain at least one
valid `rent_paid_eth` row. This detects a wholly missing export day without
inventing a zero. Individual rollups are aggregated only from rows that the
export actually contains; the adapter never synthesizes missing per-rollup
rows.

The result is unavailable when either window has no contributing rows or when
combined-range daily coverage is incomplete. It is never valid with a
partially observed requested boundary.

## Adapter Interface

Create `src/adapters/eth_value_growthepie.ts` with:

```ts
export interface GrowThePieRentInput {
  cutoffDay: string;
  windowDays: 7 | 30 | 90;
  includeRollups: boolean;
}

export interface GrowThePieRentPeriod {
  l2Rent: number | null;
}

export interface GrowThePieRentRollup {
  name: string;
  current: GrowThePieRentPeriod;
  previous: GrowThePieRentPeriod;
}

export interface GrowThePieRentResult {
  status: "valid" | "stale" | "unavailable";
  cutoffDay: string;
  current: GrowThePieRentPeriod;
  previous: GrowThePieRentPeriod;
  rollups?: GrowThePieRentRollup[];
  asOf: string | null;
  stale: boolean;
  gaps: EthValueGap[];
}

export function fetchGrowThePieRent(
  input: GrowThePieRentInput,
  ctx: AdapterContext,
): Promise<GrowThePieRentResult>;
```

The adapter uses the existing `withCache` mechanism with a 30-minute TTL.
The cache key contains `cutoffDay`, `windowDays`, and `includeRollups`.
Concurrent identical calls share one request. A refresh failure may return a
previous cached result marked `stale` with a `source_stale` gap. A request
without usable cache returns `unavailable` and does not throw through the MCP
boundary.

Add `growthepie_schema_drift` to `EthValueGapCodeSchema`. Malformed relevant
rows, duplicates, incomplete requested-day coverage, and invalid aggregates
use this code. Network and HTTP failures use `source_access_gap`.

## Orchestration

`handleEthValueCapture` performs these steps:

1. Fetch Coin Metrics supply history.
2. Select `cutoffDay` from its latest boundary, retaining the existing
   current-day fallback when supply is unavailable.
3. Fetch Dune and GrowThePie with the identical cutoff, window length, and
   rollup-detail flag.
4. Pass all three source results to the pure snapshot assembler.

Dune and GrowThePie calls run concurrently after the cutoff is known.
GrowThePie is read-only, unauthenticated, and is allowed in both
`free_only` and `byok_allowed` modes.

## Source Selection

Source selection is field-specific and deterministic:

1. Use Dune L2 rent only when both its current and previous `l2Rent` values
   are finite and its cutoff matches the selected snapshot cutoff.
2. Otherwise use GrowThePie only when both its current and previous values
   are finite and its cutoff matches.
3. Otherwise report L2 rent as `null`.

The selected rent source supplies the complete `l2_rent_paid_eth` pair. The
assembler never takes one period from Dune and the other from GrowThePie.

Dune remains the only source for:

- `gross_l1_fees_eth`;
- `base_fee_burn_eth`;
- `blob_fee_burn_eth`;
- `priority_fee_eth`;
- `l2_calldata_fee_eth`;
- `l2_blob_fee_eth`;
- `l2_verification_fee_eth`.

When GrowThePie supplies rent, the three decomposition metrics stay `null`.
Rent is not added to burn or gross fees. The
`l2_rent_share_of_l1_fees` ratio is calculated only when the selected rent
pair and Dune gross-fee pair share the same cutoff.

When `include_rollups` is true, rollup output comes entirely from the selected
rent source:

- Dune-selected rollups retain all four existing fields.
- GrowThePie-selected rollups populate only `l1_rent_eth`; calldata, blob,
  and verification fields are null metrics.

No rollup row is merged across sources.

## Provenance and Gaps

When GrowThePie contributes, add:

- `growthepie:rent_paid_eth` to `sources`;
- a `source_status` entry with role `L2 rent paid to Ethereum`;
- `growthepie:stale_cache` to `stale_data` when its cached result is stale.

GrowThePie gaps are included when it is selected or when Dune cannot provide a
complete L2 rent pair. An optional GrowThePie failure does not degrade a
complete Dune L2 result.

Dune access gaps remain visible because GrowThePie does not replace Dune fee
coverage. Successful GrowThePie rent therefore improves the partial snapshot
without falsely making all value-capture metrics complete.

The existing `eth-value-capture-v1` methodology identifier remains unchanged
because the metric definition and window arithmetic do not change; only the
source fallback expands.

## Confidence

Keep the total confidence scale at 1.00 and split the existing L2 allocation:

- fresh complete Dune fee pair: `0.35`;
- fresh complete L2 rent pair from Dune or GrowThePie: `0.15`;
- fresh complete Dune L2 decomposition: `0.10`;
- fresh complete Coin Metrics net-issuance pair: `0.25`;
- fresh aligned consensus-issuance derivation: `0.15`.

A stale source can contribute visible metrics but earns no confidence weight.
A full Dune result retains the existing maximum confidence of 1.00.
GrowThePie-only rent can earn at most the `0.15` rent allocation.

## Failure Handling

- Network, non-2xx, and invalid JSON responses return `unavailable`.
- Malformed selected rows invalidate the response; they are not skipped into
  apparent validity.
- Duplicate selected rows invalidate the response.
- Missing combined-window calendar days invalidate the response.
- Non-finite or negative rent invalidates the response.
- Refresh failure with usable cached data returns `stale`.
- Adapter failures never expose URLs containing credentials because the
  endpoint requires no credentials and errors are mapped to bounded gaps.

## Tests

All production changes follow RED, GREEN, REFACTOR.

Adapter tests use literal API rows and cover:

- adjacent-window totals and sorted rollup totals;
- exclusion of USD and out-of-window rows;
- 7-, 30-, and 90-day boundary arithmetic;
- malformed, negative, duplicate, and incomplete-day responses;
- cache reuse, concurrent-request deduplication, stale fallback, and hard
  failure without cache;
- omission of rollups when `includeRollups` is false.

Assembler tests cover:

- fresh Dune rent taking precedence;
- GrowThePie fallback when Dune rent is unavailable;
- no current/previous cross-source mixing;
- GrowThePie rollups with null decomposition;
- source provenance, gaps, stale data, confidence, and ratios;
- no GrowThePie failure gap when a complete Dune rent pair is selected.

Server tests prove:

- `free_only` performs the unauthenticated GrowThePie request;
- Dune and GrowThePie receive the same Coin Metrics cutoff;
- the returned MCP snapshot exposes free L2 rent without activating a paid
  source.

The opt-in live suite checks the public export for a fresh 7-day current and
previous rent pair. Dune remains separately opt-in because it consumes
credits.

Required verification:

```bash
npm test
npm run typecheck
npm run build
```

