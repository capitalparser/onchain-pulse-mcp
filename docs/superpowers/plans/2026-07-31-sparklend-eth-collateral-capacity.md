# SparkLend Ethereum ETH Collateral Capacity Implementation Plan

> Implement task-by-task in the isolated feature worktree with terra-high;
> review every task and the complete branch independently with sol-high.

**Goal:** Verify SparkLend Ethereum ETH-family supplied capacity at one
finalized block while extracting one deep Aave-V3-market RPC module and keeping
cross-protocol/broader collateral metrics explicitly null.

**Architecture:** A shared internal finalized-market RPC module owns transport,
ABI, finality, cache, and raw evidence. Protocol adapters translate normalized
evidence into strict Aave or Spark domain Snapshots. Spark has a separate MCP
tool until overlap reconciliation can support a combined interface.

**Tech stack:** Node.js 20+, TypeScript ESM, native `fetch`, Zod 3, Vitest 2,
tsup 8, MCP SDK 1.x.

## Global Constraints

- Work only in `onchain-pulse-mcp-spark-collateral`.
- Use strict RED, GREEN, REFACTOR and preserve literal RED output in reports.
- Preserve the existing Aave public Snapshot and 35-call behavior exactly.
- Spark coverage is exactly six official ETH-family reserves and 23 calls.
- Require mainnet and bind every contract read to one exact finalized block.
- Use `bigint` for all supply, price, fraction, and aggregate values.
- Missing or inconsistent evidence invalidates the complete market result.
- Never sum Aave and Spark or relabel supply as actual user collateral/locked
  ETH.
- Keep combined, actual, net, gross, and rehypothecation metrics `null`.
- Never return, log, persist, or cache-key `ETHEREUM_RPC_URL`.
- No default test may perform a network call.
- Do not change fee, Beacon, Dune, GrowThePie, or value-capture arithmetic.
- Final verification is `npm test`, `npm run typecheck`, and `npm run build`.

---

### Task 1: Deep finalized Aave-V3-market RPC module

**Files:**

- Create: `src/adapters/aave_v3_market_rpc.ts`
- Create: `tests/adapters/aave_v3_market_rpc.test.ts`
- Modify: `src/adapters/eth_collateral_aave_v3.ts`
- Modify only for regression coverage:
  `tests/adapters/eth_collateral_aave_v3.test.ts`
- Create:
  `.superpowers/sdd/2026-07-31-sparklend-eth-collateral-capacity/task-1-report.md`

**Required behavior:**

- Define one small internal interface for market id, cache name,
  PoolAddressesProvider, and fixed assets.
- Return only normalized verified evidence plus stale state or one bounded
  failure code; do not return a public protocol Snapshot.
- Move provider binding, four batch rounds, mainnet/finalized checks, ABI
  selectors/encoding/decoding, ID reconciliation, exact-block binding,
  verified-only caching, coalescing, and stale raw-evidence fallback behind the
  interface.
- Enforce `5 + 3N` logical calls and a bounded asset count; reject empty,
  duplicate, malformed, non-18-decimal, inactive, or inconsistent evidence.
- Keep all five configuration bool words canonical.
- Scope provider binding and cache independently by market within one context.
- Refactor the Aave adapter into a protocol-specific translation wrapper.
- Preserve every existing Aave output, gap mapping, source, stale path,
  call count, and test.

**TDD evidence:**

1. Add failing shared-module tests before moving implementation.
2. Add valid 10-asset and 6-asset specs and exact count assertions.
3. Add RED/GREEN cases for spec validation, per-market cache/provider
   isolation, envelope/finality/ABI failures, coalescing, and stale raw
   evidence.
4. Run:

```bash
npx vitest run tests/adapters/aave_v3_market_rpc.test.ts \
  tests/adapters/eth_collateral_aave_v3.test.ts \
  tests/eth_collateral_demand
npm run typecheck
```

**Commit:** `refactor: deepen finalized Aave V3 market RPC`

---

### Task 2: Exact Spark collateral domain and adapter

**Files:**

- Create: `src/spark_collateral_capacity/types.ts`
- Create: `src/spark_collateral_capacity/metrics.ts`
- Create: `src/adapters/eth_collateral_spark.ts`
- Create: `tests/spark_collateral_capacity/types.test.ts`
- Create: `tests/spark_collateral_capacity/metrics.test.ts`
- Create: `tests/adapters/eth_collateral_spark.test.ts`
- Create:
  `.superpowers/sdd/2026-07-31-sparklend-eth-collateral-capacity/task-2-report.md`

**Required behavior:**

- Add strict public schemas for the six-asset Spark Snapshot.
- Reuse the existing exact ETH-equivalent type/arithmetic without weakening
  Aave's fixed ten-asset contract.
- Enforce the official symbol-to-underlying map, 18 decimals, active reserves,
  positive prices, nonnegative supplies, exact per-asset fractions, canonical
  aggregates, and literal cross-field identities.
- Require nonempty matching source provenance and controlled stale semantics.
- Require five permanent coverage gaps in every verified Snapshot.
- Reject any non-null combined, actual, net, gross, or rehypothecation metric.
- Translate the shared raw result into verified/unavailable Spark Snapshots.
- Use the official Spark PoolAddressesProvider and exactly six fixed assets.
- Verify four rounds and 23 calls while keeping Aave's 35-call path green.

**TDD evidence:**

1. Capture missing-module RED.
2. Build exact non-divisible and reducible aggregate fixtures.
3. Add schema fabrication, partial evidence, provenance, stale, overlap, asset,
   and source-failure RED/GREEN cases.
4. Add adapter call-bound, source translation, cache isolation, redaction, and
   no-partial-result tests.
5. Run:

```bash
npx vitest run tests/spark_collateral_capacity \
  tests/adapters/eth_collateral_spark.test.ts \
  tests/adapters/aave_v3_market_rpc.test.ts \
  tests/adapters/eth_collateral_aave_v3.test.ts
npm run typecheck
```

**Commit:** `feat: add finalized Spark collateral capacity`

---

### Task 3: Spark MCP tool, terminology, docs, and live gate

**Files:**

- Create: `src/tools/get_spark_eth_collateral_capacity.ts`
- Modify: `src/server.ts`
- Create: `tests/tools/get_spark_eth_collateral_capacity.test.ts`
- Modify: `tests/server.test.ts`
- Create: `tests/live/spark_eth_collateral_capacity.live.test.ts`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `CONTEXT.md`
- Create:
  `.superpowers/sdd/2026-07-31-sparklend-eth-collateral-capacity/task-3-report.md`

**Required behavior:**

- Register `get_spark_eth_collateral_capacity` with a strict empty object.
- Reuse only the internal `ETHEREUM_RPC_URL`.
- Localize verified, stale, and unavailable summaries in Korean/English.
- Wording must say Spark supplied capacity, not actual collateral, combined
  Aave/Spark demand, or locked ETH.
- Preserve all five broader nulls and five permanent coverage gaps.
- Add a default-skipped live suite requiring both
  `RUN_LIVE_SPARK_COLLATERAL=1` and a nonblank RPC URL.
- The live suite reads one finalized Snapshot, proves both exact aggregate
  identities, and checks every broader metric remains null.
- Add `test:live:spark-collateral`.
- Document official six-asset scope, 23-call/four-round bound, common RPC
  module, exact rational values, credential seam, overlap gap, and live gate.
- Add the new domain terms to `CONTEXT.md`.
- Do not change `get_eth_collateral_demand` or `get_eth_value_capture`.

**TDD evidence:**

1. Capture registration, strict-input, handler, localization, and redaction
   RED.
2. Implement the minimal MCP wiring.
3. Add verified/stale/unavailable, default-live-skip, null/overlap, and
   no-overclaim tests.
4. Run:

```bash
npx vitest run tests/server.test.ts \
  tests/tools/get_spark_eth_collateral_capacity.test.ts \
  tests/live/spark_eth_collateral_capacity.live.test.ts
npm test
npm run typecheck
npm run build
```

**Commit:** `feat: expose Spark collateral capacity tool`

---

### Task 4: Independent final QA and remediation

**QA contract:**

- Review exact branch SHA and full diff from
  `888c821f05e41a9bb60edf1e5d46a07a632384cd`.
- Lead Critical, Important, then Minor findings with file and line.
- Verify no Aave regression, duplicated transport implementation, URL leak,
  partial total, mixed-block evidence, chain/finality gap, unbounded call path,
  invalid stale cache, fabricated exact identity, cross-protocol sum, or
  actual-collateral overclaim.
- Inspect RED evidence and rerun focused/full tests, typecheck, and build.
- Keep opt-in live evidence separate and do not run it.
- End `APPROVED` or `CHANGES_REQUESTED`.

If QA requests changes, terra-high performs a narrow TDD fix and sol-high
reviews the new exact SHA until no Critical or Important finding remains.

**Integration-ready condition:**

- clean worktree;
- implementation commits on `feat/spark-eth-collateral-capacity`;
- default suite, typecheck, and build pass fresh;
- independent sol-high whole-branch QA says `APPROVED`;
- PR head SHA and CI are verified before merge;
- merged main passes local and remote post-merge verification.
