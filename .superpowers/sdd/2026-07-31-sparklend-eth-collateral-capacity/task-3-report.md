# Task 3 — Spark MCP tool, terminology, and live gate

## Scope

- Added `get_spark_eth_collateral_capacity` as a strict empty-input MCP tool.
- Registered it with the server and passed only the internal
  `ETHEREUM_RPC_URL` value to the Spark adapter.
- Added English/Korean verified, stale, and unavailable localization; opt-in
  live gate; package script; and Spark scope documentation.

## RED

The public tool, server registration, and live-test import were added before
their production module/wiring existed:

```text
tests/tools/get_spark_eth_collateral_capacity.test.ts (0 test)
Error: Failed to load url ../../src/tools/get_spark_eth_collateral_capacity.js

tests/live/spark_eth_collateral_capacity.live.test.ts (0 test)
Error: Failed to load url ../../src/tools/get_spark_eth_collateral_capacity.js

tests/server.test.ts
expected [...11 tools] to include get_spark_eth_collateral_capacity
handleSparkEthCollateralCapacity is not a function
```

A final strict-input regression showed that `null` was being normalized to an
empty object before validation:

```text
promise resolved an unavailable Snapshot instead of rejecting
```

## GREEN

- `get_spark_eth_collateral_capacity` accepts only `{}`; nonempty or `null`
  public input is rejected before the adapter can use it.
- The handler reads the RPC URL only from server environment configuration and
  the public localization boundary reparses the strict Spark Snapshot, removing
  adapter summary or credential text.
- Summaries describe only SparkLend ETH-family supplied capacity. The five
  broader metrics remain `null`; verified fresh output has exactly five
  permanent gaps and stale output adds the controlled `source_stale` gap.
- The live suite is default-skipped and requires both
  `RUN_LIVE_SPARK_COLLATERAL=1` and nonblank `ETHEREUM_RPC_URL`. It was not
  executed. When explicitly enabled, it verifies both exact aggregate fraction
  identities and all five broader null boundaries.

## Verification

```text
npx vitest run tests/server.test.ts \
  tests/tools/get_spark_eth_collateral_capacity.test.ts \
  tests/live/spark_eth_collateral_capacity.live.test.ts

Test Files  2 passed | 1 skipped (3)
Tests       35 passed | 1 skipped (36)

npm run typecheck
tsc --noEmit

npm run build
ESM and DTS build success

git diff --check
```

No network, RPC call, or push was performed. The default full test suite is
recorded after final verification.

```text
npm test
Test Files  53 passed | 5 skipped (58)
Tests       632 passed | 7 skipped (639)
```
