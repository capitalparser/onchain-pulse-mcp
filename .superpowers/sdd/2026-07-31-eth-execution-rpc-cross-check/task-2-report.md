# Task 2: Strict bounded Execution JSON-RPC adapter

## Scope

Implemented Task 2 only from
`docs/superpowers/plans/2026-07-31-eth-execution-rpc-cross-check.md`:

- `src/adapters/eth_fee_rpc.ts`
- `tests/adapters/eth_fee_rpc.test.ts`

The adapter accepts the internal-only `rpcUrl` input. It does not read env,
register an MCP tool, modify the server, add documentation, or run a live
network test; those remain Task 3.

## RED evidence

Initial tests were written before `src/adapters/eth_fee_rpc.ts` existed and
were run with:

```bash
npx vitest run tests/adapters/eth_fee_rpc.test.ts
```

Vitest failed during module loading with the expected missing implementation:

```text
Failed to load url ../../src/adapters/eth_fee_rpc.js
Test Files  1 failed (1)
Tests  no tests
```

This covered the first two intended behaviors: no-config must avoid fetch and
shuffled paired JSON-RPC responses must associate by numeric id before exact
blob and non-blob arithmetic is exposed.

The expanded failure-path suite then exposed one invalid uppercase-hash fixture
(the prior fixture did not actually contain an `a` character). It was corrected
to a literal uppercase hexadecimal hash before the GREEN run; no production
behavior was changed for that test correction.

## GREEN and refactor verification

After the minimal strict transport, parsing, calculator delegation, and
verified-only cache implementation, the focused verification was:

```bash
npx vitest run tests/adapters/eth_fee_rpc.test.ts tests/eth_fee_cross_check
npm run typecheck
git diff --check
```

Results:

- Vitest passed: 3 files, 103 tests (25 Task 2 adapter tests and 78 Task 1
  domain tests).
- `tsc --noEmit` passed.
- `git diff --check` produced no whitespace errors.

The adapter tests use hand-derived, full JSON-RPC fixtures and cover: finalized
head gating; official methods/parameters; shuffled response association;
missing, duplicate, unexpected, and nonnumeric response ids; HTTP, JSON,
JSON-RPC, and thrown-fetch access failures; strict quantities, hashes, null
evidence, and paired blob fields; receipt evidence mismatch; 20-block chunking;
the 64-block defensive bound; `includeBlocks`; 30-minute cache reuse;
concurrent deduplication; stale verified fallback; and provider-URL/error-body
redaction.

## Intentional boundaries

- Finality is checked first with `eth_getBlockByNumber("finalized", false)`.
- Evidence batches contain only paired `eth_getBlockByNumber` and
  `eth_getBlockReceipts` calls, never per-transaction receipt fallbacks.
- All fee arithmetic is delegated to Task 1's bigint calculator.
- Failed or partially validated evidence is never cached; only a verified,
  finalized snapshot can become stale fallback evidence.

## QA hardening round: RED evidence

QA regression tests were added before the boundary fixes and run with:

```bash
npx vitest run tests/adapters/eth_fee_rpc.test.ts tests/eth_fee_cross_check/metrics.test.ts
```

The pre-fix suite reported 10 expected failures out of 81 tests. The failures
proved that a string `includeBlocks` value reached cached transport work,
malformed RPC URL values were treated as configured, same-context provider
changes reused cached evidence, primitive/missing JSON-RPC envelopes were
misclassified as schema drift, and a zero-valued receipt blob pair was accepted
when the block omitted `blobGasUsed`.

## QA hardening round: GREEN and verification

The narrowly scoped fix changed the Task 2 adapter and its tests, plus Task
1's calculator and calculator regression test to preserve blob-field presence.
The final focused verification was:

```bash
npx vitest run tests/adapters/eth_fee_rpc.test.ts tests/eth_fee_cross_check
npm run typecheck
git diff --check
```

Results:

- Vitest passed: 3 files, 116 tests (37 adapter tests and 79 Task 1 tests).
- `tsc --noEmit` passed.
- `git diff --check` produced no whitespace errors.

The adapter now rejects non-boolean `includeBlocks` before provider binding,
cache lookup, or fetch; treats blank/non-string RPC configuration as absent;
and binds each `AdapterContext` to its first valid provider in a module
`WeakMap`. A different provider on that same context fails closed before cache
access, including during concurrent first calls, while a new context may bind a
new provider. The binding stores only the configured value in memory and does
not put it in cache keys, snapshots, gaps, or logs.
