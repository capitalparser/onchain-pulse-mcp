# Task 3 — Public EigenLayer covered LST ETH quote tool

## Scope

Implemented the public localization boundary, strict-empty MCP registration,
default-disabled live verifier, package script, README/CONTEXT contracts, and
this report on Task 2 head `8fd1c48305c26f0bef3f69abe7204a954ba8dd00`.

The public tool is `get_eigenlayer_lst_eth_quotes`. Its handler parses the raw
input as a strict empty object and passes only `hc.env.ethereumRpcUrl` to the
existing combined adapter. Caller-supplied URLs and `null` are rejected.

## RED -> GREEN evidence

The first public-tool tracer was written before the module and produced this
literal missing-tool RED:

```text
FAIL  tests/tools/get_eigenlayer_lst_eth_quotes.test.ts
Error: Failed to load url ../../src/tools/get_eigenlayer_lst_eth_quotes.js
(resolved id: ../../src/tools/get_eigenlayer_lst_eth_quotes.js) ... Does the file exist?
Test Files  1 failed (1)
Tests  no tests
```

The smallest schema/sanitization boundary then passed 1 of 1 tests. Adding the
six EN/KO verified, stale, and unavailable summary cases produced the expected
localization RED:

```text
expected 'Exact finalized stETH/rETH/cbETH acco…' to contain
'verified at a finalized Ethereum block'
Test Files  1 failed (1)
Tests  1 failed | 1 passed (2)
```

After status localization and all measurement denials were implemented, the
tool suite passed 2 of 2 tests.

The server inventory and dispatch tracers were written before registration and
failed literally at both required boundaries:

```text
expected [ …(15) ] to deeply equal [ …(16) ]
expected undefined to deeply equal { type: 'object', properties: {}, additionalProperties: false }
Test Files  1 failed (1)
Tests  2 failed | 34 passed (36)
```

After exact registration and internal-only dispatch, the server suite passed
36 of 36 tests. Final focused verification, with the live body disabled, was:

```text
Test Files  2 passed | 1 skipped (3)
Tests  38 passed | 1 skipped (39)
```

## Public contract

- All EN/KO verified, stale, and unavailable summaries replace adapter text,
  state exact finalized stETH/rETH/cbETH quotes cover only 3 of 12 fixed legacy
  strategies, and distinguish covered share-accounting from token-custody
  partial ETH-equivalent sums.
- Every summary denies full LST/native/EigenLayer totals, unique/net locked ETH,
  combined Aave/Spark/Lido/Sky/EigenLayer demand, rehypothecation, issuer
  backing reconciliation, rate freshness, and executable withdrawal capacity.
- Inventory is exactly 16 tools. The new input schema is
  `{ type: "object", properties: {}, additionalProperties: false }`.
- The live verifier requires both
  `RUN_LIVE_EIGENLAYER_LST_ETH_QUOTES=1` and a nonblank `ETHEREUM_RPC_URL`.
  It independently asserts the exact three identities and quote kinds, stETH
  identity arithmetic, direct rETH quote shape, cbETH floor arithmetic and
  freshness gap, both recomputed partial sums, exact 3-of-12 coverage and nine
  unquoted labels, and all seven broader nulls.
- README and CONTEXT pin the EigenLayer, Lido, Rocket Pool, and Coinbase source
  commits, all three token/proxy addresses, exact conversion semantics,
  5-batch/94-logical/92-`eth_call` cold counts at one finalized tag, combined
  fresh-only cache boundary, two partial metric names, and seven broader nulls.

## Fresh verification

```text
npm run typecheck: passed
npm run build: passed (ESM and DTS)
Test Files  69 passed | 9 skipped (78)
Tests  823 passed | 11 skipped (834)
git diff --check: passed
```

No network request, live test body, push, PR, or other remote operation was
performed. The exact containing commit SHA and clean worktree status are
reported after the commit, because a commit cannot embed its own SHA.
