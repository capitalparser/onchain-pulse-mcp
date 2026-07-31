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
