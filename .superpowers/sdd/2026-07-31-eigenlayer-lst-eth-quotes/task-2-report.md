# Task 2 — Finalized EigenLayer covered LST quote composition

## Scope and official source boundary

Implemented only the shared fresh verifier, combined RPC adapter, adapter
regressions, and this report on corrected Task 1 documentation head
`fc3c5c9d2521f0b1786a07f228709b43c625a95f`.

The existing 91-request EigenLayer verification remains pinned to official
`Layr-Labs/eigenlayer-contracts` `v1.12.0` commit
`d302f65042164c8d8d0a983c1540d85a8710030b`. Quote calls remain pinned to:

- [Lido StETH v4.0.0](https://github.com/lidofinance/core/blob/17005714f151e5502c559932319a3f2f74ac2436/contracts/0.4.24/StETH.sol)
- [Rocket Pool RocketTokenRETH](https://github.com/rocket-pool/rocketpool/blob/fef41a4f7cf99d7d66313c0ba04deb8ba2dabf88/contracts/contract/token/RocketTokenRETH.sol)
- [Coinbase StakedTokenV1](https://github.com/coinbase/wrapped-tokens-os/blob/5697a90f4c47e8d801cedce81444a8464019fe08/contracts/wrapped-tokens/staking/StakedTokenV1.sol)

No server, tool, package, README, CONTEXT, or domain file changed.

## RED -> GREEN evidence

The no-configuration tracer was written before the adapter module and produced
this literal missing-adapter RED:

```text
FAIL  tests/adapters/eigenlayer_lst_eth_quotes_rpc.test.ts
Error: Failed to load url ../../src/adapters/eigenlayer_lst_eth_quotes_rpc.js
(resolved id: ../../src/adapters/eigenlayer_lst_eth_quotes_rpc.js) ... Does the file exist?
Test Files  1 failed (1)
Tests  no tests
```

After the atomic no-RPC shell became GREEN, the first complete cold-path
tracer failed before composition:

```text
expected { status: 'unavailable', … } to match object { status: 'verified', … }
Test Files  1 failed (1)
Tests  1 failed | 1 passed (2)
```

The existing-adapter regression then exposed a provider-authority bypass in
the first fresh-only seam:

```text
expected { status: 'verified', … } to match object { status: 'unavailable', … }
Test Files  1 failed (1)
Tests  1 failed | 34 skipped (35)
```

The first separate combined-provider map also poisoned its claim after public
provider A rejected combined provider B:

```text
expected 'unavailable' to be 'verified'
Test Files  1 failed (1)
Tests  1 failed | 23 skipped (24)
```

One shared base provider authority now governs public, fresh-only, and combined
calls. The mismatch performs no request and cannot poison the already accepted
provider. Concurrent A/B calls also admit only the first provider.

Final focused GREEN:

```text
Test Files  6 passed (6)
Tests  90 passed (90)
```

## Enforced transport and cache contract

- The exported fresh-only EigenLayer verifier shares the existing exact
  four-batch implementation. It performs 91 logical requests and 89
  `eth_call`s, never reads or writes the public base cache, and never returns
  stale fallback evidence.
- Existing public output, 30-minute cache, coalescing, stale fallback, and
  provider binding remain covered by 35 passing base-adapter regressions.
- A cold combined load performs exactly five batches with request counts
  `[2, 5, 48, 36, 3]`, globally ordered IDs 1 through 94, and 92 `eth_call`s
  using the same numeric finalized block tag.
- The quote batch contains only two official rETH proxy `getEthValue` calls
  with the exact aggregate share-accounting and custody amounts and one
  official cbETH proxy `exchangeRate` call. stETH conversion is local identity
  arithmetic and creates no RPC call.
- Exact covered label, strategy, token, and 18-decimal identities are checked
  before the quote batch. ABI-decoded lowercase addresses are compared
  case-insensitively, then only approved checksum constants are recorded.
- Quote responses require exact three-key JSON-RPC envelopes, exact id set and
  count, and one canonical uint256 ABI word. Provider bodies and private errors
  never enter output.
- Any base failure, identity mismatch, malformed envelope/scalar, missing or
  duplicate response, zero rate, 257-bit scalar, product overflow, or partial
  sum overflow returns one bounded atomic unavailable snapshot with no numbers.
- The combined adapter owns the only cache on this path. It caches only frozen,
  fully domain-verified combined evidence for 30 minutes, coalesces cold loads,
  clones every returned snapshot, and returns stale only from an expired fully
  verified combined entry.
- A warmed public base cache is neither read nor extended. The combined TTL
  starts only after a fresh 91-request base verification, quote batch, and final
  domain validation all complete.

## Full offline verification

```text
Test Files  68 passed | 8 skipped (76)
Tests  820 passed | 10 skipped (830)
```

`npm run typecheck` passed. No network request, live test body, push, or other
remote operation was performed.
