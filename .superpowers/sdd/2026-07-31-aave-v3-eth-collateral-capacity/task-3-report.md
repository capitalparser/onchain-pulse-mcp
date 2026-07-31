# Task 3 — MCP tool, documentation, and opt-in live gate

## Scope

- Added `get_eth_collateral_demand` public localization/schema boundary and
  server registration.
- Reused only the existing internal `EnvConfig.ethereumRpcUrl`; `env.ts` was
  not changed.
- Added default-skipped finalized snapshot live coverage, npm command, and
  documentation. The result is not wired into `get_eth_value_capture`.

## RED — registration, handler, and missing tool module

Command:

```text
$ npx vitest run tests/server.test.ts tests/tools/get_eth_collateral_demand.test.ts
```

Output:

```text
 FAIL  tests/tools/get_eth_collateral_demand.test.ts [ tests/tools/get_eth_collateral_demand.test.ts ]
Error: Failed to load url ../../src/tools/get_eth_collateral_demand.js
(resolved id: ../../src/tools/get_eth_collateral_demand.js). Does the file exist?

 FAIL  tests/server.test.ts > server > registers all eleven expected tools
AssertionError: expected [ 'get_etf_flow', …(9) ] to deeply equal [ 'get_etf_flow', …(10) ]

 FAIL  tests/server.test.ts > server > get_eth_collateral_demand advertises and enforces a strict empty object
AssertionError: expected undefined to deeply equal { type: 'object', properties: {}, additionalProperties: false }

 FAIL  tests/server.test.ts > handleEthCollateralDemand > returns a localized bounded no-config snapshot without calling fetch
TypeError: handleEthCollateralDemand is not a function
```

## GREEN — focused tool, server, and default-live gate

Command:

```text
$ npx vitest run tests/server.test.ts tests/tools/get_eth_collateral_demand.test.ts \
  tests/live/eth_collateral_demand.live.test.ts && npm run typecheck && git diff --check
```

Output:

```text
 ✓ tests/tools/get_eth_collateral_demand.test.ts (4 tests)
 ↓ tests/live/eth_collateral_demand.live.test.ts (1 test | 1 skipped)
 ✓ tests/server.test.ts (31 tests)

 Test Files  2 passed | 1 skipped (3)
      Tests  35 passed | 1 skipped (36)

> onchain-pulse-mcp@0.0.1 typecheck
> tsc --noEmit
```

## GREEN — full default verification

Command:

```text
$ npm test && npm run typecheck && npm run build && git diff --check
```

Output:

```text
 Test Files  48 passed | 4 skipped (52)
      Tests  581 passed | 6 skipped (587)

> onchain-pulse-mcp@0.0.1 typecheck
> tsc --noEmit

> onchain-pulse-mcp@0.0.1 build
> tsup

ESM Build success
DTS Build success
```

## Public contract

- The MCP input schema is an empty object with `additionalProperties: false`;
  the strict Zod handler rejects caller-controlled assets, blocks, or ranges.
- The handler passes only `hc.env.ethereumRpcUrl` to the adapter, schema-checks
  its result, and replaces adapter summary text with Korean or English wording
  that says Aave V3 Core ETH-family **supplied capacity**. It does not claim
  actual user collateral, net/gross ETH locked, issuance, or unique ETH.
- The exact four broader metrics remain `null` and retain their coverage gaps.
  Adapter summaries and credentials do not cross the public tool boundary.
- `npm run test:live:eth-collateral` remains skipped unless both
  `RUN_LIVE_ETH_COLLATERAL=1` and `ETHEREUM_RPC_URL` are present. It was not
  enabled for this task and no live RPC request was made.
