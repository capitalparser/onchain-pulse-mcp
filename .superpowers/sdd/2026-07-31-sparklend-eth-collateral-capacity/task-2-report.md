# Task 2 — Exact Spark collateral domain and adapter

## Scope

- Added the strict six-reserve Spark collateral Snapshot schema and exact
  `bigint` metric derivation.
- Added the SparkLend finalized-market adapter using only the shared Aave V3
  market RPC verifier.
- Kept the existing Aave ten-asset domain, adapter, and public contract
  unchanged.

## RED

The Spark domain tests were created before either production module existed:

```text
tests/spark_collateral_capacity/metrics.test.ts (0 test)
Error: Failed to load url ../../src/spark_collateral_capacity/metrics.js

tests/spark_collateral_capacity/types.test.ts (0 test)
Error: Failed to load url ../../src/spark_collateral_capacity/types.js
```

After the domain was green, the adapter test was added before its production
module:

```text
tests/adapters/eth_collateral_spark.test.ts (0 test)
Error: Failed to load url ../../src/adapters/eth_collateral_spark.js
```

The schema fixture then exposed a fabricated aggregate during refinement:

```text
expected false to be true
```

The fixture incorrectly claimed an aggregate of one wei for six unit reserves;
it was corrected to the exact six-wei identity before GREEN.

## GREEN / REFACTOR

- The fixed Spark set is exactly WETH, wstETH, rETH, weETH, rsETH, and ezETH
  at their official Ethereum underlyings.
- Verified snapshots require all six active 18-decimal reserves, positive
  prices, non-negative supplies, exact reserve fractions, canonical aggregate
  identities, nonempty matching provenance, and controlled stale semantics.
- The five permanent gaps always remain explicit. Combined Aave/Spark supply,
  actual user collateral, net ETH locked, gross collateral, and rehypothecation
  remain literal `null`.
- The adapter uses the official Spark PoolAddressesProvider
  `0x02C3eA4e34C0cBd694D2adFa2c690EECbC1793eE`, translates bounded shared
  failures into an empty unavailable Snapshot, and never exposes the RPC URL.
- The adapter performs four rounds/23 logical calls through the shared module;
  the Aave 10-reserve/35-call regression remains green.

## Verification

```text
npx vitest run tests/spark_collateral_capacity \
  tests/adapters/eth_collateral_spark.test.ts \
  tests/adapters/aave_v3_market_rpc.test.ts \
  tests/adapters/eth_collateral_aave_v3.test.ts

Test Files  5 passed (5)
Tests       62 passed (62)

npm run typecheck
tsc --noEmit

git diff --check
```

Full default verification also passed:

```text
npm test
Test Files  52 passed | 4 skipped (56)
Tests       618 passed | 6 skipped (624)
```

No live RPC or network call was run. The public Spark MCP tool and opt-in live
test remain Task 3 scope.

## QA follow-up — strict gap and unavailable provenance contract

### RED

The new strict-schema tests failed before the hardening change:

```text
tests/spark_collateral_capacity/types.test.ts (15 tests | 6 failed)
expected true to be false

failing cases: duplicate permanent gap; rpc_not_configured provenance;
configured failure without provenance; mismatched source sets; stale unavailable
source; source_stale unavailable gap
```

### GREEN

- Verified Snapshots now require each of the five permanent gap codes exactly
  once. No other verified gap is permitted except exactly one `source_stale`
  when every provenance entry is stale.
- Unavailable Snapshots now contain exactly one bounded source failure;
  `rpc_not_configured` requires empty provenance, while all configured failures
  require unique, matching, nonempty `sources` and `source_status` sets.
  Stale provenance and `source_stale` are forbidden when unavailable.
- Adapter coverage now directly exercises real Aave and Spark adapters in one
  context for both shared and distinct per-market provider URLs (35 + 23
  calls), exact finalized tags, Spark source role mapping, and first-fetch URL
  and error-detail redaction.

### Follow-up verification

```text
Focused Spark/Aave suite: 72 passed (72)
npm test: 628 passed | 6 opt-in skipped (634)
npm run typecheck: passed
git diff --check: passed
```
