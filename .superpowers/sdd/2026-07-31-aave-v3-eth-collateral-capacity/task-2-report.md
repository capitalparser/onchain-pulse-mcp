# Task 2 — Finalized Aave V3 Ethereum RPC adapter

## Scope

- Added the bounded, read-only adapter in `src/adapters/eth_collateral_aave_v3.ts`.
- Added default-offline adapter contract tests in
  `tests/adapters/eth_collateral_aave_v3.test.ts`.
- No server, MCP tool, README, or unrelated adapter/domain file was changed.

## RED — missing adapter module

Command:

```text
$ npx vitest run tests/adapters/eth_collateral_aave_v3.test.ts
```

Output:

```text
 FAIL  tests/adapters/eth_collateral_aave_v3.test.ts [ tests/adapters/eth_collateral_aave_v3.test.ts ]
Error: Failed to load url ../../src/adapters/eth_collateral_aave_v3.js
(resolved id: ../../src/adapters/eth_collateral_aave_v3.js). Does the file exist?

 Test Files  1 failed (1)
      Tests  no tests
```

## RED — complete configuration tuple booleans

Command:

```text
$ npx vitest run tests/adapters/eth_collateral_aave_v3.test.ts
```

Output:

```text
 FAIL  tests/adapters/eth_collateral_aave_v3.test.ts > fetchEthCollateralAaveV3 > rejects a malformed unused configuration bool word without producing a partial aggregate
AssertionError: expected 'verified' to be 'unavailable' // Object.is equality

Expected: "unavailable"
Received: "verified"
```

The GREEN implementation validates canonical ABI bool words at configuration
tuple offsets 5, 6, 7, 8, and 9; only offsets 5 and 8 are then used as the
collateral-enabled and active values.

## GREEN — scoped verification

Command:

```text
$ npx vitest run tests/adapters/eth_collateral_aave_v3.test.ts \
  tests/eth_collateral_demand && npm run typecheck && git diff --check
```

Output:

```text
 RUN  v2.1.9 /Users/kjun/orca/workspaces/vault/onchain-pulse-mcp-eth-collateral-aave

 ✓ tests/adapters/eth_collateral_aave_v3.test.ts (25 tests)
 ✓ tests/eth_collateral_demand/types.test.ts (20 tests)
 ✓ tests/eth_collateral_demand/metrics.test.ts (17 tests)

 Test Files  3 passed (3)
      Tests  62 passed (62)

> onchain-pulse-mcp@0.0.1 typecheck
> tsc --noEmit
```

## Contract evidence

- Valid evidence uses exactly four HTTP JSON-RPC batch rounds with 2, 2, 20,
  and 11 logical calls (35 total): mainnet/finalized block, provider address
  resolution, configurations/supplies, and prices plus duplicate WETH reference.
- Every `eth_call` is bound to the exact canonical hexadecimal finalized block
  tag. Tests independently assert the five canonical ABI selectors and address
  calldata, including the fixed 10-word configuration offsets.
- Batch responses are associated by complete unique IDs, not response order.
  All malformed/missing/unknown/error envelopes, malformed words, zero provider
  addresses, wrong decimals, inactive reserves, zero prices, and mismatched
  duplicate WETH prices return a bounded unavailable snapshot with no partial
  assets or totals.
- The provider URL is bound only in a context WeakMap; it is not returned,
  logged, or used in a cache key. Only verified snapshots are cached for 30
  minutes; concurrent requests coalesce, and an expired refresh can use only
  the domain builder's controlled stale path.

## Concerns

- No live RPC call was made. All evidence tests use an injected fetch double.
