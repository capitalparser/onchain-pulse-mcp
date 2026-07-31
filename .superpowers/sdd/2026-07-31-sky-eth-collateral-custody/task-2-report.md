# Task 2: Finalized Chainlog custody RPC adapter

## Scope

- `src/adapters/sky_eth_collateral_rpc.ts`
- `tests/adapters/sky_eth_collateral_rpc.test.ts`

The adapter binds one internal provider per adapter context, resolves the fixed
Chainlog authority at a single finalized mainnet block, validates every
response as an exact JSON-RPC envelope, and caches only frozen complete
evidence for 30 minutes. It sends the Task 1 builder the six resolved joins,
exact raw balances, and aggregate wstETH/rETH quote results; no partial
observation is surfaced.

## RED evidence

The adversarial adapter test was written before the production adapter existed:

```text
> onchain-pulse-mcp@0.0.1 test
> vitest run tests/adapters/sky_eth_collateral_rpc.test.ts

 FAIL  tests/adapters/sky_eth_collateral_rpc.test.ts
Error: Failed to load url ../../src/adapters/sky_eth_collateral_rpc.js
(resolved id: ../../src/adapters/sky_eth_collateral_rpc.js)

 Test Files  1 failed (1)
      Tests  no tests
```

## GREEN evidence

```text
Test Files  1 passed (1)
     Tests  18 passed (18)
```

The focused suite independently asserts the exact `2, 10, 36, 2` batch shape
and 50 unique logical calls, Chainlog key order, per-join selector layout,
single numeric finalized tag, and aggregate amount calldata. It also covers
missing configuration, extra/duplicate/missing/malformed JSON-RPC responses,
chain and finality failures, malformed/zero addresses, wrong token/ilk/Vat,
wrong decimals/live flag, malformed ABI quote, provider secrecy, provider
binding, request coalescing, and stale fallback only from prior verified
evidence.

## Boundaries

- No RPC endpoint was contacted; tests use an in-memory fetch implementation.
- Provider URLs and provider error text are neither cache keys nor output.
- Failure returns a bounded unavailable code with no joins, contracts, block,
  bucket, quote, or metric evidence.
