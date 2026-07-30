# ETH Value Capture MCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only `get_eth_value_capture` MCP tool that reports aligned 7/30/90-day Ethereum fee burn, execution tips, L2 rent, supply change, and derived consensus issuance with explicit source gaps and paid-query controls.

**Architecture:** Keep network and authentication behavior in Coin Metrics and Dune adapters, version the deterministic Dune SQL in a query module, keep all interval and metric arithmetic pure, and assemble a specialized validated snapshot in a tool module. The MCP server coordinates the two sources: Coin Metrics establishes a completed UTC-day cutoff, Dune executes at most once for that cutoff when explicitly authorized, and the domain layer rejects missing or misaligned evidence instead of substituting zero.

**Tech Stack:** Node.js 20+, TypeScript ESM, Zod, native `fetch`, existing `TTLCache`, Vitest, tsup, Model Context Protocol SDK, Coin Metrics Community API, Dune API.

## Global Constraints

- Implement from approved commit `40616d3` on branch `feat/eth-value-capture` in a separate linked worktree.
- Use `superpowers:using-git-worktrees` before Task 1. Do not edit implementation files in the design checkout.
- Do not push, open a pull request, or merge without a separate explicit approval.
- Default `paid_mode` is `free_only`; it must never submit a new Dune execution.
- Never log, persist, return, or interpolate `DUNE_API_KEY`.
- Use completed UTC-day half-open intervals:
  - current: `[cutoff - window, cutoff)`
  - previous: `[cutoff - 2 × window, cutoff - window)`
- Missing evidence is `null`, never zero.
- `gross_l1_fees = base_fee_burn + priority_fee + blob_fee_burn`.
- `total_burn = base_fee_burn + blob_fee_burn`.
- L2 rent is already contained in gross L1 fees and must not be added to burn.
- Derive `consensus_issuance = net_issuance + total_burn` only when both sources use identical boundaries.
- Keep pure domain modules free of network, environment, cache, filesystem, and clock access.
- Each task ends with its focused tests and a small commit. Run the full suite only after integration.

## File Map

| File | Single responsibility |
|---|---|
| `src/eth_value_capture/types.ts` | Public and internal Zod contracts for this feature |
| `src/eth_value_capture/metrics.ts` | Pure window, nullable arithmetic, fee identity, and ratio functions |
| `src/adapters/eth_supply_coinmetrics.ts` | Fetch and strictly normalize daily ETH supply boundaries |
| `src/queries/eth_value_capture.ts` | Generate validated, version-controlled Dune SQL |
| `src/adapters/eth_value_dune.ts` | Authorize, execute, poll, validate, cache, and sanitize Dune access |
| `src/tools/get_eth_value_capture.ts` | Combine normalized sources into the specialized snapshot |
| `src/env.ts` | Read the optional Dune credential |
| `src/server.ts` | Register the MCP surface and orchestrate source order |
| `tests/eth_value_capture/` | Pure domain and schema regressions |
| `tests/adapters/` | Source validation, caching, authorization, and redaction regressions |
| `tests/queries/` | SQL structure, partition, and injection-safety regressions |
| `tests/tools/` | Snapshot status, confidence, source, and gap regressions |
| `tests/live/` | Explicitly gated live-source smoke coverage |

---

### Task 0: Create the isolated implementation worktree

**Files:**

- Modify in design checkout: `.gitignore`
- Create via Git: `.worktrees/eth-value-capture/`

**Interfaces:**

- Consumes: clean `feat/v0.1-implementation` at the plan commit.
- Produces: linked worktree at `/Users/kjun/vault/01_Projects/onchain-pulse-mcp/.worktrees/eth-value-capture` on `feat/eth-value-capture`.

- [ ] Confirm the design checkout is a normal checkout, not already a linked worktree or submodule:

  ```bash
  cd /Users/kjun/vault/01_Projects/onchain-pulse-mcp
  git status --short
  git rev-parse --git-dir
  git rev-parse --git-common-dir
  git rev-parse --show-superproject-working-tree 2>/dev/null || true
  git branch --show-current
  ```

  Expected: clean status, `.git` for both Git paths, no superproject path, branch `feat/v0.1-implementation`.

- [ ] Add the project-local worktree directory to `.gitignore` with `apply_patch`:

  ```gitignore
  .worktrees/
  ```

- [ ] Verify the ignore rule and commit only that setup change:

  ```bash
  git check-ignore -v .worktrees/test
  git add .gitignore
  git commit -m "chore: ignore local worktrees"
  ```

  Expected: `git check-ignore` names the new `.gitignore` rule.

- [ ] Create the linked worktree using the native workspace facility if one is available. If none is available, use Git:

  ```bash
  git worktree add .worktrees/eth-value-capture -b feat/eth-value-capture
  cd /Users/kjun/vault/01_Projects/onchain-pulse-mcp/.worktrees/eth-value-capture
  ```

- [ ] Install dependencies and verify the inherited baseline:

  ```bash
  npm install
  npm test
  npm run typecheck
  npm run build
  ```

  Expected: all four commands pass before feature edits. If any baseline command fails, stop and report the exact failure rather than continuing.

---

### Task 1: Define the specialized contract and pure window arithmetic

**Files:**

- Create: `src/eth_value_capture/types.ts`
- Create: `src/eth_value_capture/metrics.ts`
- Create: `tests/eth_value_capture/types.test.ts`
- Create: `tests/eth_value_capture/metrics.test.ts`

**Interfaces:**

- Consumes:
  - `Lang` from `src/types.ts`.
  - finite `number | null` current and previous source values.
- Produces:
  - `GetEthValueCaptureInputSchema` and inferred input type.
  - `EthValueCaptureSnapshotSchema` and inferred response type.
  - `windowToDays(window): 7 | 30 | 90`.
  - `makeEthWindowMetric(current, previous): EthWindowMetric`.
  - `makeRatioMetric(currentNumerator, currentDenominator, previousNumerator, previousDenominator): EthRatioMetric`.
  - `deriveFeeMetrics(input): DerivedFeeMetrics`.

- [ ] Write schema tests first in `tests/eth_value_capture/types.test.ts`:

  ```ts
  import { describe, expect, it } from "vitest";
  import {
    EthValueCaptureSnapshotSchema,
    GetEthValueCaptureInputSchema,
  } from "../../src/eth_value_capture/types.js";

  describe("GetEthValueCaptureInputSchema", () => {
    it("applies conservative defaults", () => {
      expect(GetEthValueCaptureInputSchema.parse({})).toEqual({
        window: "30d",
        paid_mode: "free_only",
        include_rollups: false,
      });
    });

    it.each(["1d", "365d", "all"])("rejects unsupported window %s", (window) => {
      expect(() => GetEthValueCaptureInputSchema.parse({ window })).toThrow();
    });
  });

  describe("EthValueCaptureSnapshotSchema", () => {
    it("rejects NaN and unknown gap codes", () => {
      const candidate = makeValidSnapshotFixture();
      candidate.metrics.total_burn_eth.current = Number.NaN;
      expect(EthValueCaptureSnapshotSchema.safeParse(candidate).success).toBe(false);
    });
  });

  function nullEthMetric() {
    return {
      current: null,
      previous: null,
      delta: null,
      pct_change: null,
      unit: "ETH" as const,
    };
  }

  function makeValidSnapshotFixture() {
    return {
      summary: "ETH value-capture data is partially available.",
      window: "30d" as const,
      cutoff_day: "2026-07-29",
      as_of: "2026-07-29T00:00:00Z",
      status: "partial" as const,
      metrics: {
        gross_l1_fees_eth: nullEthMetric(),
        base_fee_burn_eth: nullEthMetric(),
        blob_fee_burn_eth: nullEthMetric(),
        priority_fee_eth: nullEthMetric(),
        total_burn_eth: nullEthMetric(),
        consensus_issuance_eth: nullEthMetric(),
        net_issuance_eth: nullEthMetric(),
        l2_rent_paid_eth: nullEthMetric(),
        l2_calldata_fee_eth: nullEthMetric(),
        l2_blob_fee_eth: nullEthMetric(),
        l2_verification_fee_eth: nullEthMetric(),
      },
      ratios: {
        blob_share_of_total_burn: {
          current: null, previous: null, delta: null, unit: "ratio" as const,
        },
        l2_rent_share_of_l1_fees: {
          current: null, previous: null, delta: null, unit: "ratio" as const,
        },
      },
      sources: [],
      source_status: [],
      stale_data: [],
      confidence: 0,
      capabilities: { byok_active: [], paid_sources_active: [] },
      gaps: [{ code: "partial_result" as const, detail: "No fee source." }],
      methodology_version: "eth-value-capture-v1" as const,
    };
  }
  ```

- [ ] Run the schema test to confirm the missing module failure:

  ```bash
  npx vitest run tests/eth_value_capture/types.test.ts
  ```

  Expected: FAIL because `src/eth_value_capture/types.ts` does not exist.

- [ ] Implement `src/eth_value_capture/types.ts` with Zod schemas as the runtime source of truth:

  ```ts
  import { z } from "zod";

  export const EthWindowSchema = z.enum(["7d", "30d", "90d"]);
  export type EthWindow = z.infer<typeof EthWindowSchema>;

  export const EthPaidModeSchema = z.enum(["free_only", "byok_allowed"]);
  export type EthPaidMode = z.infer<typeof EthPaidModeSchema>;

  export const GetEthValueCaptureInputSchema = z.object({
    window: EthWindowSchema.default("30d"),
    paid_mode: EthPaidModeSchema.default("free_only"),
    include_rollups: z.boolean().default(false),
  }).strict();
  export type GetEthValueCaptureInput = z.infer<typeof GetEthValueCaptureInputSchema>;

  const FiniteNullable = z.number().finite().nullable();

  export const EthWindowMetricSchema = z.object({
    current: FiniteNullable,
    previous: FiniteNullable,
    delta: FiniteNullable,
    pct_change: FiniteNullable,
    unit: z.literal("ETH"),
  });
  export type EthWindowMetric = z.infer<typeof EthWindowMetricSchema>;

  export const EthRatioMetricSchema = z.object({
    current: FiniteNullable,
    previous: FiniteNullable,
    delta: FiniteNullable,
    unit: z.literal("ratio"),
  });
  export type EthRatioMetric = z.infer<typeof EthRatioMetricSchema>;

  export const EthValueGapCodeSchema = z.enum([
    "source_access_gap",
    "source_stale",
    "dune_execution_failed",
    "dune_execution_timeout",
    "dune_schema_drift",
    "partial_result",
    "period_mismatch",
    "derivation_blocked",
  ]);
  ```

  Complete the file with the exact response schema from the approved design:
  `metrics`, `ratios`, optional `rollups`, `sources`, `source_status`,
  `stale_data`, `confidence`, `capabilities`, `gaps`, and literal
  `methodology_version: "eth-value-capture-v1"`. Use `.strict()` for the public input and top-level output schemas. Export inferred types for each reusable nested schema.

- [ ] Write pure arithmetic tests first in `tests/eth_value_capture/metrics.test.ts`:

  ```ts
  import { describe, expect, it } from "vitest";
  import {
    deriveFeeMetrics,
    makeEthWindowMetric,
    makeRatioMetric,
    windowToDays,
  } from "../../src/eth_value_capture/metrics.js";

  describe("window arithmetic", () => {
    it.each([
      ["7d", 7],
      ["30d", 30],
      ["90d", 90],
    ] as const)("maps %s to %i days", (window, days) => {
      expect(windowToDays(window)).toBe(days);
    });

    it("keeps missing values null and blocks percent change at zero", () => {
      expect(makeEthWindowMetric(null, 2)).toEqual({
        current: null, previous: 2, delta: null, pct_change: null, unit: "ETH",
      });
      expect(makeEthWindowMetric(3, 0).pct_change).toBeNull();
    });

    it("preserves negative net issuance", () => {
      expect(makeEthWindowMetric(-20, 10)).toMatchObject({
        delta: -30,
        pct_change: -3,
      });
    });
  });

  describe("fee derivation", () => {
    it("derives gross fees and burn without adding L2 rent", () => {
      const result = deriveFeeMetrics({
        baseFeeBurn: { current: 100, previous: 80 },
        blobFeeBurn: { current: 10, previous: 8 },
        priorityFee: { current: 20, previous: 15 },
        l2Rent: { current: 50, previous: 40 },
      });
      expect(result.grossL1Fees.current).toBe(130);
      expect(result.totalBurn.current).toBe(110);
      expect(result).not.toHaveProperty("totalValueCapture");
    });
  });

  describe("ratio derivation", () => {
    it("returns null when a denominator is zero or an input is absent", () => {
      expect(makeRatioMetric(2, 0, null, 4)).toEqual({
        current: null, previous: null, delta: null, unit: "ratio",
      });
    });
  });
  ```

- [ ] Run the arithmetic test to confirm the missing implementation failure:

  ```bash
  npx vitest run tests/eth_value_capture/metrics.test.ts
  ```

  Expected: FAIL because `metrics.ts` does not exist or has no exports.

- [ ] Implement the minimal pure functions in `src/eth_value_capture/metrics.ts`:

  ```ts
  import type {
    EthRatioMetric,
    EthWindow,
    EthWindowMetric,
  } from "./types.js";

  export interface PeriodPair {
    current: number | null;
    previous: number | null;
  }

  function finiteOrNull(value: number | null): number | null {
    return value !== null && Number.isFinite(value) ? value : null;
  }

  export function makeEthWindowMetric(current: number | null, previous: number | null): EthWindowMetric {
    const cleanCurrent = finiteOrNull(current);
    const cleanPrevious = finiteOrNull(previous);
    const comparable = cleanCurrent !== null && cleanPrevious !== null;
    return {
      current: cleanCurrent,
      previous: cleanPrevious,
      delta: comparable ? cleanCurrent - cleanPrevious : null,
      pct_change: comparable && cleanPrevious !== 0
        ? (cleanCurrent - cleanPrevious) / Math.abs(cleanPrevious)
        : null,
      unit: "ETH",
    };
  }
  ```

  Implement `windowToDays` as an exhaustive switch, `makeRatioMetric` with nonzero denominators, and `deriveFeeMetrics` by component-wise nullable addition. A derived sum is `null` if any required component is `null`.

- [ ] Run and commit:

  ```bash
  npx vitest run tests/eth_value_capture/types.test.ts tests/eth_value_capture/metrics.test.ts
  npm run typecheck
  git add src/eth_value_capture tests/eth_value_capture
  git commit -m "feat: define ETH value capture domain"
  ```

---

### Task 2: Implement strict Coin Metrics supply-boundary normalization

**Files:**

- Create: `src/adapters/eth_supply_coinmetrics.ts`
- Create: `tests/adapters/eth_supply_coinmetrics.test.ts`

**Interfaces:**

- Consumes:
  - `AdapterContext`.
  - `{ windowDays: 7 | 30 | 90; now: Date }`.
  - Coin Metrics Community API `SplyCur` rows.
- Produces:

  ```ts
  export interface EthSupplyPoint {
    boundary: string;
    supplyEth: number;
  }

  export interface CoinMetricsSupplyResult {
    status: "valid" | "stale" | "unavailable";
    points: EthSupplyPoint[];
    latestBoundary: string | null;
    asOf: string | null;
    stale: boolean;
    gaps: EthValueGap[];
  }

  export async function fetchEthSupplyHistory(
    input: { windowDays: 7 | 30 | 90; now: Date },
    ctx: AdapterContext,
  ): Promise<CoinMetricsSupplyResult>;

  export function computeSupplyDelta(
    points: EthSupplyPoint[],
    startBoundary: string,
    endBoundary: string,
  ): number | null;
  ```

- [ ] Add adapter tests with a reusable `makeContext` and mocked `fetch`:

  ```ts
  import { describe, expect, it, vi } from "vitest";
  import { makeContext } from "../../src/adapters/base.js";
  import {
    computeSupplyDelta,
    fetchEthSupplyHistory,
  } from "../../src/adapters/eth_supply_coinmetrics.js";

  const env = { byok: {}, lang: "en" as const, historyPath: "/tmp/history.json" };

  it("normalizes ordered decimal strings at exact UTC boundaries", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      data: [
        { asset: "eth", time: "2026-07-26T00:00:00.000000000Z", SplyCur: "120000000.25" },
        { asset: "eth", time: "2026-07-27T00:00:00.000000000Z", SplyCur: "120000001.75" },
      ],
    }), { status: 200 }));
    const result = await fetchEthSupplyHistory(
      { windowDays: 7, now: new Date("2026-07-29T12:00:00Z") },
      makeContext({ env, fetchImpl: fetchImpl as typeof fetch }),
    );
    expect(result.points[0]).toEqual({
      boundary: "2026-07-26",
      supplyEth: 120000000.25,
    });
    expect(result.latestBoundary).toBe("2026-07-27");
  });

  it("computes a signed delta only from exact boundary points", () => {
    const points = [
      { boundary: "2026-06-01", supplyEth: 120 },
      { boundary: "2026-06-08", supplyEth: 118 },
    ];
    expect(computeSupplyDelta(points, "2026-06-01", "2026-06-08")).toBe(-2);
    expect(computeSupplyDelta(points, "2026-06-02", "2026-06-08")).toBeNull();
  });
  ```

  Also cover:
  - duplicate timestamps,
  - non-midnight timestamp,
  - reversed and non-monotonic timestamps,
  - invalid decimal strings, `NaN`, and infinity,
  - missing `data`,
  - non-2xx response,
  - missing start or end boundary,
  - latest point lag of exactly two days is valid,
  - lag greater than two days is stale and contributes a `source_stale` gap,
  - request start includes `2 * windowDays + 4` days of boundary buffer,
  - cache deduplicates identical requests.

- [ ] Run the focused test and confirm it fails because the adapter is absent:

  ```bash
  npx vitest run tests/adapters/eth_supply_coinmetrics.test.ts
  ```

- [ ] Implement request construction using only native `URL` and `fetch`:

  ```ts
  const COIN_METRICS_URL =
    "https://community-api.coinmetrics.io/v4/timeseries/asset-metrics";
  const CACHE_SPEC = { name: "eth_supply_coinmetrics", ttlMs: 30 * 60_000, max: 16 };

  function toUtcDay(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  function latestCompletedBoundary(now: Date): string {
    return toUtcDay(now);
  }
  ```

  For a runtime instant on `2026-07-29`, midnight `2026-07-29T00:00:00Z` is the end boundary for the completed day ending at that instant. Query through that boundary and never include a point later than it.

  Build these exact parameters:

  ```text
  assets=eth
  metrics=SplyCur
  frequency=1d
  start_time=<cutoff minus (2 * windowDays + 4) days>
  end_time=<latest completed boundary>
  page_size=200
  paging_from=start
  ```

- [ ] Validate the response before numeric conversion:

  - top-level body is an object with a `data` array;
  - every row has `asset === "eth"`;
  - `time` is an ISO timestamp exactly at UTC midnight;
  - `SplyCur` is a base-10 decimal string matching `/^-?\d+(?:\.\d+)?$/`;
  - converted values are finite;
  - normalized `YYYY-MM-DD` boundaries are unique and strictly increasing.

  Do not sort malformed upstream data into apparent validity. Return
  `status: "unavailable"`, empty points, and a sanitized `source_access_gap`
  for an HTTP or schema failure. Do not include response bodies in gap text.

- [ ] Use the existing cache through:

  ```ts
  const cache = ctx.cacheFor<CoinMetricsSupplyResult>(CACHE_SPEC);
  return withCache(cache, `${windowDays}:${toUtcDay(now)}`, loader);
  ```

  Preserve the cached `asOf`; if stale fallback is used, mark `stale: true`,
  change status to `"stale"`, and append a `source_stale` gap.

- [ ] Run and commit:

  ```bash
  npx vitest run tests/adapters/eth_supply_coinmetrics.test.ts
  npm run typecheck
  git add src/adapters/eth_supply_coinmetrics.ts tests/adapters/eth_supply_coinmetrics.test.ts
  git commit -m "feat: add ETH supply boundary adapter"
  ```

---

### Task 3: Build deterministic, partition-bounded Dune SQL

**Files:**

- Create: `src/queries/eth_value_capture.ts`
- Create: `tests/queries/eth_value_capture.test.ts`

**Interfaces:**

- Consumes:

  ```ts
  {
    cutoffDay: string;
    windowDays: 7 | 30 | 90;
    includeRollups: boolean;
  }
  ```

- Produces:

  ```ts
  export interface EthValueCaptureQueryInput {
    cutoffDay: string;
    windowDays: 7 | 30 | 90;
    includeRollups: boolean;
  }

  export function buildEthValueCaptureSql(input: EthValueCaptureQueryInput): string;
  ```

  The query returns rows distinguished by `row_type`:

  ```ts
  type SummaryRow = {
    row_type: "summary";
    rollup: null;
    period: "current" | "previous";
    gross_l1_fees_eth: string | number | null;
    base_fee_burn_eth: string | number | null;
    blob_fee_burn_eth: string | number | null;
    priority_fee_eth: string | number | null;
    l2_rent_paid_eth: string | number | null;
    l2_calldata_fee_eth: string | number | null;
    l2_blob_fee_eth: string | number | null;
    l2_verification_fee_eth: string | number | null;
    base_component_present: boolean;
    blob_component_present: boolean;
    priority_component_present: boolean;
    l2_reconciled: boolean;
  };
  ```

  Rollup rows use `row_type: "rollup"` and a non-null `rollup`.

- [ ] Write query-string tests first:

  ```ts
  import { describe, expect, it } from "vitest";
  import { buildEthValueCaptureSql } from "../../src/queries/eth_value_capture.js";

  it("uses validated literals and both partition columns", () => {
    const sql = buildEthValueCaptureSql({
      cutoffDay: "2026-07-29",
      windowDays: 30,
      includeRollups: false,
    });
    expect(sql).toContain("blockchain = 'ethereum'");
    expect(sql).toContain("block_month >=");
    expect(sql).toContain("block_date >=");
    expect(sql).toContain("DATE '2026-07-29'");
    expect(sql).not.toContain("CURRENT_DATE");
    expect(sql).not.toContain("NOW()");
  });

  it("does not emit rollup rows unless requested", () => {
    const without = buildEthValueCaptureSql({
      cutoffDay: "2026-07-29", windowDays: 7, includeRollups: false,
    });
    const withRows = buildEthValueCaptureSql({
      cutoffDay: "2026-07-29", windowDays: 7, includeRollups: true,
    });
    expect(without).not.toContain("'rollup' AS row_type");
    expect(withRows).toContain("'rollup' AS row_type");
  });

  it.each(["2026-7-29", "2026-02-31", "2026-07-29' OR TRUE --", "not-a-date"])(
    "rejects unsafe cutoff %s",
    (cutoffDay) => {
      expect(() => buildEthValueCaptureSql({
        cutoffDay, windowDays: 30, includeRollups: false,
      })).toThrow("Invalid cutoffDay");
    },
  );
  ```

- [ ] Run and confirm the missing-module failure:

  ```bash
  npx vitest run tests/queries/eth_value_capture.test.ts
  ```

- [ ] Implement strict literal validation:

  ```ts
  const UTC_DAY = /^\d{4}-\d{2}-\d{2}$/;
  const ALLOWED_WINDOWS = new Set([7, 30, 90]);

  function assertQueryInput(input: EthValueCaptureQueryInput): void {
    const parsed = new Date(`${input.cutoffDay}T00:00:00Z`);
    if (!UTC_DAY.test(input.cutoffDay) ||
        Number.isNaN(parsed.valueOf()) ||
        parsed.toISOString().slice(0, 10) !== input.cutoffDay) {
      throw new Error("Invalid cutoffDay");
    }
    if (!ALLOWED_WINDOWS.has(input.windowDays)) {
      throw new Error("Invalid windowDays");
    }
  }
  ```

- [ ] Implement a single SQL statement with these CTEs and semantics:

  1. `bounds`: literal `cutoff_day`, `current_start`, and `previous_start`.
  2. `fee_rows`: `gas.fees` filtered by Ethereum, `block_month`,
     `block_date >= previous_start`, and `block_date < cutoff_day`.
  3. `fee_periods`: current/previous label and sums of the explicit map
     components.
  4. `l2_rows`: `rollup_economics_ethereum.l1_fees` with the same date range.
  5. `l2_periods`: summary totals, component totals, and reconciliation evidence.
  6. optional `rollup_periods` when `includeRollups` is true.
  7. final summary rows plus optional rollup rows with a stable common column list.

  The fee aggregation must retain component-presence evidence independently of
  numeric sums:

  ```sql
  COUNT_IF(element_at(tx_fee_breakdown, 'base_fee') IS NOT NULL)
    = COUNT(*) AS base_component_present,
  COUNT_IF(element_at(tx_fee_breakdown, 'blob_fee') IS NOT NULL)
    = COUNT(*) AS blob_component_present,
  COUNT_IF(element_at(tx_fee_breakdown, 'priority_fee') IS NOT NULL)
    = COUNT(*) AS priority_component_present
  ```

  If Dune represents non-blob transactions without a `blob_fee` key, the live
  validation in Task 8 may require narrowing the presence check to blob
  transactions. That is a durable source-contract change: stop, record observed
  columns and rows, update the design with an ADR, and only then change this
  rule. Do not silently coalesce absent map keys to zero.

  Gross L1 fees must be derived from the three validated components, not from a
  separate opaque total. Use `TRY_CAST(... AS DOUBLE)` only after presence
  evidence has been retained.

  Reconciliation is:

  ```sql
  ABS(
    SUM(l1_fee_native)
    - SUM(blob_fee_native + data_fee_native + verification_fee_native)
  ) <= 0.000000001
  ```

  If upstream nullability requires `COALESCE`, retain separate presence flags
  for each affected L2 component so the adapter can emit schema drift.

- [ ] Add assertions that the generated SQL contains all required output aliases, both period labels, no partial-day runtime functions, and one final statement:

  ```bash
  npx vitest run tests/queries/eth_value_capture.test.ts
  npm run typecheck
  git add src/queries/eth_value_capture.ts tests/queries/eth_value_capture.test.ts
  git commit -m "feat: add ETH value capture Dune query"
  ```

---

### Task 4: Implement the paid, cached Dune execution adapter

**Files:**

- Create: `src/adapters/eth_value_dune.ts`
- Create: `tests/adapters/eth_value_dune.test.ts`

**Interfaces:**

- Consumes:

  ```ts
  export interface DuneEthValueInput {
    cutoffDay: string;
    windowDays: 7 | 30 | 90;
    includeRollups: boolean;
    allowExecution: boolean;
  }
  ```

  `AdapterContext.env.byok.dune`, built SQL, and Dune API responses.

- Produces:

  ```ts
  export interface DunePeriodValues {
    grossL1Fees: number | null;
    baseFeeBurn: number | null;
    blobFeeBurn: number | null;
    priorityFee: number | null;
    l2Rent: number | null;
    l2CalldataFee: number | null;
    l2BlobFee: number | null;
    l2VerificationFee: number | null;
  }

  export interface DuneRollupValues {
    name: string;
    current: DunePeriodValues;
    previous: DunePeriodValues;
  }

  export interface DuneEthValueResult {
    status: "valid" | "stale" | "unavailable";
    cutoffDay: string;
    current: DunePeriodValues;
    previous: DunePeriodValues;
    rollups?: DuneRollupValues[];
    asOf: string | null;
    stale: boolean;
    executionId: string | null;
    gaps: EthValueGap[];
  }

  export async function fetchDuneEthValue(
    input: DuneEthValueInput,
    ctx: AdapterContext,
    options?: {
      pollIntervalMs?: number;
      timeoutMs?: number;
      now?: () => number;
      wait?: (ms: number) => Promise<void>;
    },
  ): Promise<DuneEthValueResult>;
  ```

- [ ] Write adapter tests first with queued mocked responses:

  ```ts
  import { describe, expect, it, vi } from "vitest";
  import { makeContext } from "../../src/adapters/base.js";
  import {
    fetchDuneEthValue,
    type DuneEthValueInput,
  } from "../../src/adapters/eth_value_dune.js";

  const validInput: DuneEthValueInput = {
    cutoffDay: "2026-07-29",
    windowDays: 7,
    includeRollups: false,
    allowExecution: true,
  };

  const validRows = ["current", "previous"].map((period, index) => ({
    row_type: "summary",
    rollup: null,
    period,
    gross_l1_fees_eth: index === 0 ? "130" : "103",
    base_fee_burn_eth: index === 0 ? "100" : "80",
    blob_fee_burn_eth: index === 0 ? "10" : "8",
    priority_fee_eth: index === 0 ? "20" : "15",
    l2_rent_paid_eth: index === 0 ? "50" : "40",
    l2_calldata_fee_eth: index === 0 ? "20" : "18",
    l2_blob_fee_eth: index === 0 ? "25" : "17",
    l2_verification_fee_eth: "5",
    base_component_present: true,
    blob_component_present: true,
    priority_component_present: true,
    l2_reconciled: true,
  }));

  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }

  function makeDuneContext(fetchImpl: ReturnType<typeof vi.fn>) {
    return makeContext({
      env: {
        byok: { dune: "test-dune-key" },
        lang: "en",
        historyPath: "/tmp/history.json",
      },
      fetchImpl: fetchImpl as typeof fetch,
    });
  }

  it("submits once, polls pending to completed, and parses both periods", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ execution_id: "exec-1" }))
      .mockResolvedValueOnce(jsonResponse({ state: "QUERY_STATE_PENDING" }))
      .mockResolvedValueOnce(jsonResponse({ state: "QUERY_STATE_COMPLETED" }))
      .mockResolvedValueOnce(jsonResponse({ result: { rows: validRows } }));

    const result = await fetchDuneEthValue(validInput, makeDuneContext(fetchImpl), {
      pollIntervalMs: 0,
      timeoutMs: 100,
      wait: async () => {},
    });

    expect(result.status).toBe("valid");
    expect(result.current.baseFeeBurn).toBe(100);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(fetchImpl.mock.calls.filter(([url]) =>
      String(url).endsWith("/api/v1/sql/execute"))).toHaveLength(1);
  });
  ```

  Cover all of the following as separate tests:

  - POST body includes `performance: "small"` and bundled SQL;
  - `X-DUNE-API-KEY` header is present but no other output contains its value;
  - completed response requires exactly one current and one previous summary row;
  - numeric strings and finite numbers are accepted;
  - missing required column, component-presence false, duplicate period, unknown
    row type, and L2 reconciliation false produce `dune_schema_drift` and null
    affected metrics;
  - rollup rows are grouped by name and omitted when not requested;
  - `QUERY_STATE_FAILED`, `QUERY_STATE_CANCELED`, and `QUERY_STATE_PARTIAL`
    return unavailable with `dune_execution_failed`;
  - timeout returns unavailable with `dune_execution_timeout` and exactly one
    POST;
  - concurrent identical calls share one POST;
  - different window, cutoff, or rollup flag gets a different cache key;
  - stale-cache fallback preserves the original `asOf` and sets `stale: true`;
  - missing key with `allowExecution: true` returns `source_access_gap`;
  - `allowExecution: false` with no cache performs zero HTTP calls;
  - `allowExecution: false` may read a fresh result populated by a prior
    authorized call in the same `AdapterContext`;
  - thrown errors and gap details never contain the API key, response body,
    request headers, or full SQL.

- [ ] Run and confirm failure because the adapter is absent:

  ```bash
  npx vitest run tests/adapters/eth_value_dune.test.ts
  ```

- [ ] Implement the endpoint flow with constants:

  ```ts
  const DUNE_API_BASE = "https://api.dune.com/api/v1";
  const CACHE_SPEC = { name: "eth_value_dune", ttlMs: 30 * 60_000, max: 32 };
  const DEFAULT_POLL_INTERVAL_MS = 1_000;
  const DEFAULT_TIMEOUT_MS = 25_000;
  ```

  Execution sequence:

  1. Compute cache key
     `${cutoffDay}:${windowDays}:${includeRollups ? "rollups" : "summary"}`.
  2. Return a fresh cache hit regardless of paid mode.
  3. If `allowExecution` is false, return a stale cache hit with its original
     `asOf`, `stale: true`, and `source_stale`; otherwise return an unavailable
     result without calling `getOrLoad`, because `getOrLoad` would start a paid
     loader on a cache miss.
  4. If `allowExecution` is true but the API key is absent, return an unavailable
     result with `source_access_gap`.
  5. Otherwise use `cache.getOrLoad(key, loader)` for in-flight deduplication.
  6. POST `/sql/execute` once.
  7. Poll `/execution/{id}/status` until completed, terminal failure, or timeout.
  8. GET `/execution/{id}/results` exactly once after completed status.
  9. Validate and normalize rows.
  10. On loader failure, use `cache.getStale(key)` once. Cache either the marked
      stale fallback or the normalized unavailable result as the fresh value for
      30 minutes so a later invocation does not automatically resubmit.

- [ ] Do not use the generic `withCache` helper for the authorization gate.
  Implement the gate explicitly so `free_only` cannot trigger a loader:

  ```ts
  const cache = ctx.cacheFor<DuneEthValueResult>(CACHE_SPEC);
  const fresh = cache.get(key);
  if (fresh) return fresh;
  const stale = cache.getStale(key);
  if (!input.allowExecution) {
    return stale ? markStale(stale) : unavailableAccessResult(input);
  }
  if (!ctx.env.byok.dune) return unavailableAccessResult(input);

  try {
    return await cache.getOrLoad(key, () => executeOnce(input, ctx, options));
  } catch (error) {
    const failureCode = toPublicDuneFailureCode(error);
    const fallback = stale
      ? markStale(stale, failureCode)
      : unavailableExecutionResult(input, failureCode);
    cache.set(key, fallback);
    return fallback;
  }
  ```

  `executeOnce` throws only a private sanitized error carrying one of
  `dune_execution_failed` or `dune_execution_timeout` for HTTP, terminal-state,
  and timeout failures. `fetchDuneEthValue` converts that private code to the
  public gap before caching the normalized result. The private error message is
  a constant and never contains upstream response text, headers, SQL, or the
  API key.

- [ ] Centralize outbound calls in a helper that returns sanitized failures:

  ```ts
  async function duneJson(
    ctx: AdapterContext,
    apiKey: string,
    path: string,
    init?: RequestInit,
  ): Promise<unknown>
  ```

  The helper may report only HTTP status and endpoint role. It must not include
  response text. Do not pass upstream exception messages into `gaps`.

- [ ] Normalize row values with a strict function:

  ```ts
  function finiteNumber(value: unknown): number | null {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value)) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }
  ```

  A zero numeric value is valid only when its column and component-presence
  evidence exist. Missing or invalid fields remain `null`.

- [ ] Run and commit:

  ```bash
  npx vitest run tests/adapters/eth_value_dune.test.ts
  npm run typecheck
  git add src/adapters/eth_value_dune.ts tests/adapters/eth_value_dune.test.ts
  git commit -m "feat: add controlled Dune ETH metrics adapter"
  ```

---

### Task 5: Assemble the snapshot and enforce alignment, gaps, and confidence

**Files:**

- Create: `src/tools/get_eth_value_capture.ts`
- Create: `tests/tools/get_eth_value_capture.test.ts`

**Interfaces:**

- Consumes:

  ```ts
  export interface GetEthValueCaptureArgs {
    window: EthWindow;
    lang: Lang;
    includeRollups: boolean;
    byokActive: string[];
    supply: CoinMetricsSupplyResult;
    dune: DuneEthValueResult;
    now: Date;
  }
  ```

- Produces:

  ```ts
  export function getEthValueCapture(
    args: GetEthValueCaptureArgs,
  ): EthValueCaptureSnapshot;
  ```

- [ ] Write the complete-path test first. Use a 7-day fixture with supply points
  at `2026-07-15`, `2026-07-22`, and `2026-07-29`:

  ```ts
  import { describe, expect, it } from "vitest";
  import type {
    CoinMetricsSupplyResult,
  } from "../../src/adapters/eth_supply_coinmetrics.js";
  import type {
    DuneEthValueResult,
    DunePeriodValues,
  } from "../../src/adapters/eth_value_dune.js";
  import { EthValueCaptureSnapshotSchema } from "../../src/eth_value_capture/types.js";
  import { getEthValueCapture } from "../../src/tools/get_eth_value_capture.js";

  function validSupply(
    overrides: Partial<CoinMetricsSupplyResult>,
  ): CoinMetricsSupplyResult {
    return {
      status: "valid",
      points: [],
      latestBoundary: "2026-07-29",
      asOf: "2026-07-29T00:00:00Z",
      stale: false,
      gaps: [],
      ...overrides,
    };
  }

  function feePeriod(input: {
    base: number;
    blob: number;
    priority: number;
    l2Rent: number;
  }): DunePeriodValues {
    return {
      grossL1Fees: input.base + input.blob + input.priority,
      baseFeeBurn: input.base,
      blobFeeBurn: input.blob,
      priorityFee: input.priority,
      l2Rent: input.l2Rent,
      l2CalldataFee: input.l2Rent / 4,
      l2BlobFee: input.l2Rent / 2,
      l2VerificationFee: input.l2Rent / 4,
    };
  }

  function validDune(
    overrides: Partial<DuneEthValueResult>,
  ): DuneEthValueResult {
    return {
      status: "valid",
      cutoffDay: "2026-07-29",
      current: feePeriod({ base: 10, blob: 2, priority: 3, l2Rent: 4 }),
      previous: feePeriod({ base: 8, blob: 1, priority: 2, l2Rent: 3 }),
      asOf: "2026-07-29T00:01:00Z",
      stale: false,
      executionId: "exec-1",
      gaps: [],
      ...overrides,
    };
  }

  it("assembles aligned current and previous windows", () => {
    const result = getEthValueCapture({
      window: "7d",
      lang: "en",
      includeRollups: false,
      byokActive: ["dune"],
      now: new Date("2026-07-29T12:00:00Z"),
      supply: validSupply({
        points: [
          { boundary: "2026-07-15", supplyEth: 1000 },
          { boundary: "2026-07-22", supplyEth: 1002 },
          { boundary: "2026-07-29", supplyEth: 1001 },
        ],
        latestBoundary: "2026-07-29",
      }),
      dune: validDune({
        cutoffDay: "2026-07-29",
        current: feePeriod({ base: 10, blob: 2, priority: 3, l2Rent: 4 }),
        previous: feePeriod({ base: 8, blob: 1, priority: 2, l2Rent: 3 }),
      }),
    });

    expect(result.status).toBe("complete");
    expect(result.metrics.net_issuance_eth).toMatchObject({
      current: -1,
      previous: 2,
    });
    expect(result.metrics.total_burn_eth.current).toBe(12);
    expect(result.metrics.consensus_issuance_eth.current).toBe(11);
    expect(result.ratios.blob_share_of_total_burn.current).toBeCloseTo(2 / 12);
    expect(result.confidence).toBe(1);
    expect(EthValueCaptureSnapshotSchema.parse(result)).toEqual(result);
  });
  ```

- [ ] Add tests for every failure and policy branch:

  - missing current supply boundary returns `net_issuance_eth.current = null`;
  - missing previous supply boundary does not interpolate;
  - stale supply metrics do not earn Coin Metrics confidence weight;
  - Dune cutoff and supply cutoff mismatch blocks consensus issuance and emits
    `period_mismatch` plus `derivation_blocked`;
  - valid net issuance remains independently available during Dune failure;
  - valid Dune fee and rent metrics remain available during Coin Metrics failure;
  - no valid core metric yields `status: "unavailable"` and confidence `0`;
  - one valid source yields `status: "partial"`;
  - all valid aligned inputs yield `status: "complete"`;
  - confidence weights are exactly 0.35, 0.25, 0.25, and 0.15 with no
    renormalization;
  - a Dune fee schema gap blocks the 0.35 fee weight but does not necessarily
    block a separately valid L2 0.25 weight;
  - rollup output exists only when `includeRollups` is true;
  - Korean and English summaries describe measurement availability without
    buy/sell/hold or price prediction language;
  - sources, source status, stale markers, capabilities, and gaps are deduplicated;
  - output validates through `EthValueCaptureSnapshotSchema`.

- [ ] Run and confirm the missing-module failure:

  ```bash
  npx vitest run tests/tools/get_eth_value_capture.test.ts
  ```

- [ ] Implement UTC boundary helpers in the pure module or tool module:

  ```ts
  function shiftUtcDay(day: string, amount: number): string {
    const date = new Date(`${day}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + amount);
    return date.toISOString().slice(0, 10);
  }
  ```

  Given `windowDays`, calculate:

  ```ts
  const currentEnd = cutoffDay;
  const currentStart = shiftUtcDay(cutoffDay, -windowDays);
  const previousStart = shiftUtcDay(cutoffDay, -2 * windowDays);
  ```

  Compute supply deltas strictly as:

  ```text
  current net issuance  = supply[currentEnd] - supply[currentStart]
  previous net issuance = supply[currentStart] - supply[previousStart]
  ```

- [ ] Build the response deterministically:

  - `cutoff_day` is the common cutoff when aligned, otherwise the valid source
    cutoff used for the independently returned metrics;
  - `as_of` is the latest non-null source `asOf` string; only a fully
    unavailable snapshot falls back to `args.now.toISOString()` so the required
    field still identifies when unavailability was observed;
  - `sources` contains canonical identifiers
    `coinmetrics-community:SplyCur`, `dune:gas.fees`, and
    `dune:rollup_economics_ethereum.l1_fees` only when each source contributes;
  - `source_status` always reports both configured source roles;
  - `capabilities.byok_active` is the deduplicated `args.byokActive` list and
    contains `"dune"` only when a key was configured;
  - `capabilities.paid_sources_active` contains `"dune"` only when the returned
    result came from an authorized execution or its cache;
  - `stale_data` uses stable identifiers such as
    `coinmetrics-community:stale` and `dune:stale_cache`;
  - gap details are stable, concise, and contain no upstream body or credentials.

- [ ] Apply confidence exactly:

  ```ts
  const confidence =
    (validDuneFeeCoverage ? 0.35 : 0) +
    (validDuneL2Coverage ? 0.25 : 0) +
    (validFreshSupplyCoverage ? 0.25 : 0) +
    (validAlignedConsensusDerivation ? 0.15 : 0);
  ```

  Round only the final confidence to avoid floating-point display artifacts.
  Do not round ETH measurements or ratios in the domain layer.

- [ ] Validate the assembled result before returning:

  ```ts
  return EthValueCaptureSnapshotSchema.parse(snapshot);
  ```

- [ ] Run and commit:

  ```bash
  npx vitest run tests/tools/get_eth_value_capture.test.ts
  npm run typecheck
  git add src/tools/get_eth_value_capture.ts tests/tools/get_eth_value_capture.test.ts
  git commit -m "feat: assemble ETH value capture snapshot"
  ```

---

### Task 6: Wire environment configuration and the MCP server

**Files:**

- Modify: `src/env.ts`
- Modify: `src/server.ts`
- Modify: `tests/env.test.ts`
- Modify: `tests/server.test.ts`

**Interfaces:**

- Consumes:
  - optional `DUNE_API_KEY`;
  - MCP arguments validated by `GetEthValueCaptureInputSchema`.
- Produces:
  - `EnvConfig.byok.dune?: string`;
  - eighth MCP tool named `get_eth_value_capture`;
  - handler result `EthValueCaptureSnapshot`.

- [ ] Add the failing env assertion:

  ```ts
  expect(loadEnv({ DUNE_API_KEY: "dune-secret" }).byok.dune).toBe("dune-secret");
  ```

- [ ] Add server contract assertions:

  ```ts
  it("registers get_eth_value_capture with conservative defaults", () => {
    const tool = listTools().find((item) => item.name === "get_eth_value_capture");
    expect(tool?.inputSchema.properties.window).toEqual({
      type: "string", enum: ["7d", "30d", "90d"], default: "30d",
    });
    expect(tool?.inputSchema.properties.paid_mode).toEqual({
      type: "string", enum: ["free_only", "byok_allowed"], default: "free_only",
    });
    expect(tool?.inputSchema.properties.include_rollups).toEqual({
      type: "boolean", default: false,
    });
  });
  ```

  Update the tool-name test description from seven to eight and add
  `get_eth_value_capture` to the exact list.

- [ ] Add server orchestration tests using a mocked `fetchImpl`:

  - default invocation reaches Coin Metrics but makes no Dune POST;
  - `byok_allowed` without `DUNE_API_KEY` makes no Dune POST and returns a
    partial response with `source_access_gap`;
  - `byok_allowed` with a key calls Coin Metrics first and submits one Dune query
    using the returned cutoff;
  - invalid `window`, `paid_mode`, unknown property, or non-boolean
    `include_rollups` returns the existing MCP error form;
  - returned JSON parses with `EthValueCaptureSnapshotSchema`.

  Export `HandlerContext` and `handleEthValueCapture` from `src/server.ts` for
  focused orchestration tests. Freeze the clock in each test:

  ```ts
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-29T12:00:00Z"));
  try {
    const output = await handleEthValueCapture({}, { env, ctx });
    expect(EthValueCaptureSnapshotSchema.parse(output)).toEqual(output);
  } finally {
    vi.useRealTimers();
  }
  ```

  Do not loosen the input schema to simplify tests.

- [ ] Run the focused tests and confirm failures:

  ```bash
  npx vitest run tests/env.test.ts tests/server.test.ts
  ```

- [ ] Add `dune?: string` to `BYOKKeys` and map `DUNE_API_KEY` in `loadEnv`.

- [ ] Update `src/server.ts`:

  ```ts
  import { fetchDuneEthValue } from "./adapters/eth_value_dune.js";
  import { fetchEthSupplyHistory } from "./adapters/eth_supply_coinmetrics.js";
  import {
    GetEthValueCaptureInputSchema,
    type EthValueCaptureSnapshot,
  } from "./eth_value_capture/types.js";
  import { windowToDays } from "./eth_value_capture/metrics.js";
  import { getEthValueCapture } from "./tools/get_eth_value_capture.js";
  ```

  Extend `ToolDef.handler` to:

  ```ts
  Promise<ToolResponse | ForensicsSnapshot | EthValueCaptureSnapshot>
  ```

  Change the existing internal interface declaration to:

  ```ts
  export interface HandlerContext {
    env: EnvConfig;
    ctx: AdapterContext;
  }
  ```

  Register:

  ```ts
  {
    name: "get_eth_value_capture",
    description:
      "Ethereum fee burn, execution tips, L2 rent, supply change, and aligned issuance over completed UTC-day windows.",
    inputSchema: {
      type: "object",
      properties: {
        window: { type: "string", enum: ["7d", "30d", "90d"], default: "30d" },
        paid_mode: {
          type: "string",
          enum: ["free_only", "byok_allowed"],
          default: "free_only",
        },
        include_rollups: { type: "boolean", default: false },
      },
    },
    handler: handleEthValueCapture,
  }
  ```

- [ ] Implement orchestration in this exact order:

  ```ts
  export async function handleEthValueCapture(
    raw: unknown,
    hc: HandlerContext,
  ): Promise<EthValueCaptureSnapshot> {
    const args = GetEthValueCaptureInputSchema.parse(raw ?? {});
    const windowDays = windowToDays(args.window);
    const now = new Date();
    const supply = await fetchEthSupplyHistory({ windowDays, now }, hc.ctx);
    const cutoffDay = supply.latestBoundary ?? now.toISOString().slice(0, 10);
    const dune = await fetchDuneEthValue({
      cutoffDay,
      windowDays,
      includeRollups: args.include_rollups,
      allowExecution: args.paid_mode === "byok_allowed",
    }, hc.ctx);

    return getEthValueCapture({
      window: args.window,
      lang: hc.env.lang,
      includeRollups: args.include_rollups,
      byokActive: hc.env.byok.dune ? ["dune"] : [],
      supply,
      dune,
      now,
    });
  }
  ```

  Do not parallelize the two source requests: the Dune query boundary depends on
  the validated Coin Metrics cutoff. If Coin Metrics is unavailable, the
  fallback cutoff is the current UTC midnight, representing the end of the most
  recently completed UTC day.

- [ ] Run and commit:

  ```bash
  npx vitest run tests/env.test.ts tests/server.test.ts
  npm run typecheck
  git add src/env.ts src/server.ts tests/env.test.ts tests/server.test.ts
  git commit -m "feat: expose ETH value capture MCP tool"
  ```

---

### Task 7: Document the contract, source cost, and module ownership

**Files:**

- Modify: `CONTEXT.md`
- Modify: `AGENTS.md`
- Modify: `README.md`
- Test: documentation commands and repository search

**Interfaces:**

- Consumes: the implemented public schema and actual environment behavior.
- Produces: user-facing usage, operator warnings, and maintainer ownership rules
  that match the code exactly.

- [ ] Update `CONTEXT.md` with a dedicated ETH value-capture section:

  - define gross fees, total burn, priority fee, net issuance, derived consensus
    issuance, and L2 rent;
  - state that priority fee excludes MEV and builder payments;
  - state the non-additivity/overlap invariants;
  - state exact half-open UTC intervals and `null` missingness;
  - state that the tool measures value-capture evidence and does not recommend a trade.

- [ ] Extend the `AGENTS.md` responsibility table with:

  | Module | Responsibility | Location |
  |---|---|---|
  | ETH Value Capture Domain | Window arithmetic, definitions, ratios, output schema | `src/eth_value_capture/` |
  | ETH Value Sources | Coin Metrics supply and controlled Dune fee/rent access | `src/adapters/eth_supply_coinmetrics.ts`, `src/adapters/eth_value_dune.ts` |
  | Versioned Queries | Deterministic partition-bounded Dune SQL | `src/queries/` |

  Add a feature rule: new value-capture metrics must declare overlap and
  derivation boundaries; missing components must remain `null`.

- [ ] Add to `README.md`:

  - `get_eth_value_capture` in the tool list;
  - argument table with defaults;
  - one `free_only` invocation and a partial Coin Metrics-only response excerpt;
  - one `byok_allowed` invocation;
  - `DUNE_API_KEY` in the BYOK environment table;
  - a prominent note that Dune direct SQL consumes the user's credits;
  - 30-minute in-process cache semantics;
  - definitions and overlap caveats;
  - live-test command from Task 8;
  - deferred collateral, price, RPC, and Beacon work.

- [ ] Check documentation for forbidden claims and stale tool counts:

  ```bash
  rg -n "buy|sell|hold|investment recommendation|seven expected tools" README.md CONTEXT.md AGENTS.md
  rg -n "get_eth_value_capture|DUNE_API_KEY|free_only|byok_allowed|L2 rent" README.md CONTEXT.md AGENTS.md
  ```

  Expected: the first search finds no prescriptive new wording or stale count;
  the second confirms the contract is documented in all three files.

- [ ] Run focused public-contract tests and commit:

  ```bash
  npx vitest run tests/env.test.ts tests/server.test.ts tests/eth_value_capture/types.test.ts
  git diff --check
  git add README.md CONTEXT.md AGENTS.md
  git commit -m "docs: explain ETH value capture tool"
  ```

---

### Task 8: Add opt-in live smoke coverage and complete verification

**Files:**

- Create: `tests/live/eth_value_capture.live.test.ts`
- Modify: `package.json`
- Modify only if live evidence requires a reviewed contract correction:
  `docs/adr/<date>-eth-value-dune-schema.md`, approved design, query/parser tests,
  and implementation.

**Interfaces:**

- Consumes:
  - live Coin Metrics Community API;
  - optional operator-provided `DUNE_API_KEY`;
  - `RUN_LIVE_ETH_VALUE=1`.
- Produces:
  - reviewed live source evidence;
  - deterministic default suite unaffected by network availability.

- [ ] Add the opt-in package script:

  ```json
  "test:live:eth-value": "RUN_LIVE_ETH_VALUE=1 vitest run tests/live/eth_value_capture.live.test.ts"
  ```

- [ ] Create the live test with a hard environment gate:

  ```ts
  import { describe, expect, it } from "vitest";
  import { makeContext } from "../../src/adapters/base.js";
  import { fetchEthSupplyHistory } from "../../src/adapters/eth_supply_coinmetrics.js";
  import { fetchDuneEthValue } from "../../src/adapters/eth_value_dune.js";
  import { loadEnv } from "../../src/env.js";

  const runLive = process.env.RUN_LIVE_ETH_VALUE === "1";

  describe.skipIf(!runLive)("ETH value capture live sources", () => {
    it("reads fresh exact ETH supply boundaries from Coin Metrics", async () => {
      const result = await fetchEthSupplyHistory(
        { windowDays: 7, now: new Date() },
        makeContext({ env: loadEnv(process.env) }),
      );
      expect(result.status).not.toBe("unavailable");
      expect(result.latestBoundary).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(result.points.length).toBeGreaterThanOrEqual(15);
    }, 30_000);

    it.skipIf(!process.env.DUNE_API_KEY)(
      "executes one reviewed Dune summary query",
      async () => {
        const env = loadEnv(process.env);
        const ctx = makeContext({ env });
        const supply = await fetchEthSupplyHistory(
          { windowDays: 7, now: new Date() },
          ctx,
        );
        expect(supply.latestBoundary).not.toBeNull();

        const result = await fetchDuneEthValue({
          cutoffDay: supply.latestBoundary!,
          windowDays: 7,
          includeRollups: false,
          allowExecution: true,
        }, ctx, { timeoutMs: 90_000 });

        expect(result.status).toBe("valid");
        expect(result.current.baseFeeBurn).not.toBeNull();
        expect(result.previous.baseFeeBurn).not.toBeNull();
        expect(JSON.stringify(result)).not.toContain(process.env.DUNE_API_KEY!);
      },
      120_000,
    );
  });
  ```

  The Dune live test must assert:
  - status is valid;
  - both period rows exist;
  - component values are finite and nonnegative;
  - gross fee identity and burn identity hold within `1e-9 ETH`;
  - L2 components reconcile within `1e-9 ETH`;
  - no API key appears in serialized output.

- [ ] Confirm the default deterministic suite skips live network access:

  ```bash
  npm test
  ```

  Expected: live tests are reported skipped and no network key is required.

- [ ] Run the free live smoke and capture the actual returned boundary and
  freshness in the handoff:

  ```bash
  npm run test:live:eth-value
  ```

  Expected without `DUNE_API_KEY`: Coin Metrics live test passes and Dune live
  test is skipped.

- [ ] If a Dune key is present and paid execution was explicitly authorized for
  this implementation run, execute the same command once with the key already
  present in the environment. Do not print or echo the key.

  If no key or paid authorization is available, report Dune live validation as
  not run; deterministic mocked adapter coverage remains required.

- [ ] If live Dune columns or component-map semantics differ from the approved
  contract, stop implementation and document:

  - execution ID;
  - observed column names and non-secret sample types;
  - affected invariant;
  - proposed parser/query change.

  Create a focused ADR and amend the approved design before changing code.
  Never weaken a component-presence or reconciliation test silently.

- [ ] Run the final verification matrix:

  ```bash
  npm test
  npm run typecheck
  npm run build
  git diff --check
  git status --short
  ```

  Expected: all deterministic tests pass, typecheck and build pass, no
  whitespace errors, and the worktree is clean after the final commit.

- [ ] Commit live coverage and any package-script change:

  ```bash
  git add package.json tests/live/eth_value_capture.live.test.ts
  git commit -m "test: add ETH value capture live smoke"
  ```

- [ ] Re-run the final verification against the resulting commit and record:

  ```bash
  git rev-parse HEAD
  git status --short
  npm test
  npm run typecheck
  npm run build
  ```

  Handoff must report the exact commit SHA, test counts, live-source scope,
  whether Dune was actually executed, and that nothing was pushed.

---

## Completion Checklist

- [ ] `get_eth_value_capture` is the eighth registered MCP tool.
- [ ] Defaults are `30d`, `free_only`, and `include_rollups=false`.
- [ ] Free mode is proven not to submit Dune work.
- [ ] Dune authorization, one-execution caching, timeout, and redaction are tested.
- [ ] Supply deltas use exact Coin Metrics UTC boundary points without interpolation.
- [ ] Current and previous periods are equal, non-overlapping, and exclude partial days.
- [ ] Gross fee, burn, ratio, and aligned consensus issuance identities are tested.
- [ ] L2 rent overlap is documented and no synthetic total exists.
- [ ] Missing, stale, mismatched, and schema-drift evidence remains explicit.
- [ ] Confidence reflects fixed source coverage weights without renormalization.
- [ ] Korean and English summaries remain descriptive and non-prescriptive.
- [ ] Coin Metrics live smoke is reviewed.
- [ ] Dune live smoke is either reviewed with explicit authorization or reported not run.
- [ ] `npm test`, `npm run typecheck`, and `npm run build` pass at the final SHA.
- [ ] Work occurred only in the linked worktree after setup.
- [ ] No remote write occurred.
