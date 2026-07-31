# Task 1 — Deep finalized Aave V3 market RPC module

## Scope

- Created `src/adapters/aave_v3_market_rpc.ts`.
- Refactored `src/adapters/eth_collateral_aave_v3.ts` into the Aave public
  Snapshot translation wrapper.
- Added direct shared-module coverage and retained the existing Aave adapter
  regression suite.
- Corrected the legacy Aave V3 Core PoolAddressesProvider literal to the
  official 40-hex address:
  `0x2f39d218133afab8f2b819b1066c7e434ad94e9e`.

## RED

Initial test discovery in the isolated worktree was blocked before imports by
the absent local dev dependencies (no network request was made):

```text
failed to load config from .../vitest.config.ts
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'vitest'
```

After the explicitly offline dependency restore, the new direct shared-module
test suite ran RED before the finalized provider literal was corrected:

```text
tests/adapters/aave_v3_market_rpc.test.ts (11 tests | 7 failed)
expected 'unavailable' to be 'verified'
expected "spy" to be called 4 times, but got 0 times
```

The failure was intentional and diagnostic: strict pre-fetch address validation
rejected the old 39-hex Aave provider string. The official literal was corrected
and a literal regression assertion was added. A follow-up RED test for shared
ownership and identity isolation failed as expected before the refactor:

```text
expected 999n to be 2n
```

## GREEN / REFACTOR

- The shared module validates bounded market specs (market/cache identifiers,
  provider and asset addresses, duplicates, and exactly one WETH) before a
  fetch.
- It binds provider and cache identity to a canonical public spec fingerprint,
  rejects same-market spec drift, and never uses an RPC URL in a cache key.
- Raw verified evidence is frozen in the cache and cloned at the interface, so
  caller mutation cannot corrupt future fresh or stale reads.
- It performs mainnet/finalized checks and four exact JSON-RPC batch rounds,
  canonical ABI/envelope/ID validation, all five configuration bool checks,
  and verified-only stale fallback.
- Aave retains its public sources, gaps, stale behavior, and 35-call/10-asset
  contract; the direct module also verifies Spark-ready 23-call/6-asset bounds.

## Verification

```text
npx vitest run tests/adapters/aave_v3_market_rpc.test.ts \
  tests/adapters/eth_collateral_aave_v3.test.ts \
  tests/eth_collateral_demand

Test Files  4 passed (4)
Tests       75 passed (75)

npm test
Test Files  49 passed | 4 skipped (53)
Tests       594 passed | 6 skipped (600)

npm run typecheck
tsc --noEmit

git diff --check
```

No live RPC test or network call was run. `npm ci --offline --ignore-scripts`
restored only cached development dependencies after the initial harness failure.

## Task-1 concerns

- The Spark public adapter/domain/tool is deliberately out of scope for this
  task; Task 2 consumes the shared normalized evidence.
- The provider literal correction changes only the mocked contract target in
  the existing Aave regression test; the public Aave Snapshot contract remains
  unchanged.
