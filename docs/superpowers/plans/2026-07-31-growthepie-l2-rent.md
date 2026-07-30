# GrowThePie L2 Rent Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a free, cached GrowThePie fallback that supplies aligned current and previous L2 rent totals and optional rollup totals to `get_eth_value_capture`.

**Architecture:** A dedicated adapter validates and aggregates `rent_paid_eth` export rows against the Coin Metrics cutoff. The pure snapshot assembler selects one complete rent pair from Dune or GrowThePie without mixing periods or fee components. The server fetches Dune and GrowThePie concurrently after resolving the cutoff and preserves explicit provenance, freshness, gaps, and paid-source boundaries.

**Tech Stack:** Node.js 20+, TypeScript ESM, native `fetch`, existing `TTLCache`/`withCache`, Zod, Vitest, tsup, Model Context Protocol SDK, GrowThePie public API.

## Global Constraints

- The server remains read-only and non-prescriptive; no buy, sell, hold, or forecast language.
- Use `https://api.growthepie.com/v1/export/rent_paid.json`; no credentials or new environment variables.
- Only `metric_key === "rent_paid_eth"` contributes; `rent_paid_usd` and other metrics are ignored.
- Current and previous windows are half-open completed UTC days derived from the same exclusive `cutoffDay`.
- Missing, malformed, duplicate, negative, non-finite, or incomplete requested data remains unavailable; never substitute zero.
- A rent pair comes entirely from Dune or entirely from GrowThePie; never mix sources across periods.
- GrowThePie does not populate L1 fee metrics or L2 calldata/blob/verification decomposition.
- L2 rent remains a subset of gross L1 fees and must not be added to burn or gross fees.
- Dune remains preferred when both current and previous Dune rent values are finite and boundary-aligned.
- BYOK keys remain environment-only and must never enter URLs, cache keys, snapshots, logs, or errors.
- New behavior follows strict RED → GREEN → REFACTOR with literal, behavior-level assertions.
- Required final verification is `npm test`, `npm run typecheck`, and `npm run build`.

---

### Task 1: Add the strict cached GrowThePie rent adapter

**Files:**
- Create: `src/adapters/eth_value_growthepie.ts`
- Create: `tests/adapters/eth_value_growthepie.test.ts`
- Modify: `src/eth_value_capture/types.ts`
- Modify: `tests/eth_value_capture/types.test.ts`

**Interfaces:**
- Consumes: `AdapterContext`, `withCache`, `shiftUtcDay`, and `EthValueGap`.
- Produces:

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

- Extends `EthValueGapCodeSchema` with the literal
  `"growthepie_schema_drift"`.

- [ ] **Step 1: Add the failing gap-schema regression**

Append a test in `tests/eth_value_capture/types.test.ts` that constructs the
smallest otherwise-valid snapshot fixture already used in that file, adds:

```ts
gaps: [{
  code: "growthepie_schema_drift",
  detail: "GrowThePie rent rows were incomplete.",
}]
```

and asserts `EthValueCaptureSnapshotSchema.parse(candidate)` succeeds. Do not
weaken the strict object schemas.

- [ ] **Step 2: Run the schema test and verify RED**

Run:

```bash
npx vitest run tests/eth_value_capture/types.test.ts
```

Expected: FAIL because `"growthepie_schema_drift"` is not accepted by
`EthValueGapCodeSchema`.

- [ ] **Step 3: Add the new gap code and verify GREEN**

Add the literal to the existing enum in `src/eth_value_capture/types.ts`, then
rerun:

```bash
npx vitest run tests/eth_value_capture/types.test.ts
```

Expected: PASS.

- [ ] **Step 4: Write adapter RED tests for valid aggregation**

Create `tests/adapters/eth_value_growthepie.test.ts`. Use
`makeContext({ env: loadEnv({}), fetchImpl })` and assert on the real adapter
result, not on mock existence.

Define a test-only input-row builder that generates ISO dates and literal
constant values; expected totals remain hand-derived literals:

```ts
function dailyRows(startDay: string, days: number, origin: string, value: number) {
  return Array.from({ length: days }, (_, index) => ({
    metric_key: "rent_paid_eth",
    origin_key: origin,
    date: shiftUtcDay(startDay, index),
    value,
  }));
}
```

The first RED test uses cutoff `2026-07-31`, window `7`, and two origins:

```ts
const rows = [
  ...dailyRows("2026-07-17", 14, "arbitrum", 1),
  ...dailyRows("2026-07-17", 14, "base", 2),
  {
    metric_key: "rent_paid_usd",
    origin_key: "base",
    date: "2026-07-30",
    value: 999,
  },
  {
    metric_key: "rent_paid_eth",
    origin_key: "base",
    date: "2026-07-31",
    value: 1000,
  },
];
```

Assert:

```ts
expect(result.status).toBe("valid");
expect(result.current.l2Rent).toBe(21);
expect(result.previous.l2Rent).toBe(21);
expect(result.asOf).toBe("2026-07-30T00:00:00Z");
expect(result.rollups).toEqual([
  {
    name: "arbitrum",
    current: { l2Rent: 7 },
    previous: { l2Rent: 7 },
  },
  {
    name: "base",
    current: { l2Rent: 14 },
    previous: { l2Rent: 14 },
  },
]);
```

Add table cases for 30 and 90 days with one row of value `1` per day and
literal expected pairs `{ current: 30, previous: 30 }` and
`{ current: 90, previous: 90 }`. Add a separate assertion that
`includeRollups: false` omits the `rollups` property.

- [ ] **Step 5: Run valid adapter tests and verify RED**

Run:

```bash
npx vitest run tests/adapters/eth_value_growthepie.test.ts
```

Expected: FAIL because the adapter module does not exist.

- [ ] **Step 6: Implement the minimal valid adapter path**

Create `src/adapters/eth_value_growthepie.ts` with:

```ts
const GROW_THE_PIE_RENT_URL =
  "https://api.growthepie.com/v1/export/rent_paid.json";
const CACHE_SPEC = {
  name: "eth_value_growthepie",
  ttlMs: 30 * 60_000,
  max: 32,
};
const DAY = /^\d{4}-\d{2}-\d{2}$/;
```

Implement pure internal helpers that:

1. require the top-level body to be an array;
2. require every item to be a non-null object with a string `metric_key`;
3. ignore rows whose `metric_key !== "rent_paid_eth"`;
4. validate selected `origin_key`, canonical `date`, and finite non-negative
   numeric `value`;
5. reject duplicate `(origin_key, date)` pairs;
6. filter the combined range
   `[shiftUtcDay(cutoffDay, -2 * windowDays), cutoffDay)`;
7. verify that every calendar date in the combined range has at least one
   selected row;
8. sum current and previous totals;
9. sort rollups by `name` and include only origins with at least one row in
   both periods;
10. set `asOf` to the last included day at `T00:00:00Z`.

Guard every aggregate with `Number.isFinite` and non-negative checks.

Wrap the loader with:

```ts
withCache(
  ctx.cacheFor<GrowThePieRentResult>(CACHE_SPEC),
  `${input.cutoffDay}:${input.windowDays}:${input.includeRollups}`,
  async () => {
    const response = await ctx.fetch(GROW_THE_PIE_RENT_URL);
    if (!response.ok) throw new Error("growthepie_http_failure");
    return parseResponse(await response.json(), input);
  },
)
```

Map parse failures to:

```ts
{
  code: "growthepie_schema_drift",
  detail: "GrowThePie rent rows did not satisfy the requested UTC windows.",
}
```

Map network, HTTP, and JSON failures to:

```ts
{
  code: "source_access_gap",
  detail: "GrowThePie L2 rent response was unavailable.",
}
```

- [ ] **Step 7: Verify the valid adapter path is GREEN**

Run:

```bash
npx vitest run tests/adapters/eth_value_growthepie.test.ts tests/eth_value_capture/types.test.ts
```

Expected: PASS.

- [ ] **Step 8: Add RED tests for invalid evidence and cache behavior**

Add separate behavior tests covering:

- negative selected value;
- `NaN`, `Infinity`, numeric string, empty origin, and noncanonical date;
- duplicate selected `(origin_key, date)`;
- one wholly missing calendar date in the combined range;
- current or previous window with no contributing rows;
- malformed top-level body and malformed selected row;
- non-2xx and thrown fetch without cache;
- identical concurrent calls invoke the fetch implementation once;
- identical fresh calls reuse one cached response;
- after advancing fake time past 30 minutes, refresh failure returns the
  previous result with `status: "stale"`, `stale: true`, and one
  `source_stale` gap.

For every malformed or incomplete-row case assert:

```ts
expect(result.status).toBe("unavailable");
expect(result.current.l2Rent).toBeNull();
expect(result.previous.l2Rent).toBeNull();
expect(result.gaps.map((gap) => gap.code))
  .toContain("growthepie_schema_drift");
```

For hard transport failure assert the gap code is `source_access_gap`.

- [ ] **Step 9: Run the new tests and verify RED**

Run:

```bash
npx vitest run tests/adapters/eth_value_growthepie.test.ts
```

Expected: at least the stale-status or strict-validation cases FAIL against
the minimal valid implementation.

- [ ] **Step 10: Implement strict failure and stale-cache handling**

Add bounded `unavailable`, `schemaDrift`, and `markStale` helpers. When
`withCache` returns a result with `stale: true`, convert status to `stale` and
append exactly one `source_stale` gap:

```ts
{
  code: "source_stale",
  detail: "GrowThePie refresh failed; cached L2 rent data was used.",
}
```

Do not return raw exception text or response bodies.

- [ ] **Step 11: Verify Task 1**

Run:

```bash
npx vitest run tests/adapters/eth_value_growthepie.test.ts tests/eth_value_capture/types.test.ts
npm run typecheck
```

Expected: PASS with no warnings or type errors.

- [ ] **Step 12: Commit Task 1**

```bash
git add src/adapters/eth_value_growthepie.ts \
  src/eth_value_capture/types.ts \
  tests/adapters/eth_value_growthepie.test.ts \
  tests/eth_value_capture/types.test.ts
git commit -m "feat: add GrowThePie L2 rent adapter"
```

---

### Task 2: Select one complete L2 rent source in the snapshot assembler

**Files:**
- Modify: `src/tools/get_eth_value_capture.ts`
- Modify: `tests/tools/get_eth_value_capture.test.ts`

**Interfaces:**
- Consumes: `GrowThePieRentResult` from Task 1 and the existing
  `CoinMetricsSupplyResult` and `DuneEthValueResult`.
- Changes `GetEthValueCaptureArgs` to require:

```ts
growthepie: GrowThePieRentResult;
```

- Produces the existing `EthValueCaptureSnapshot` schema and methodology
  version without adding public metric fields.

- [ ] **Step 1: Add literal GrowThePie result fixtures**

In `tests/tools/get_eth_value_capture.test.ts`, add:

```ts
function validGrowThePie(
  overrides: Partial<GrowThePieRentResult> = {},
): GrowThePieRentResult {
  return {
    status: "valid",
    cutoffDay: "2026-07-29",
    current: { l2Rent: 5 },
    previous: { l2Rent: 4 },
    asOf: "2026-07-28T00:00:00Z",
    stale: false,
    gaps: [],
    ...overrides,
  };
}

function unavailableGrowThePie(): GrowThePieRentResult {
  return {
    status: "unavailable",
    cutoffDay: "2026-07-29",
    current: { l2Rent: null },
    previous: { l2Rent: null },
    asOf: null,
    stale: false,
    gaps: [{
      code: "source_access_gap",
      detail: "GrowThePie L2 rent response was unavailable.",
    }],
  };
}
```

Update the existing assembly helper to provide `validGrowThePie()` by
default.

- [ ] **Step 2: Write source-precedence RED tests**

Add tests with hand-derived expected values:

1. Complete Dune `{ current: 4, previous: 3 }` wins over GrowThePie
   `{ current: 5, previous: 4 }`.
2. Dune rent with either current or previous `null` falls back to the complete
   GrowThePie pair `{ 5, 4 }`; it never emits one Dune period and one
   GrowThePie period.
3. Stale-but-usable complete Dune still wins according to source precedence,
   but earns no fresh confidence.
4. GrowThePie cutoff mismatch makes rent unavailable and adds
   `period_mismatch`.
5. A complete Dune rent pair suppresses optional GrowThePie failure gaps.
6. When Dune rent is incomplete, GrowThePie failure gaps remain visible.

Assert the selected source through both metric values and `sources`.

- [ ] **Step 3: Run assembler tests and verify RED**

Run:

```bash
npx vitest run tests/tools/get_eth_value_capture.test.ts
```

Expected: FAIL because `GetEthValueCaptureArgs` has no GrowThePie source and
the assembler only reads Dune rent.

- [ ] **Step 4: Implement pair-level source selection**

Import the Task 1 types and add helpers equivalent to:

```ts
function completePair(
  current: number | null,
  previous: number | null,
): boolean {
  return current !== null && previous !== null;
}

type RentSource = "dune" | "growthepie" | null;
```

Select Dune only when its status is usable, both rent values are non-null, and
its cutoff matches the chosen snapshot boundary. Otherwise select
GrowThePie only when its status is usable, both values are non-null, and its
cutoff matches. Return `{ current: null, previous: null }` when neither pair
qualifies.

Keep Dune fee and decomposition selection unchanged. Rename the existing
generic `aligned` variable to distinguish Coin Metrics/Dune issuance
alignment from rent-source alignment.

- [ ] **Step 5: Verify precedence tests are GREEN**

Run:

```bash
npx vitest run tests/tools/get_eth_value_capture.test.ts
```

Expected: source-precedence tests PASS; rollup/confidence tests added next may
still be absent.

- [ ] **Step 6: Write rollup, provenance, ratio, and confidence RED tests**

Add tests asserting:

- GrowThePie rollups populate `l1_rent_eth` and all three decomposition
  metrics are null window metrics;
- Dune-selected rollups remain unchanged and no GrowThePie rollup is merged;
- `includeRollups: false` still omits the public `rollups` property;
- GrowThePie contribution adds source `growthepie:rent_paid_eth`;
- source status role is exactly `L2 rent paid to Ethereum`;
- stale selected GrowThePie adds `growthepie:stale_cache`;
- Dune gross fees `15` and aligned GrowThePie rent `5` produce ratio `1 / 3`;
- misaligned boundaries produce a null rent ratio;
- fresh fees `0.35`, fresh GrowThePie rent `0.15`, fresh supply `0.25`, and
  aligned consensus derivation `0.15` yield confidence `0.90`;
- full fresh Dune fee, rent, decomposition, supply, and consensus evidence
  remains confidence `1.00`;
- fresh GrowThePie rent with no Dune fee and fresh supply yields confidence
  `0.40`.

- [ ] **Step 7: Run new assembler tests and verify RED**

Run:

```bash
npx vitest run tests/tools/get_eth_value_capture.test.ts
```

Expected: FAIL on GrowThePie rollup/provenance or the split confidence weights.

- [ ] **Step 8: Implement source-specific rollups and confidence**

Split coverage into:

```ts
const l2RentCoverage = hasAll([
  metrics.l2_rent_paid_eth.current,
  metrics.l2_rent_paid_eth.previous,
]);
const l2BreakdownCoverage = hasAll([
  metrics.l2_calldata_fee_eth.current,
  metrics.l2_calldata_fee_eth.previous,
  metrics.l2_blob_fee_eth.current,
  metrics.l2_blob_fee_eth.previous,
  metrics.l2_verification_fee_eth.current,
  metrics.l2_verification_fee_eth.previous,
]);
```

Apply exact weights:

```ts
const confidence =
  (freshDune && feeCoverage ? 0.35 : 0) +
  (freshSelectedRent && l2RentCoverage ? 0.15 : 0) +
  (freshDune && l2BreakdownCoverage ? 0.10 : 0) +
  (freshSupply && supplyCoverage ? 0.25 : 0) +
  (freshDune && freshSupply && issuanceAligned && consensusCoverage ? 0.15 : 0);
```

Build `sources`, `source_status`, `stale_data`, and `rollups` from the selected
rent source. Include GrowThePie gaps only when it is selected or when Dune
does not provide a complete rent pair. Deduplicate gaps with the existing
helper.

- [ ] **Step 9: Verify Task 2**

Run:

```bash
npx vitest run tests/tools/get_eth_value_capture.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 10: Commit Task 2**

```bash
git add src/tools/get_eth_value_capture.ts \
  tests/tools/get_eth_value_capture.test.ts
git commit -m "feat: add free L2 rent fallback selection"
```

---

### Task 3: Wire the free source through the MCP server and documentation

**Files:**
- Modify: `src/server.ts`
- Modify: `tests/server.test.ts`
- Modify: `tests/live/eth_value_capture.live.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: `fetchGrowThePieRent` and the updated
  `getEthValueCapture({ growthepie, ... })`.
- Preserves the existing public MCP input schema.
- Produces free L2 rent in `get_eth_value_capture` without adding a paid
  capability.

- [ ] **Step 1: Write server orchestration RED tests**

In `tests/server.test.ts`, add a fetch router that returns:

- exact Coin Metrics boundary rows ending at `2026-07-29`;
- a full 14-day GrowThePie `rent_paid_eth` array for a 7-day request;
- no Dune HTTP response in `free_only`.

Call the exported `handleEthValueCapture` with:

```ts
{
  window: "7d",
  paid_mode: "free_only",
  include_rollups: true,
}
```

Assert:

```ts
expect(snapshot.metrics.l2_rent_paid_eth.current).toBe(7);
expect(snapshot.metrics.l2_rent_paid_eth.previous).toBe(7);
expect(snapshot.sources).toContain("growthepie:rent_paid_eth");
expect(snapshot.capabilities.paid_sources_active).toEqual([]);
expect(requestedUrls).toContain(
  "https://api.growthepie.com/v1/export/rent_paid.json",
);
expect(requestedUrls.some((url) => url.startsWith("https://api.dune.com/")))
  .toBe(false);
```

Add a second test with a Dune key and authorized paid mode whose Dune and
GrowThePie fixtures both cover the Coin Metrics cutoff. Assert the output
uses Dune rent and both adapters received the same cutoff indirectly through
their exact selected date ranges/results.

- [ ] **Step 2: Run server tests and verify RED**

Run:

```bash
npx vitest run tests/server.test.ts
```

Expected: FAIL because the server never calls GrowThePie or supplies it to the
assembler.

- [ ] **Step 3: Wire concurrent source fetching**

Import `fetchGrowThePieRent`. After fetching supply and selecting
`cutoffDay`, use:

```ts
const [dune, growthepie] = await Promise.all([
  fetchDuneEthValue(
    {
      cutoffDay,
      windowDays,
      includeRollups: args.include_rollups,
      allowExecution: args.paid_mode === "byok_allowed",
    },
    hc.ctx,
  ),
  fetchGrowThePieRent(
    {
      cutoffDay,
      windowDays,
      includeRollups: args.include_rollups,
    },
    hc.ctx,
  ),
]);
```

Pass `growthepie` to `getEthValueCapture`. Do not add it to
`byok_active` or `paid_sources_active`.

- [ ] **Step 4: Verify server tests are GREEN**

Run:

```bash
npx vitest run tests/server.test.ts tests/tools/get_eth_value_capture.test.ts
```

Expected: PASS.

- [ ] **Step 5: Add the opt-in live GrowThePie regression**

In `tests/live/eth_value_capture.live.test.ts`, import the adapter and add a
test under the existing `RUN_LIVE_ETH_VALUE=1` suite:

```ts
it("reads aligned free L2 rent windows from GrowThePie", async () => {
  const now = new Date();
  const ctx = makeContext({ env: loadEnv(process.env) });
  const supply = await fetchEthSupplyHistory({ windowDays: 7, now }, ctx);
  expect(supply.latestBoundary).not.toBeNull();

  const result = await fetchGrowThePieRent(
    {
      cutoffDay: supply.latestBoundary!,
      windowDays: 7,
      includeRollups: true,
    },
    ctx,
  );

  expect(result.status).toBe("valid");
  expect(result.current.l2Rent).not.toBeNull();
  expect(result.previous.l2Rent).not.toBeNull();
  expect(result.current.l2Rent).toBeGreaterThanOrEqual(0);
  expect(result.previous.l2Rent).toBeGreaterThanOrEqual(0);
  expect(result.rollups?.length).toBeGreaterThan(0);
}, 30_000);
```

- [ ] **Step 6: Update reader-facing documentation**

Update `README.md` so the ETH value-capture section states:

- `free_only` fetches Coin Metrics supply and GrowThePie total L2 rent;
- Dune remains explicitly authorized and preferred for fee and decomposed
  rent data;
- GrowThePie rollups contain total rent only;
- 90-day comparison uses the full-history export endpoint;
- source precedence never adds or averages Dune and GrowThePie rent;
- opt-in live verification now covers Coin Metrics and GrowThePie for free.

Remove the old claim that a cache-miss free request is Coin Metrics-only.
Keep the existing overlap warning and deferred RPC/Beacon/collateral scope.

- [ ] **Step 7: Run focused and full verification**

Run:

```bash
npx vitest run tests/adapters/eth_value_growthepie.test.ts \
  tests/tools/get_eth_value_capture.test.ts \
  tests/server.test.ts
npm test
npm run typecheck
npm run build
```

Expected: all unit/integration tests pass; the live tests remain skipped unless
explicitly enabled.

- [ ] **Step 8: Commit Task 3**

```bash
git add src/server.ts \
  tests/server.test.ts \
  tests/live/eth_value_capture.live.test.ts \
  README.md
git commit -m "feat: expose free GrowThePie L2 rent"
```

