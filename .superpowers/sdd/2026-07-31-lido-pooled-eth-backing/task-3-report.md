# Task 3 — Lido public integration report

## Scope

Implemented only the public integration slice: the Lido tool, server
registration/dispatch, focused tool/server tests, default-skipped live test,
live npm script, README/CONTEXT updates, and this report. No existing Aave,
Spark, or ETH value-capture arithmetic was changed. No live RPC request, push,
or other network operation was performed.

## RED

Tool tests were created before the tool module:

```text
$ npm test -- tests/tools/get_lido_pooled_eth_backing.test.ts

FAIL  tests/tools/get_lido_pooled_eth_backing.test.ts
Error: Failed to load url ../../src/tools/get_lido_pooled_eth_backing.js
Does the file exist?

Test Files  1 failed (1)
Tests  no tests
```

After the tool boundary was green, server registration/dispatch regressions
were added before server wiring:

```text
$ npm test -- tests/server.test.ts

2 failed | 31 passed (33)

Expected: get_lido_pooled_eth_backing
Received: registry without get_lido_pooled_eth_backing

Expected: strict empty-object input schema
Received: undefined
```

## GREEN

`get_lido_pooled_eth_backing` accepts only an empty public object through the
server and passes only internal `ctx.env.ethereumRpcUrl` to the adapter. It
revalidates the strict domain snapshot, removes an upstream summary, and emits
English/Korean verified, stale, and unavailable summaries that explicitly say
Lido pooled ETH backing without relabeling it as broader stake, lock,
collateral, or combined demand.

The server now registers the exact 13th tool name with
`additionalProperties: false`. README/CONTEXT document the narrow methodology,
official v4.0.0 commit/proxy, two batch/nine-call bound, internal credential
seam, null boundaries, and live command. The live test is default skipped and
requires both `RUN_LIVE_LIDO_BACKING=1` and a nonblank `ETHEREUM_RPC_URL`.

```text
$ npm test -- tests/tools/get_lido_pooled_eth_backing.test.ts tests/server.test.ts tests/live/lido_pooled_eth_backing.live.test.ts
Test Files  2 passed | 1 skipped (3)
Tests  36 passed | 1 skipped (37)

$ npm run typecheck
> tsc --noEmit
```

## Final verification

```text
$ npm test
Test Files  57 passed | 6 skipped (63)
Tests  683 passed | 8 skipped (691)

$ npm run typecheck
> tsc --noEmit

$ npm run build
ESM Build success
DTS Build success

$ git diff --check
(no output)
```

The six skipped files are default-skipped live suites, including the new Lido
suite. `npm run test:live:lido-backing` was intentionally not run.
