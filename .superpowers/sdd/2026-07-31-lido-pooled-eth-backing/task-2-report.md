# Task 2 — Finalized Lido RPC adapter report

## Scope

Created only:

- `src/adapters/lido_pooled_eth_rpc.ts`
- `tests/adapters/lido_pooled_eth_rpc.test.ts`
- this report

No tool/server/docs/live-test files were modified, and no RPC request, push, or
other live network operation was performed.

## RED

The focused adapter tests were written before the module existed:

```text
$ npm test -- tests/adapters/lido_pooled_eth_rpc.test.ts

FAIL  tests/adapters/lido_pooled_eth_rpc.test.ts
Error: Failed to load url ../../src/adapters/lido_pooled_eth_rpc.js
Does the file exist?

Test Files  1 failed (1)
Tests  no tests
```

## GREEN

Implemented the fixed two-batch transport (2 + 7 requests), canonical envelope
and id validation, canonical mainnet/finalized-block validation, exact ABI-word
decoding, and Task 1 domain translation. The adapter pins the official proxy
and seven selectors, passes one exact finalized block tag to every contract
call, includes raw external ether, and fails closed on any incomplete evidence.

Per-context provider binding holds the URL only in a `WeakMap`; cache keys do
not include it. The cache retains only evidence that has already passed the
Task 1 domain builder. Fresh and stale snapshots are rebuilt through that same
builder, so an unavailable result never includes a partial block, accounting,
identity, or observed metric.

```text
Test Files  1 passed (1)
Tests  15 passed (15)

$ npm run typecheck
> tsc --noEmit
```

Focused regressions cover absent configuration, malformed/extra envelopes,
duplicate/missing/unknown ids, short scalar and tuple words, wrong chain, null
finality, identity mismatch, provider binding, cache coalescing, stale fallback,
and bounded failure output without provider details.

## Final verification

```text
$ npm test
Test Files  56 passed | 5 skipped (61)
Tests  679 passed | 7 skipped (686)

$ npm run typecheck
> tsc --noEmit

$ npm run build
ESM Build success
DTS Build success

$ git diff --check
(no output)
```

The skipped tests are default-skipped pre-existing live tests. No Lido live
test or provider request was executed.
