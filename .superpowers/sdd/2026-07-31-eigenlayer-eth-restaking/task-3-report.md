# Task 3 — Public EigenLayer restaking exposure tool

## Scope and official source boundary

Implemented the public read-only MCP tool on approved Task 2 documentation
head `8bdb66fb5344cf6ed8fa8263ac339e10616bea05`. The fixed mainnet core,
ordered twelve-strategy universe, functions, and accounting semantics remain
pinned to EigenLayer's official `Layr-Labs/eigenlayer-contracts` `v1.12.0`
commit `d302f65042164c8d8d0a983c1540d85a8710030b`.

The public tool accepts a strict empty object and obtains the RPC URL only from
the server environment. It preserves each LST strategy's token-native evidence
without aggregation, reports native-restaking diagnostics without constructing
a native total, and replaces the adapter summary with bounded English or Korean
wording. The summary explicitly denies native and ETH-equivalent totals,
unique/net locked ETH, combined protocol demand, rehypothecation, and executable
withdrawal capacity.

## RED -> GREEN evidence

The public tool tracer was written before its module and produced this literal
RED:

```text
FAIL  tests/tools/get_eigenlayer_eth_restaking_exposure.test.ts
Error: Failed to load url ../../src/tools/get_eigenlayer_eth_restaking_exposure.js
(resolved id: ../../src/tools/get_eigenlayer_eth_restaking_exposure.js) ... Does the file exist?
Test Files  1 failed (1)
Tests  no tests
```

After the first verified-only GREEN, the stale localization tracer produced
this literal RED before the stale/unavailable state wording was implemented:

```text
AssertionError: expected ... to contain 'used after refresh failure'
Test Files  1 failed (1)
Tests  1 failed | 1 passed (2)
```

The server registration and dispatch tracer was then written before wiring and
produced this RED:

```text
server tests: expected new 15-tool list but actual 14; tool inputSchema undefined
Test Files  1 failed | 1 passed (2)
Tests  2 failed | 35 passed (37)
```

Final focused GREEN, including the default-disabled live specification:

```text
Test Files  2 passed | 1 skipped (3)
Tests  37 passed | 1 skipped (38)
```

The live body was not executed. It requires both
`RUN_LIVE_EIGENLAYER_ETH_RESTAKING=1` and a nonblank `ETHEREUM_RPC_URL`.

## Enforced public contract

- Strict no-argument MCP schema and handler parsing; caller-supplied RPC fields
  and `null` are rejected.
- The handler uses only the internally loaded `ETHEREUM_RPC_URL`; missing
  configuration returns `rpc_not_configured` without a request.
- English and Korean verified, stale, and unavailable summaries explicitly
  identify fixed legacy EigenLayer ETH-family LST strategy token-unit exposure
  and native-restaking diagnostics, then state all required exclusions.
- Original adapter summary text is replaced at the public schema boundary, so
  provider URLs or credential-bearing text cannot pass through that field.
- The default-skipped live specification independently verifies the exact
  ordered twelve strategies, unique runtime tokens, uint8 decimals, boolean
  whitelist state, exact `share_quote_exceeds_custody` relation, no token-native
  aggregate, native diagnostics only, and all six permanent null metrics.
- Documentation records the exact source commit, four batches, 91 logical
  requests, 89 same-finalized-tag calls, no virtual Beacon strategy call,
  internal credential seam, and explicit live opt-in command.

## Full offline verification

```text
Test Files  65 passed | 8 skipped (73)
Tests  779 passed | 10 skipped (789)
```

`npm run typecheck` and `npm run build` passed. The focused public-tool,
server, and default-disabled live-spec run passed 37 tests and skipped the one
live test.

No network, live test body, push, or other remote operation was performed.
