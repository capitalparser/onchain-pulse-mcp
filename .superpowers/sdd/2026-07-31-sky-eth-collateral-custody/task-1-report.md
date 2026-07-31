# Task 1: Strict Sky adapter-custody domain

## Scope

- `src/sky_eth_collateral_custody/types.ts`
- `src/sky_eth_collateral_custody/metrics.ts`
- `tests/sky_eth_collateral_custody/types.test.ts`
- `tests/sky_eth_collateral_custody/metrics.test.ts`

The domain fixes the six-ilk universe in canonical order and validates resolved
Chainlog join evidence, the common Vat, direct token identity, 18 decimals,
live flag, uint256 custody quantities, aggregate conversion inputs, and exact
bucket/quoted total identities. It reports adapter-held custody only; all five
broader collateral, demand, locked-ETH, and rehypothecation metrics remain
literal `null` with permanent gaps.

## RED evidence

Tests were written before either production module existed. After restoring
dependencies from the local npm cache with `npm ci --offline`, the required
focused test command failed for the expected missing modules:

```text
> onchain-pulse-mcp@0.0.1 test
> vitest run tests/sky_eth_collateral_custody/types.test.ts tests/sky_eth_collateral_custody/metrics.test.ts

 FAIL  tests/sky_eth_collateral_custody/metrics.test.ts [ tests/sky_eth_collateral_custody/metrics.test.ts ]
Error: Failed to load url ../../src/sky_eth_collateral_custody/metrics.js
(resolved id: ../../src/sky_eth_collateral_custody/metrics.js)

 FAIL  tests/sky_eth_collateral_custody/types.test.ts [ tests/sky_eth_collateral_custody/types.test.ts ]
Error: Failed to load url ../../src/sky_eth_collateral_custody/types.js
(resolved id: ../../src/sky_eth_collateral_custody/types.js)

 Test Files  2 failed (2)
      Tests  no tests
```

## GREEN evidence

```text
Test Files  2 passed (2)
     Tests  11 passed (11)
```

The focused tests cover valid fresh evidence; duplicate ilks; fabricated raw
bucket and total quote values; mismatched Vat; uint256 overflow; mixed
fresh/stale provenance; unavailable partial evidence; ordered-universe builder
rejection; and unavailable output without observed custody.

## Boundaries

- No RPC or other network call was made.
- No provider URL or provider error is represented by this domain.
- Unavailable output contains no block, contracts, joins, buckets, quote
  inputs, identities, or observed custody metric.
