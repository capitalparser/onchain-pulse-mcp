# Task 1 — Strict EigenLayer restaking exposure domain

## Scope and source boundary

Implemented only the Task 1 domain on corrected documentation base
`db7f8eb8256afca122d30a8911dd4b7100ef073b`. The fixed mainnet core and ordered
twelve-strategy universe come from EigenLayer's official
`Layr-Labs/eigenlayer-contracts` `v1.12.0` commit
`d302f65042164c8d8d0a983c1540d85a8710030b`:

- [official deployment README](https://github.com/Layr-Labs/eigenlayer-contracts/blob/d302f65042164c8d8d0a983c1540d85a8710030b/README.md)
- [official mainnet address configuration](https://github.com/Layr-Labs/eigenlayer-contracts/blob/d302f65042164c8d8d0a983c1540d85a8710030b/script/configs/mainnet/mainnet-addresses.config.json)
- [official strategy interface](https://github.com/Layr-Labs/eigenlayer-contracts/blob/d302f65042164c8d8d0a983c1540d85a8710030b/src/contracts/interfaces/IStrategy.sol)
- [official StrategyBase accounting](https://github.com/Layr-Labs/eigenlayer-contracts/blob/d302f65042164c8d8d0a983c1540d85a8710030b/src/contracts/strategies/StrategyBase.sol#L218-L226)
- [official StrategyBase share conversion](https://github.com/Layr-Labs/eigenlayer-contracts/blob/d302f65042164c8d8d0a983c1540d85a8710030b/src/contracts/strategies/StrategyBase.sol#L274-L287)
- [official native diagnostic interface](https://github.com/Layr-Labs/eigenlayer-contracts/blob/d302f65042164c8d8d0a983c1540d85a8710030b/src/contracts/interfaces/IEigenPodManager.sol)

The corrected source boundary preserves token decimals as ABI `uint8` values.
It also preserves token custody and `sharesToUnderlyingView(totalShares)` as
independent token-native observations. The latter is named
`share_accounting_underlying`, not withdrawal capacity. The exact computed
`share_quote_exceeds_custody` diagnostic may be true without invalidating the
snapshot.

## RED → GREEN

The isolated worktree initially had no dependencies, so the first preflight
reported:

```text
sh: vitest: command not found
```

Dependencies were restored without network access using
`npm ci --offline --ignore-scripts`. The same first tracer then produced the
intended literal RED:

```text
FAIL  tests/eigenlayer_eth_restaking/types.test.ts
Error: Failed to load url ../../src/eigenlayer_eth_restaking/types.js
(resolved id: ../../src/eigenlayer_eth_restaking/types.js) ... Does the file exist?
Test Files  1 failed (1)
Tests  no tests
```

After the fixed-universe GREEN, the verified schema tracer failed literally:

```text
TypeError: Cannot read properties of undefined (reading 'safeParse')
Test Files  1 failed (1)
Tests  1 failed | 1 passed (2)
```

The source-correction acceptance test was written before changing the schema
and produced this RED for non-18 decimals plus quote-above-custody evidence:

```text
AssertionError: expected false to be true // Object.is equality
Test Files  1 failed (1)
Tests  1 failed | 3 passed (4)
```

The metrics-builder tracer also failed from its missing public module:

```text
FAIL  tests/eigenlayer_eth_restaking/metrics.test.ts
Error: Failed to load url ../../src/eigenlayer_eth_restaking/metrics.js
(resolved id: ../../src/eigenlayer_eth_restaking/metrics.js) ... Does the file exist?
Test Files  1 failed (1)
Tests  no tests
```

The unavailable-builder tracer then failed literally before implementation:

```text
TypeError: buildUnavailableEigenLayerEthRestakingExposureSnapshot is not a function
Test Files  1 failed (1)
Tests  1 failed | 1 passed (2)
```

Final focused GREEN:

```text
Test Files  2 passed (2)
Tests  15 passed (15)
```

## Enforced boundaries

- Exact fixed core identities and exact ordered, duplicate-free twelve-strategy
  universe.
- Nonzero, pairwise-unique runtime underlying tokens; strict uint8 decimals;
  boolean whitelist state including `false`; exact fixed StrategyManager
  binding; canonical uint256 decimal strings.
- Independent total shares, token custody, and share-accounting-underlying
  observations with an exact quote-above-custody diagnostic. No heterogeneous
  token-native sum exists.
- Exact core delegation coherence, virtual Beacon Chain strategy identity,
  `numPods`, and burnable shares as diagnostics only. No native total exists.
- Six permanent null metrics and exactly six matching fresh gaps. Verified
  stale evidence may add exactly one `source_stale`; unavailable evidence has
  exactly one source failure gap and no partial evidence.
- Bounded summary/gap text, JavaScript-safe block number/timestamp, strict
  objects, and public `safeParse` rejection without overflow/malformed-input
  exceptions.

## Full offline verification

```text
Test Files  63 passed | 7 skipped (70)
Tests  742 passed | 9 skipped (751)
```

`npm run typecheck` and `npm run build` passed. No network, live test, push, or
other remote operation was performed.
