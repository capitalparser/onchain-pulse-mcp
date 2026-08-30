# Robinhood Chain Pulse Repair Validation Report

## Decision

**Status: `ready_for_owner_review`**

The implementation is ready for a new owner review, not merge. The six original blockers, five boundedness issues, and the three evidence-semantics blockers recorded on PR #53 are repaired and covered by regressions. No PR merge, deployment, or GitHub Actions run is part of this validation.

## Repository identity

| Field | Value |
|---|---|
| Repository | `capitalparser/onchain-pulse-mcp` |
| Worktree | `/Users/kjun/orca/workspaces/onchain-pulse-mcp/cormorant` |
| Branch | `feat/robinhood-chain-pulse` |
| Base | `main` at `1c5658dbb124a06ad084f66915d29641b812de08` |
| Validated implementation commit | `ed17262ffa0ae06528fd91410d093c18f816e9c6` |
| Node.js | `v24.15.0` |
| npm | `11.12.1` |
| Original ZIP SHA-256 | `aacc59bb3291e7e30c162ccc3fd45d8c81e3ab8e5b7640a030fc49e13162703c` |
| Patch SHA-256 | `0925e32670826f76227dd6b2810a7fe9fde104a00df57cef75bd48a91d9d2165` |

The original ZIP remained unchanged. The patch was applied only to the current Codex-managed linked worktree; no separate clone or worktree was created.

The stablecoin source contract follows the [official DefiLlama API SDK](https://github.com/DefiLlama/api-sdk#stablecoins), which separates current chain totals (`getChains`) from chain history (`getChartsByChain`). Live calls confirmed the free endpoints and the history row shape before implementation.

## Required gates

| Gate | Result | Evidence |
|---|---|---|
| Clean install | PASS | `npm ci`; 202 packages installed and audited |
| Full typecheck | PASS | `npm run typecheck`; `tsc --noEmit` exit 0 |
| Full tests | PASS | `npm test`; 100 files passed, 8 skipped; 1018 tests passed, 11 skipped |
| Production build | PASS | `npm run build`; ESM and DTS builds succeeded |
| Morpho 101-market pagination | PASS | 101 rows aggregated in two calls using `first: 100`, `skip: 0, 100` |
| Morpho page bounds | PASS | changing totals, duplicate IDs, totals over 1,000, and 101-row pages claiming a 100-row limit fail closed |
| Missing collateral | PASS | valid supply/borrow/liquidity retained; `collateral_usd: null`, `partial`, one aggregated `collateral_value_gap` |
| Symbol coverage/order | PASS | 101 unique symbols remain within the 1,000-market bound; case-folded deterministic order produces `USDe`, `USDG` |
| Stablecoin 7-day source | PASS | real-shape `stablecoinchains` current stock plus `stablecoincharts/Robinhood%20Chain` history; no synthetic current-row change field |
| Stablecoin UTC cutoffs | PASS | latest observations at or before current UTC cutoff and cutoff minus 604,800 seconds; malformed future rows are ignored before supply validation; missing/zero baseline remains null and partial |
| Credit phase semantics | PASS | unknown/stable capital plus active current credit cannot activate the phase; expanding capital plus active current credit can; two unavailable families become `data_warning` first |
| Utilisation bounds | PASS | provider values outside `[0,1]` and borrow/supply inconsistencies make utilisation null and partial; only explicit rounding tolerance is accepted |
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
7. Stablecoin 7-day change is calculated from DefiLlama chain history using exact UTC cutoffs. Current stock is preserved when history fails, while the trend remains null and the adapter becomes partial.
8. `credit_activation` now requires expanding capital plus an active current Morpho credit state. The summary no longer claims credit growth; it says historical confirmation is still required. Two unavailable source families take `data_warning` precedence.
9. Provider utilisation is range checked, and borrow above supply is accepted only within `max(USD 0.01, supply × 1e-9)` for positive supply. Inconsistent data produces null utilisation and cannot activate credit.

## Live smoke evidence

The live CLI was run with:

```text
node --import tsx src/index.ts robinhood-chain-pulse
```

Observed on 2026-08-31 KST:

```text
phase: credit_activation
confidence: 0.70
capital_base: expanding
credit_activation: active
speculative_breadth: thin_data
eth_capture: protocol_link_present_unquantified
stablecoin_supply_usd: 776092179.82
stablecoin_change_7d_pct: 7.82
Morpho supply_usd: 456374311.30
Morpho borrow_usd: 414999538.10
Morpho utilisation: 0.9093
Morpho listed_market_count: 4
Morpho source_status: ok
eligible_count: 0
CASHCAT / STONKBROKER / MANCER: data_status=partial, holder_count=null, eligible_for_breadth=false
all three Blockscout source_status values: unavailable
stale_data: []
```

The live `credit_activation` phase now has two measured expanding capital signals (stablecoin 7-day history and DEX 7-day change) plus active current Morpho levels. Its summary explicitly says that credit growth still requires historical confirmation. The current Blockscout failure remains fail closed and does not produce `leader_beta_diffusion`. ETH gas and Ethereum settlement/DA remain a protocol link only; L1 rent and ETH collateral usage are not inferred.

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

The five-file focused suite passed 81/81 tests after the final full suite. The full suite includes actual in-memory MCP transport coverage, the two-call 101-market regression, 101 unique asset symbols, 101 missing-collateral rows collapsed to one gap, three adapter stale fallbacks, partial-cache source status preservation, explorer-gated breadth, real-shape stablecoin history cutoff cases (including malformed future-row exclusion), four credit-phase precedence cases, and five utilisation consistency cases.

## Unresolved risks and boundaries

- The live Robinhood Blockscout endpoint was unavailable for all three registered community tokens. This lowers breadth coverage safely; it is not treated as a successful verification.
- Provider availability and schemas can change. Bounded gaps and stale-cache behavior reduce false certainty but do not replace monitoring.
- The current-credit axis still uses the compatibility key `credit_activation`; its axis status is a current state. Only the overall phase combines that state with an expanding capital trend, and credit growth itself remains unmeasured.
- The community-token universe remains an explicit research registry and is not an official Robinhood affiliation claim.
- Stock-token collateral classification remains null until an effective-dated official registry is consumed.
- `npm ci` reports 14 dependency advisories (1 low, 5 moderate, 7 high, 1 critical). They pre-existed this feature's dependency graph and require a separate dependency-remediation review.
- The shared MCP dispatcher returns bounded `unknown_tool`, `invalid_arguments`, and `tool_execution_failed` codes for every tool. Consumers that parsed raw exception text need a compatibility update.
- This report validates code and live source handling; it does not authorize merge, release, or deployment.
