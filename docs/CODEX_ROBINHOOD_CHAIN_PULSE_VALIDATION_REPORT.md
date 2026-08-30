# Robinhood Chain Pulse Repair Validation Report

## Decision

**Status: `ready_for_owner_review`**

The implementation is ready for owner review, not merge. The six original blockers and the five boundedness issues found during independent follow-up review are repaired and covered by regressions. No PR merge, deployment, or GitHub Actions run is part of this validation.

## Repository identity

| Field | Value |
|---|---|
| Repository | `capitalparser/onchain-pulse-mcp` |
| Worktree | `/Users/kjun/orca/workspaces/onchain-pulse-mcp/cormorant` |
| Branch | `feat/robinhood-chain-pulse` |
| Base | `main` at `1c5658dbb124a06ad084f66915d29641b812de08` |
| Validated implementation commit | `e1f37091db2a3a2352e8d678bdb023d8d6f09b88` |
| Node.js | `v24.15.0` |
| npm | `11.12.1` |
| Original ZIP SHA-256 | `aacc59bb3291e7e30c162ccc3fd45d8c81e3ab8e5b7640a030fc49e13162703c` |
| Patch SHA-256 | `0925e32670826f76227dd6b2810a7fe9fde104a00df57cef75bd48a91d9d2165` |

The original ZIP remained unchanged. The patch was applied only to the current Codex-managed linked worktree; no separate clone or worktree was created.

## Required gates

| Gate | Result | Evidence |
|---|---|---|
| Clean install | PASS | `npm ci`; 202 packages installed and audited |
| Full typecheck | PASS | `npm run typecheck`; `tsc --noEmit` exit 0 |
| Full tests | PASS | `npm test`; 100 files passed, 8 skipped; 1005 tests passed, 11 skipped |
| Production build | PASS | `npm run build`; ESM and DTS builds succeeded |
| Morpho 101-market pagination | PASS | 101 rows aggregated in two calls using `first: 100`, `skip: 0, 100` |
| Morpho page bounds | PASS | changing totals, duplicate IDs, totals over 1,000, and 101-row pages claiming a 100-row limit fail closed |
| Missing collateral | PASS | valid supply/borrow/liquidity retained; `collateral_usd: null`, `partial`, one aggregated `collateral_value_gap` |
| Symbol coverage/order | PASS | 101 unique symbols remain within the 1,000-market bound; case-folded deterministic order produces `USDe`, `USDG` |
| Three stale fallbacks | PASS | DefiLlama, Morpho, and community TTL-expiry refresh failures return marked stale cache data |
| Partial-cache status preservation | PASS | only cached `ok` sources become `stale`; cached `unavailable` and `schema_drift` remain unchanged |
| Explorer breadth gate | PASS | unavailable explorer metadata leaves holder count null, token partial, and `eligible_for_breadth: false` |
| MCP registration | PASS | `get_robinhood_chain_pulse` appears in `tools/list` with a strict empty-object schema |
| MCP strict input | PASS | real in-memory MCP transport rejects extra input with bounded `{ "error": "invalid_arguments" }` |
| CLI live smoke | PASS | live CLI exited 0 and returned a schema-valid fail-closed snapshot |
| Credential/raw payload leakage | PASS | changed source scan found no env/API-key/auth handling; transport regression rejects internal Zod details and caller key names |
| GitHub Actions | NOT RUN | Local Node 24 verification is authoritative for this repair |
| Merge | NOT RUN | Owner review is required before merge |

## Repaired behavior

1. Morpho symbols use a case-folded codepoint comparator with an exact-value tie-breaker.
2. A total adapter refresh failure throws inside the cache loader. Stale cache data is returned as partial when available; otherwise the public adapter returns bounded unavailable data.
3. Missing `collateralAssetsUsd` never becomes zero. Missing collateral rows are counted into one bounded gap, while other valid USD fields remain aggregated.
4. DexScreener data cannot substitute for Blockscout verification. Explorer failure excludes that token from breadth and prevents three-token diffusion classification.
5. Morpho pages use `first: 100` and increasing `skip`, validate `pageInfo`, reject duplicates and inconsistent totals, reject oversized pages, and stop at an explicit 1,000-market limit with `pagination_limit`.
6. The MCP server registers `get_robinhood_chain_pulse` with `{ "type": "object", "properties": {}, "additionalProperties": false }`. The handler also enforces the contract and returns stable error codes rather than internal exception text.

## Live smoke evidence

The live CLI was run with:

```text
node --import tsx src/index.ts robinhood-chain-pulse
```

Observed on 2026-08-31 KST:

```text
phase: credit_activation
confidence: 0.70
capital_base: unknown
credit_activation: active
speculative_breadth: thin_data
eth_capture: protocol_link_present_unquantified
Morpho listed_market_count: 4
Morpho source_status: ok
eligible_count: 0
CASHCAT / STONKBROKER / MANCER: data_status=partial, holder_count=null, eligible_for_breadth=false
all three Blockscout source_status values: unavailable
stale_data: []
```

This is the expected fail-closed outcome for the current live Blockscout failure. It does not produce `leader_beta_diffusion`. ETH gas and Ethereum settlement/DA remain a protocol link only; L1 rent and ETH collateral usage are not inferred.

## Validation commands

```text
node --version
npm --version
npm ci
npm run typecheck
npm test
npm run build
npx vitest run tests/robinhood_chain_pulse/morpho.test.ts tests/robinhood_chain_pulse/defillama.test.ts tests/robinhood_chain_pulse/community.test.ts tests/robinhood_chain_pulse/metrics.test.ts tests/server.test.ts --reporter=verbose
node --import tsx src/index.ts robinhood-chain-pulse
git diff --check 1c5658dbb124a06ad084f66915d29641b812de08..HEAD
```

The focused suite passed 68/68 tests before the final full suite. The full suite includes actual in-memory MCP transport coverage, the two-call 101-market regression, 101 unique asset symbols, 101 missing-collateral rows collapsed to one gap, three adapter stale fallbacks, partial-cache source status preservation, and explorer-gated breadth.

## Unresolved risks and boundaries

- The live Robinhood Blockscout endpoint was unavailable for all three registered community tokens. This lowers breadth coverage safely; it is not treated as a successful verification.
- Provider availability and schemas can change. Bounded gaps and stale-cache behavior reduce false certainty but do not replace monitoring.
- The community-token universe remains an explicit research registry and is not an official Robinhood affiliation claim.
- Stock-token collateral classification remains null until an effective-dated official registry is consumed.
- `npm ci` reports 14 dependency advisories (1 low, 5 moderate, 7 high, 1 critical). They pre-existed this feature's dependency graph and require a separate dependency-remediation review.
- This report validates code and live source handling; it does not authorize merge, release, or deployment.
