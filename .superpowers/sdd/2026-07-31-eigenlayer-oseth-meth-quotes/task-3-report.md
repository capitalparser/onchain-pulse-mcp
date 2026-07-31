# Task 3: Public Contract, Documentation, and Disabled-by-Default Live Gate

## Scope

- Updated only the existing `get_eigenlayer_lst_eth_quotes` public summaries,
  its existing server description, public/server/live tests, `README.md`, and
  `CONTEXT.md`.
- Preserved strict empty input, internal `hc.env.ethereumRpcUrl` transport
  ownership, and the existing 16-tool inventory. No adapter/domain, package,
  registration, live RPC, push, or PR change was made.

## RED evidence

Before public production edits:

```text
npm test -- tests/tools/get_eigenlayer_lst_eth_quotes.test.ts tests/server.test.ts tests/live/eigenlayer_lst_eth_quotes.live.test.ts
exit 1; 3 failed, 36 passed, 1 skipped
```

The two public-tool failures were the old three-token English/Korean summaries;
the server failure was the old `3 of 12` description. The disabled live-gate
test passed and the live body remained skipped, so no live request was made.

## GREEN evidence

The public summaries now state bounded direct protocol-accounting 5-of-12
coverage for stETH/rETH/cbETH/osETH/mETH, preserve the two distinct partial
sums, deny all broader measures, and are asserted at at most 500 characters.
Unavailable summaries say no quotes were observed.

```text
npm test -- tests/tools/get_eigenlayer_lst_eth_quotes.test.ts tests/server.test.ts tests/live/eigenlayer_lst_eth_quotes.live.test.ts
exit 0; 39 passed, 1 skipped

npm test -- tests/eigenlayer_lst_eth_quotes/types.test.ts tests/eigenlayer_lst_eth_quotes/metrics.test.ts tests/adapters/eigenlayer_eth_restaking_rpc.test.ts tests/adapters/eigenlayer_lst_eth_quotes_rpc.test.ts
exit 0; 76 passed

npm run typecheck
exit 0

npm run build
exit 0

npm test
exit 0; 825 passed, 11 skipped

git diff --check
exit 0
```

The revised live test retains the dual opt-in gate
`RUN_LIVE_EIGENLAYER_LST_ETH_QUOTES=1` plus nonblank `ETHEREUM_RPC_URL`. In
the default run it asserts an unavailable no-RPC snapshot and zero transport
calls; the live body was not executed.
