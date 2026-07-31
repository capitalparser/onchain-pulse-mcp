# Task 1 — Exact Aave collateral-capacity domain

## Scope

- Added the strict public snapshot contracts and fixed official ten-asset set.
- Added bigint-only exact ETH-equivalent fractions, LCM/GCD aggregate arithmetic,
  verified/unavailable snapshot builders, and typed domain errors.
- Kept all unindexed broader metrics explicitly `null` and unavailable evidence
  free of partial values.

## RED — missing modules

Command:

```text
$ npx vitest run tests/eth_collateral_demand
```

Output:

```text
 RUN  v2.1.9 /Users/kjun/orca/workspaces/vault/onchain-pulse-mcp-eth-collateral-aave

 FAIL  tests/eth_collateral_demand/metrics.test.ts [ tests/eth_collateral_demand/metrics.test.ts ]
Error: Failed to load url ../../src/eth_collateral_demand/metrics.js
(resolved id: ../../src/eth_collateral_demand/metrics.js). Does the file exist?

 FAIL  tests/eth_collateral_demand/types.test.ts [ tests/eth_collateral_demand/types.test.ts ]
Error: Failed to load url ../../src/eth_collateral_demand/types.js
(resolved id: ../../src/eth_collateral_demand/types.js). Does the file exist?

 Test Files  2 failed (2)
      Tests  no tests
```

## RED — reviewed exactness and public-contract invariants

Command:

```text
$ npx vitest run tests/eth_collateral_demand
```

Output:

```text
 FAIL  tests/eth_collateral_demand/metrics.test.ts > exact ETH-equivalent arithmetic > preserves the non-divisible wei remainder without floating-point rounding
AssertionError: expected { Object (wei_floor, eth_floor, ...) } to deeply equal { wei_floor: '7', …(3) }
-   "eth_floor": "0.000000000000000007",
+   "eth_floor": "0",

 FAIL  tests/eth_collateral_demand/types.test.ts > EthCollateralDemandSnapshotSchema > rejects a verified snapshot whose symbol is paired with another official underlying
AssertionError: expected true to be false // Object.is equality

 Test Files  2 failed (2)
      Tests  4 failed | 14 passed (18)
```

The GREEN implementation changed `eth_floor` to the exact base-10 ETH
representation of `wei_floor`, retained the original per-asset oracle
denominator, made the disabled `cbETH` fixture nonzero, and validates every
public symbol-to-underlying address mapping.

## GREEN — scoped verification

Command:

```text
$ npx vitest run tests/eth_collateral_demand && npm run typecheck
```

Output:

```text
 RUN  v2.1.9 /Users/kjun/orca/workspaces/vault/onchain-pulse-mcp-eth-collateral-aave

 ✓ tests/eth_collateral_demand/types.test.ts (6 tests) 4ms
 ✓ tests/eth_collateral_demand/metrics.test.ts (12 tests) 5ms

 Test Files  2 passed (2)
      Tests  18 passed (18)

> onchain-pulse-mcp@0.0.1 typecheck
> tsc --noEmit
```

## REFACTOR and final checks

- Extracted the shared exact wei-to-ETH decimal formatter while preserving
  bigint-only value arithmetic.
- `git diff --check` passed.
- No adapter, server, documentation, or other module was changed.

## Concern

The first RED command was run before dependencies were present and caused npm
to create an npx Vitest cache entry. Dependencies were then installed with
`npm ci --offline --ignore-scripts`; no intentional RPC or other live network
request was made by this task.
