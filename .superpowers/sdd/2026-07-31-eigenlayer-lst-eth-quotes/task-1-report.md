# Task 1 — Exact EigenLayer covered LST quote domain

## Scope and source boundary

Implemented only the strict quote-domain files on corrected documentation head
`5c9f0da09ab878aabea3844e47740b89a4fd7695`. The fixed EigenLayer strategy
identities remain pinned to official `Layr-Labs/eigenlayer-contracts` `v1.12.0`
commit `d302f65042164c8d8d0a983c1540d85a8710030b`. Quote semantics remain pinned
to the approved official sources:

- [Lido StETH v4.0.0](https://github.com/lidofinance/core/blob/17005714f151e5502c559932319a3f2f74ac2436/contracts/0.4.24/StETH.sol)
- [Rocket Pool RocketTokenRETH](https://github.com/rocket-pool/rocketpool/blob/fef41a4f7cf99d7d66313c0ba04deb8ba2dabf88/contracts/contract/token/RocketTokenRETH.sol)
- [Coinbase StakedTokenV1](https://github.com/coinbase/wrapped-tokens-os/blob/5697a90f4c47e8d801cedce81444a8464019fe08/contracts/wrapped-tokens/staking/StakedTokenV1.sol)

No adapter, server, package, README, CONTEXT, or existing domain file changed.

## RED -> GREEN evidence

The initial tracer was written before the type module and produced this literal
missing-module RED:

```text
FAIL  tests/eigenlayer_lst_eth_quotes/types.test.ts
Error: Failed to load url ../../src/eigenlayer_lst_eth_quotes/types.js
(resolved id: ../../src/eigenlayer_lst_eth_quotes/types.js) ... Does the file exist?
Test Files  1 failed (1)
Tests  no tests
```

The worktree initially had no installed dependencies, so the first preflight
reported `sh: vitest: command not found`. Dependencies were restored without
network access using `npm ci --offline --ignore-scripts`, after which the
literal missing-module RED above was captured.

After the fixed-strategy tracer became GREEN, the first full contract tracer
failed before schema implementation:

```text
TypeError: Cannot read properties of undefined (reading 'map')
Test Files  1 failed (1)
Tests  no tests
```

The arithmetic builder tracer was written before the metrics module and
produced this literal RED:

```text
FAIL  tests/eigenlayer_lst_eth_quotes/metrics.test.ts
Error: Failed to load url ../../src/eigenlayer_lst_eth_quotes/metrics.js
(resolved id: ../../src/eigenlayer_lst_eth_quotes/metrics.js) ... Does the file exist?
Test Files  1 failed (1)
Tests  no tests
```

The explicit prohibition on substituting a rounded one-token rETH rate then
produced this arithmetic-contract RED before the fail-closed seam was added:

```text
expected function to throw an error, but it didn't
Test Files  1 failed (1)
Tests  1 failed | 6 skipped (7)
```

Final focused GREEN:

```text
Test Files  2 passed (2)
Tests  13 passed (13)
```

## Enforced domain contract

- Exact ordered stETH, rETH, and cbETH EigenLayer strategies, exact token
  identities, and exactly 18 decimals.
- Separate share-accounting and custody token amounts and ETH quotes.
- stETH token-wei identity conversion with no shares conversion.
- Two independent direct rETH aggregate quote results; a rounded-rate seam is
  rejected rather than used to synthesize either result.
- One nonzero cbETH `10**18`-scaled rate, exact floor recomputation for both
  amounts, and permanent `cbeth_exchange_rate_freshness_not_verified` evidence.
- Canonical uint256 strings and exact bigint bounds on every amount, rate,
  product, result, and covered partial sum.
- Exact `covered_share_accounting_eth_equivalent_wei` and
  `covered_token_custody_eth_equivalent_wei` partial aggregates, coverage 3 of
  12, and the exact ordered nine unquoted labels.
- Seven broader metrics remain `null`, including executable withdrawal
  capacity; nine permanent gaps cover partial coverage, those seven boundaries,
  and cbETH freshness.
- Verified and stale provenance is exact. Unavailable output contains one
  bounded source failure and no block, quotes, rate, identities, coverage, or
  partial sums.

## Full offline verification

```text
Test Files  67 passed | 8 skipped (75)
Tests  792 passed | 10 skipped (802)
```

`npm run typecheck` passed. No network request, live test body, push, or other
remote operation was performed.
