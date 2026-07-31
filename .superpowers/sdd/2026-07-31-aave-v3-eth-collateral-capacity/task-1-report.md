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

---

## QA remediation — RED

Command:

```text
$ npx vitest run tests/eth_collateral_demand
```

Output:

```text
 FAIL  tests/eth_collateral_demand/metrics.test.ts > verified collateral capacity > builds a controlled stale verified fallback with matching provenance
AssertionError: expected [] to have a length of 1 but got +0

 FAIL  tests/eth_collateral_demand/metrics.test.ts > verified collateral capacity > maps malformed exported helper inputs to schema-drift errors
AssertionError: expected TypeError: Cannot mix BigInt and other types to be an instance of EthCollateralDomainError

 FAIL  tests/eth_collateral_demand/types.test.ts > EthCollateralDemandSnapshotSchema > rejects a verified snapshot with noncanonical aggregate denominator even when identity flags are true
AssertionError: expected true to be false // Object.is equality

 FAIL  tests/eth_collateral_demand/types.test.ts > EthCollateralDemandSnapshotSchema > rejects inconsistent verified provenance: a source failure gap
AssertionError: expected true to be false // Object.is equality

 FAIL  tests/eth_collateral_demand/types.test.ts > EthCollateralDemandSnapshotSchema > rejects source_stale as the only unavailable failure gap
AssertionError: expected true to be false // Object.is equality

 Test Files  2 failed (2)
      Tests  10 failed | 21 passed (31)
```

## QA remediation — GREEN

Command:

```text
$ npx vitest run tests/eth_collateral_demand && npm run typecheck && git diff --check
```

Output:

```text
 RUN  v2.1.9 /Users/kjun/orca/workspaces/vault/onchain-pulse-mcp-eth-collateral-aave

 ✓ tests/eth_collateral_demand/types.test.ts (17 tests) 5ms
 ✓ tests/eth_collateral_demand/metrics.test.ts (16 tests) 5ms

 Test Files  2 passed (2)
      Tests  33 passed (33)

> onchain-pulse-mcp@0.0.1 typecheck
> tsc --noEmit
```

The verified public schema now recomputes each WETH-reference exact amount and
the all-supplied and collateral-enabled aggregates from bounded decimal
bigints. It also rejects fabricated values even if the boolean identity flags
are set. Verified evidence requires complete fresh or controlled-stale source
provenance; unavailable evidence cannot claim `source_stale` as its only
failure. The builder's `stale: true` path marks every source status stale and
adds exactly one bounded stale gap.
