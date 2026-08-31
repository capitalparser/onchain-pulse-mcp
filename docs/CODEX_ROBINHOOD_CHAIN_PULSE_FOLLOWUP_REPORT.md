# Codex Robinhood Chain Pulse Follow-up Validation Report

## Decision

```text
status = ready_for_owner_review
merge_scope = internal_research_foundation
automated_trading_input = not_ready
commercial_release = not_ready
```

PR #53 was merged before this follow-up began. GitHub reports merge commit
`4b9b96c331863bb22c9d32561e0e1314a4c2c7a7` at
`2026-08-31T00:18:10Z`. This work was performed on
`feat/robinhood-chain-pulse-followups` from that exact `origin/main` commit.

Validated implementation commit:

```text
074942ddf57a1765d0fb382a332bb9b99ba103be
```

Validated branch head before this report-only publication update:

```text
074942ddf57a1765d0fb382a332bb9b99ba103be
```

The report commit necessarily follows the validated implementation commit. The
resulting published PR head is recorded in the PR follow-up comment and verified
against the remote ref after push.

## Follow-up outcomes

| Workstream | Result | Evidence boundary |
|---|---|---|
| Stablecoin history freshness | PASS | Current and 7-day baseline observations must each be within 48 hours of their UTC cutoff. Missing/stale evidence remains null and partial. |
| Stablecoin duplicate timestamps | PASS | Identical points collapse; conflicting same-timestamp values invalidate the 7-day change. A greater-than-1% stock/history divergence warns without replacing current stock. |
| Morpho credit history | PASS | Official per-market history yields nullable 7-day supply, borrow, and aggregate-utilisation changes with full-market coverage and 25-alias request batches. |
| Morpho zero-denominator history | PASS | If current or baseline aggregate supply is zero, current level data remains available while `utilisation_change_7d` is null with an explicit gap. |
| Morpho borrower history | Explicitly unavailable | The official `MarketHistory` schema has no unique-borrower series. The value remains null with `morpho-api:unique_borrowers_history_unavailable`. |
| Blockscout alternative | PASS | On Blockscout failure, the fixed official RPC must prove chain id 4663, non-empty exact-address bytecode, and a matching bounded ERC-20 symbol. |
| RPC holder count | Explicitly unavailable | RPC fallback leaves holder count null and adds `robinhood-rpc:holder_count_gap`; it never manufactures zero. |
| RPC source licensing | PASS | `robinhood-rpc` is registered as attributed `commercial_review_required` evidence using the official connection documentation; both chain and token refs remain fail-closed for commercial redistribution. |
| MCP shared error compatibility | PASS | `unknown_tool`, `invalid_arguments`, and `tool_execution_failed` retain the exact bounded `isError` tool-result schema with no raw exception or caller input. |
| Dependency advisories | PASS with one bounded residual | Full graph fell from 14 advisories to one development-only low esbuild advisory. Production audit is zero. |

## Deterministic verification

Environment:

```text
Node.js  v24.15.0
npm      11.12.1
Vitest   4.1.11
```

Results after a clean install:

| Command | Result |
|---|---|
| `npm ci` | PASS; 205 packages installed |
| `npm run typecheck` | PASS |
| `npm test` | PASS; 1,042 passed, 11 skipped |
| `npm run build` | PASS |
| Review-blocker focused suites | PASS; 32/32 |
| `npm audit --omit=dev` | PASS; 0 advisories |
| `npm audit` | 1 low; esbuild development-tool residual |
| `git diff --check` | PASS |

Focused coverage includes:

- stale/current/baseline stablecoin observations and conflicting duplicates;
- Morpho history aggregation, missing baseline, duplicate conflict, invalid
  utilisation, zero current/baseline supply denominators, bounded batching, and
  current-data preservation on history failure;
- RPC success, wrong chain, empty code, malformed ABI, and symbol mismatch;
- registered license policy coverage for both `robinhood-rpc:chain:*` and
  `robinhood-rpc:token:*` refs;
- strict Robinhood MCP input plus all three shared bounded error codes over
  helper or actual in-memory transport paths;
- prior pagination, missing collateral, stale fallback, explorer gating,
  utilisation consistency, and phase-precedence regressions.

The changed-content secret scan matched only documentation language and
deliberate test sentinels such as `secret provider failure`; no credential,
authorization header, private key, raw provider payload, or caller-controlled
source configuration is returned by the implementation.

## Live CLI smoke

Command:

```text
npm run robinhood-chain-pulse
```

Observed at `2026-08-31T01:22:15.726Z`:

```text
phase                         credit_activation
capital_base                  expanding
current Morpho credit         active
stablecoin supply             $776.73M
stablecoin 7d                 +7.99%
Morpho supply                 $459.40M
Morpho borrow                 $414.98M
Morpho utilisation            90.33%
Morpho supply 7d              +10.42%
Morpho borrow 7d              +9.59%
Morpho utilisation 7d         -0.68pp
Morpho history coverage       4/4
community eligible            3/3
speculative breadth           mixed
ETH capture                    protocol_link_present_unquantified
```

All three Blockscout token calls were unavailable. The official Robinhood RPC
successfully verified chain id, exact-address bytecode, and matching symbols for
CASHCAT, STONKBROKER, and MANCER. Each token therefore remained `partial`, kept
`holder_count = null`, and became breadth-eligible only because its independent
RPC verification and market thresholds both passed. This is no longer a
DexScreener-ticker fallback.

The current breadth state is `mixed`, not `leader_beta_diffusion`: one of three
eligible tokens was positive over 24 hours and the leader return was negative.

## Interpretation limits retained

- `credit_activation` now has measured positive 7-day Morpho supply and borrow
  deltas in the live evidence, but does not prove borrower-count growth,
  collateral reuse, or loan-funded token purchases.
- Community tokens remain explicitly unaffiliated with Robinhood and are not
  equity, revenue rights, or an official chain token.
- ETH gas and Ethereum settlement/blob DA preserve
  `protocol_link_present_unquantified`; chain-specific L1 rent and ETH collateral
  use remain unmeasured.
- The module remains a research classification interface, not a buy/sell/hold
  recommender or an automated-trading gate.

## Dependency residual

The only remaining advisory is esbuild 0.27.7 through the development-only
Vitest/Vite, tsup, and tsx graph. It concerns the Windows esbuild development
server, which this MCP/CLI does not expose. Current upstream ranges still select
0.27.x; an out-of-range npm override was deliberately not used. See
`docs/DEPENDENCY_ADVISORY_REMEDIATION.md` for the full before/after record.

## Publication boundary

- Follow-up branch may be submitted to `main` for owner review.
- The follow-up PR must not be merged by Codex.
- GitHub Actions must not be started; the publication commit and push use
  `[skip ci]`, followed by an explicit Actions-run check.
