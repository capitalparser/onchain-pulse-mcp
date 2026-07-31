# EigenLayer Covered LST ETH Quotes Implementation Plan

> Execute every implementation task with strict RED -> GREEN evidence in the
> isolated `feat/eigenlayer-lst-eth-quotes` worktree. Implementation is
> terra-high; each committed task is reviewed read-only by sol-high before the
> next task proceeds.

**Goal:** Add a separate finalized-RPC MCP snapshot for exact stETH, rETH, and
cbETH EigenLayer share-accounting and custody ETH quotes while preserving
3-of-12 partial coverage and all broader null boundaries.

**Base:** `21049dd62d3a18a8bbc1bd75d4bffc30a668a02b`

**Architecture:** A strict new domain snapshot composes the already-verified
EigenLayer exposure adapter, then adds one exact quote batch at that snapshot's
numeric finalized block. A separate public tool localizes and sanitizes the
bounded result. Existing tools and schemas remain unchanged.

---

## Task 1: Exact Partial-Quote Domain

**Files**

- Create: `src/eigenlayer_lst_eth_quotes/types.ts`
- Create: `src/eigenlayer_lst_eth_quotes/metrics.ts`
- Test: `tests/eigenlayer_lst_eth_quotes/types.test.ts`
- Test: `tests/eigenlayer_lst_eth_quotes/metrics.test.ts`
- Report: `.superpowers/sdd/2026-07-31-eigenlayer-lst-eth-quotes/task-1-report.md`

**RED**

- Prove the missing module failure first.
- Add failing contract tracers for exact three-token order and identities,
  18-decimal enforcement, canonical uint256 strings, exact partial sums,
  permanent nulls/gaps, unavailable no-evidence semantics, and stale
  provenance.
- Add failing arithmetic tracers for stETH identity conversion, two independent
  rETH direct results, cbETH floor arithmetic, zero rate, overflow, duplicate
  evidence, fabricated sums, reordered entries, and the exact nine unquoted
  labels.

**GREEN**

- Implement the smallest strict Zod snapshot and builders.
- Keep rETH direct aggregate quote values distinguishable from a rounded
  one-token rate.
- Recompute every derivable identity, quote, and sum in the domain layer.
- Freeze no unverified evidence and expose no floating-point value.

**Verification**

- Run focused domain tests.
- Run `npm run typecheck`.
- Run the full offline suite.
- Run `git diff --check`.
- Commit: `feat: add exact EigenLayer covered LST quote domain`

## Task 2: Finalized RPC Quote Composition

**Files**

- Create: `src/adapters/eigenlayer_lst_eth_quotes_rpc.ts`
- Test: `tests/adapters/eigenlayer_lst_eth_quotes_rpc.test.ts`
- Report: `.superpowers/sdd/2026-07-31-eigenlayer-lst-eth-quotes/task-2-report.md`

**RED**

- Prove the missing adapter failure first.
- Add strict mock transport tracers for a cold existing EigenLayer verification
  followed by exactly one three-call quote batch.
- Assert all 92 cold-path `eth_call` requests use the same numeric finalized
  block tag and the quote batch contains exactly two rETH aggregate calls and
  one cbETH rate call.
- Add failures for token identity/decimals mismatch, missing/reordered/duplicate
  covered strategies, zero cbETH rate, malformed scalar/envelope/id, provider
  errors, base-unavailable mapping, 257-bit arithmetic, and quote inconsistency.
- Prove malformed or partial evidence is not cached.
- Prove immutable verified cache, concurrent coalescing, provider binding, and
  controlled stale fallback.

**GREEN**

- Compose `fetchEigenLayerEthRestakingExposure` inside one verified-only
  combined cache loader.
- Use the base snapshot's exact numeric block tag.
- Call rETH `getEthValue` separately for share accounting and custody.
- Call cbETH `exchangeRate` once and compute each floor quote exactly.
- Treat stETH token wei as pooled-ETH accounting wei without another call.
- Sanitize every failure to a bounded public gap.

**Verification**

- Run focused domain and adapter tests.
- Run `npm run typecheck`.
- Run the full offline suite.
- Run `git diff --check`.
- Commit: `feat: verify EigenLayer covered LST ETH quotes`

## Task 3: Public Tool, Documentation, and Live Gate

**Files**

- Create: `src/tools/get_eigenlayer_lst_eth_quotes.ts`
- Modify: `src/server.ts`
- Modify: `tests/server.test.ts`
- Create: `tests/tools/get_eigenlayer_lst_eth_quotes.test.ts`
- Create: `tests/live/eigenlayer_lst_eth_quotes.live.test.ts`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `CONTEXT.md`
- Report: `.superpowers/sdd/2026-07-31-eigenlayer-lst-eth-quotes/task-3-report.md`

**RED**

- Prove missing public module and 16-tool inventory failures.
- Prove strict empty input and internal-only RPC transport.
- Add EN/KO verified, stale, and unavailable summary tracers.
- Require every summary to say 3-of-12 partial quote coverage and deny full LST
  totals, native totals, unique/net demand, cross-protocol totals,
  rehypothecation, and executable capacity.
- Prove the live body is skipped unless both explicit gates are present.

**GREEN**

- Register `get_eigenlayer_lst_eth_quotes`.
- Replace adapter summary text at the public localization boundary.
- Document exact official source pins, arithmetic, 5/94/92 cold counts, trust
  distinctions, partial sums, permanent nulls, cache behavior, and live opt-in.
- Keep provider URLs and errors outside every public field.

**Verification**

- Run focused public/server/default-disabled-live tests.
- Run `npm run typecheck`.
- Run `npm run build`.
- Run the full offline suite.
- Run `git diff --check`.
- Commit: `feat: expose EigenLayer covered LST ETH quotes`

## Task 4: Independent Review and Delivery

- Run sol-high findings-first review for every task SHA.
- Remediate each finding with the smallest owned-file commit and re-review.
- Run a fresh sol-high full-branch review from
  `21049dd62d3a18a8bbc1bd75d4bffc30a668a02b`.
- Re-run focused tests, full offline tests, typecheck, build, and full
  `git diff --check`.
- Verify origin main has not drifted.
- Push the exact approved head, create a PR, and verify distinct push and PR CI
  runs.
- Merge only a clean, CI-green PR.
- Verify the merge commit and main CI.
- Fast-forward local main, rerun post-merge offline tests/typecheck/build, and
  remove only the clean local feature worktree and local branch.
- Preserve the remote feature branch.
