# Task 2 — Finalized EigenLayer RPC adapter

## Scope and official source boundary

Implemented the read-only finalized RPC adapter on approved Task 1 commit
`51432903b14a901886f22f70b2291474653cfc89`. Contract identities, functions,
and accounting semantics remain pinned to EigenLayer's official
`Layr-Labs/eigenlayer-contracts` `v1.12.0` commit
`d302f65042164c8d8d0a983c1540d85a8710030b`:

- [official deployment README](https://github.com/Layr-Labs/eigenlayer-contracts/blob/d302f65042164c8d8d0a983c1540d85a8710030b/README.md)
- [official mainnet address configuration](https://github.com/Layr-Labs/eigenlayer-contracts/blob/d302f65042164c8d8d0a983c1540d85a8710030b/script/configs/mainnet/mainnet-addresses.config.json)
- [official StrategyManager interface](https://github.com/Layr-Labs/eigenlayer-contracts/blob/d302f65042164c8d8d0a983c1540d85a8710030b/src/contracts/interfaces/IStrategyManager.sol)
- [official strategy interface](https://github.com/Layr-Labs/eigenlayer-contracts/blob/d302f65042164c8d8d0a983c1540d85a8710030b/src/contracts/interfaces/IStrategy.sol)
- [official EigenPodManager interface](https://github.com/Layr-Labs/eigenlayer-contracts/blob/d302f65042164c8d8d0a983c1540d85a8710030b/src/contracts/interfaces/IEigenPodManager.sol)
- [official StrategyBase share conversion](https://github.com/Layr-Labs/eigenlayer-contracts/blob/d302f65042164c8d8d0a983c1540d85a8710030b/src/contracts/strategies/StrategyBase.sol#L218-L226)

The adapter preserves token custody and the strategy share-accounting quote as
independent token-native observations. A quote above custody is valid evidence
and is surfaced through the Task 1 diagnostic; it is not treated as withdrawal
capacity and does not fail the snapshot.

## RED → GREEN evidence

The first public no-RPC tracer was written before the adapter module and
produced this literal RED:

```text
FAIL  tests/adapters/eigenlayer_eth_restaking_rpc.test.ts
Error: Failed to load url ../../src/adapters/eigenlayer_eth_restaking_rpc.js
(resolved id: ../../src/adapters/eigenlayer_eth_restaking_rpc.js) ... Does the file exist?
Test Files  1 failed (1)
Tests  no tests
```

After the no-RPC GREEN, the successful finalized-contract tracer failed before
the four-batch implementation:

```text
AssertionError: expected { status: 'unavailable', … } to match object { status: 'verified', … }
Test Files  1 failed (1)
Tests  1 failed | 1 passed (2)
```

The first happy-path implementation remained RED because ABI address words are
lowercase while Task 1 requires exact fixed checksum constants after identity
verification:

```text
AssertionError: expected { status: 'unavailable', … } to match object { status: 'verified', … }
Test Files  1 failed (1)
Tests  1 failed | 1 passed (2)
```

The fix verifies decoded addresses case-insensitively, then records only the
approved fixed constants. Runtime underlying-token addresses remain their
observed nonzero ABI values.

The verified-only-cache tracer then exposed an early duplicate-token rejection
that prevented the final Task 1 assertion from owning complete evidence:

```text
FAIL  ... > does not cache evidence rejected by the final Task 1 domain assertion
AssertionError: expected { status: 'verified', … } to match object { status: 'unavailable', … }
Test Files  1 failed (1)
Tests  1 failed | 30 passed (31)
```

Uniqueness is now asserted by the complete Task 1 builder after all four
batches and before freezing or cache insertion. Repeating the same invalid
fresh evidence performs eight batch calls across two attempts and never
creates a cache hit. A separate repeated 257-bit final-batch scalar test proves
overflowed evidence cannot create a cache hit either.

Final focused GREEN:

```text
Test Files  1 passed (1)
Tests  34 passed (34)
```

## Enforced RPC contract

- Exactly four batches and 91 globally unique sequential numeric request IDs:
  `[2, 5, 48, 36]`.
- Exactly 89 `eth_call` requests use the same numeric finalized block tag. The
  virtual Beacon Chain ETH strategy is verified from EigenPodManager and is
  never called as a contract target.
- Exact selectors: `df5cf723`, `ea4d3c9b`, `9104c319`, `a6a509be`,
  `f5d4fed3`, `663c1de4`, `39b70e38`, `2495a599`, `3a98ef39`,
  `313ce567`, `70a08231`, and `7a8b2637`.
- Exact JSON-RPC response count/id set and envelopes containing only `id`,
  `jsonrpc`, and `result`; canonical quantities/hashes; safe block values;
  one-word ABI data; high-zero addresses; strict 0/1 booleans; and uint8
  decimals across the full 0–255 range.
- Exact fixed core and StrategyManager identities, ordered strategies,
  nonzero unique runtime tokens, preserved whitelist `false`, uint256 shares,
  custody, and independent share-accounting quotes.
- Missing configuration performs no request. Configured failures map to one
  bounded access/chain/finality/schema/evidence gap with no partial evidence or
  provider text.
- One provider per adapter context, provider-independent constant cache key,
  30-minute TTL, max-one cache, concurrent-load coalescing, and verified-only
  stale fallback.

## Full offline verification

```text
Test Files  64 passed | 7 skipped (71)
Tests  776 passed | 9 skipped (785)
```

`npm run typecheck` and `npm run build` passed. No network, live test, push, or
other remote operation was performed.
