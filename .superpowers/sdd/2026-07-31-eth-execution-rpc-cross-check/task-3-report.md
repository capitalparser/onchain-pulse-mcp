# Task 3: MCP integration, environment boundary, docs, and live gate

## Scope

Implemented only Task 3 from
`docs/superpowers/plans/2026-07-31-eth-execution-rpc-cross-check.md`:

- `src/env.ts`
- `src/server.ts`
- `src/tools/get_eth_fee_cross_check.ts`
- `tests/env.test.ts`
- `tests/server.test.ts`
- `tests/tools/get_eth_fee_cross_check.test.ts`
- `tests/live/eth_fee_cross_check.live.test.ts`
- `package.json`
- `README.md`

The existing Task 1 exact domain and Task 2 bounded RPC adapter were not
changed. No live network command was run.

## RED evidence

Tests were added before the Task 3 production wiring and run with:

```bash
npx vitest run tests/env.test.ts tests/server.test.ts tests/tools/get_eth_fee_cross_check.test.ts
```

The expected result was 10 failures and one missing-module suite. The concrete
failures showed `ethereumRpcUrl` was `undefined`, the ninth tool and its JSON
schema were absent, and `handleEthFeeCrossCheck` was not a function. The tool
suite failed to load the missing
`src/tools/get_eth_fee_cross_check.ts` module. This demonstrated that the
tests were exercising missing Task 3 behavior, not existing adapter behavior.

## GREEN and refactor verification

After minimal environment, server, pure localization-boundary, live-gate, and
documentation changes, the focused checks were:

```bash
npx vitest run tests/env.test.ts tests/server.test.ts tests/tools/get_eth_fee_cross_check.test.ts
npx vitest run tests/eth_fee_cross_check tests/adapters/eth_fee_rpc.test.ts
```

Results:

- Task 3 focused suite passed: 3 files, 32 tests.
- Task 1 and Task 2 focused suite passed: 3 files, 116 tests.

Coverage proves the internal-only environment field, nine-tool registration,
exact JSON schema requirements/default/range bounds, strict invalid input,
no-config behavior without fetch, mocked finalized RPC verification, optional
block rows, English/Korean/stale localization, output schema validation, and
provider URL non-leakage. The live suite is skipped by default and requires
both `RUN_LIVE_ETH_RPC=1` and `ETHEREUM_RPC_URL` before it can make a
read-only request.

## Final evidence-gap fix round

This follow-up changes only the Task 2 adapter/test boundary, Task 3 live
preflight and server fixture, Task 3 report, and the execution-RPC design and
README methodology notes. It also adds this previously untracked Task 1 report
to version control so the worktree is clean after the fix commit.

### RED evidence

Before production changes, the added adapter regressions were run with:

```bash
npx vitest run tests/adapters/eth_fee_rpc.test.ts
```

The result was 3 expected failures out of 42 tests: a post-Dencun block with
no `blobGasUsed` was incorrectly verified, and the sanitized finalized-head
helper was absent for the credential-bearing fetch-failure and whitespace-URL
tests. No live network request was run.

### GREEN evidence

The adapter now parses the canonical block timestamp and, at mainnet Dencun
timestamp `1710338135`, requires a canonical `blobGasUsed` field including
explicit `0x0`. It preserves pre-Dencun omission only where receipts have no
blob fields. The exported finalized-head helper shares provider binding and
strict response parsing while exposing only bounded error codes, never the URL
or provider response text. The opt-in live suite calls that helper instead of
`ctx.fetch` directly and trims the URL gate.

Final commands for this round were:

```bash
npx vitest run tests/eth_fee_cross_check tests/adapters/eth_fee_rpc.test.ts \
  tests/env.test.ts tests/server.test.ts tests/tools/get_eth_fee_cross_check.test.ts
npx vitest run tests/live/eth_fee_cross_check.live.test.ts
npm test
npm run typecheck
npm run build
git diff --check
```

Results: the Task 1/2/3 focused suite passed 153 tests; the dedicated live
suite skipped its one test because neither live gate was enabled; the full
suite passed 402 tests with 4 opt-in live tests skipped; typecheck, build, and
diff check passed. No live network request was run.
