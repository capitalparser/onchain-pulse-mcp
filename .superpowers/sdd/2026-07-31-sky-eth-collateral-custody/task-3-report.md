# Task 3 — Sky ETH adapter custody tool SDD report

## Scope

Expose the existing finalized, read-only legacy Maker/Sky ETH-family
adapter-held-token-custody domain through the MCP server. The public tool has a
strict empty-object input schema and receives `ethereumRpcUrl` only from the
server environment. It does not accept an RPC URL from a caller.

## RED

Before the tool module and server wiring existed, I added the focused tool,
server, and opt-in live-gate tests and ran:

```bash
npm test -- tests/tools/get_sky_eth_collateral_custody.test.ts tests/server.test.ts tests/live/sky_eth_collateral_custody.live.test.ts
```

The run failed as intended. The two new test files reported the literal module
load failure:

```text
Error: Failed to load url ../../src/tools/get_sky_eth_collateral_custody.js
(resolved id: ../../src/tools/get_sky_eth_collateral_custody.js). Does the file exist?
```

The server inventory test also failed because the actual tool count was 13
while the new contract required 14, and `get_sky_eth_collateral_custody` had no
handler. No live test was executed.

## GREEN

Implemented the thin localizer at
`src/tools/get_sky_eth_collateral_custody.ts`, registered it in `src/server.ts`,
and kept the adapter RPC configuration server-internal. The tool preserves the
domain snapshot and only localizes the status summary. Each English and Korean
verified, stale, and unavailable wording explicitly identifies legacy
Maker/Sky ETH-family adapter-held token custody and excludes active Vault
collateral, actual user collateral, unique/net locked ETH, combined
Aave/Spark/Lido/Sky demand, and rehypothecation.

Focused verification then passed:

```text
Test Files  2 passed | 1 skipped (3)
Tests  37 passed | 1 skipped (38)
```

The skipped test is `tests/live/sky_eth_collateral_custody.live.test.ts`; its
body is gated by both `RUN_LIVE_SKY_ETH_CUSTODY=1` and a nonblank
`ETHEREUM_RPC_URL`. It was not executed in this task.

Full offline verification also passed:

```text
Test Files  61 passed | 7 skipped (68)
Tests  727 passed | 9 skipped (736)
```

`npm run typecheck`, `npm run build`, and `git diff --check` passed after the
full suite.

## Source and scope boundaries

- The tool exposes legacy Maker/Sky adapter-held token custody only, not active
  Vault collateral or actual user collateral.
- The five permanent metrics remain `null` with explicit gaps:
  active Vault collateral, actual user collateral, unique/net ETH locked,
  combined Aave/Spark/Lido/Sky demand, and rehypothecation ratio.
- The documented verifier keeps the existing bounded official-resolution path:
  fixed mainnet Chainlog, runtime-resolved contracts at one finalized block,
  four batches, and 50 logical requests.
- No network or live test was executed, and no remote state was changed.
