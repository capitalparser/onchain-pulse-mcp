# EigenLayer osETH and mETH ETH Quotes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `get_eigenlayer_lst_eth_quotes` from 3-of-12 to a bounded
5-of-12 finalized protocol-accounting quote snapshot for osETH and mETH, while
preserving all broader null and public-boundary contracts.

**Architecture:** Keep the existing uncached, fresh-only EigenLayer base
verifier as the single base-evidence source. Extend the quote domain and its
only combined cache to normalize two additional direct protocol-accounting
quotes at the base snapshot's numeric finalized block. The existing registered
strict-empty public tool localizes the revised snapshot; it is not re-registered
or given caller RPC input.

**Tech Stack:** Node.js >=20, TypeScript 5.7, Zod 3.23, Vitest 2.1, JSON-RPC
batch transport, bigint uint256 arithmetic.

## Global Constraints

- Start from `38abf4c0328216d0719e69b8e79f5a79d68547a4` on
  `feat/eigenlayer-oseth-meth-quotes`; do not modify unrelated tools.
- Use strict RED -> GREEN: write each focused behavior test, observe its
  expected failure, implement the smallest change, then observe the focused
  suite pass before proceeding.
- Preserve the exact covered order `stETH,rETH,cbETH,osETH,mETH`; the unquoted
  order is `ETHx,ankrETH,oETH,swETH,wBETH,sfrxETH,lsETH`.
- Do not consume the base public cache or stale base fallback. The v2 quote
  adapter owns one verified-only 30-minute combined cache and may stale-fallback
  only from prior complete five-token evidence.
- No partial evidence: unavailable output has no block, covered quote, partial
  sum, identity, rate, or coverage claim.
- All values are `bigint` internally and canonical uint256 decimal strings in
  public output. All contract `eth_call`s use the one numeric finalized block.
- Keep the public tool strict-empty and internal-RPC-only. Do not expose URLs,
  provider errors, raw responses, or credentials. Default tests and this plan
  make no network request.
- Keep the seven broader metrics null and explicitly deny full LST/native/
  EigenLayer totals, unique/net lockup, combined demand, rehypothecation,
  backing reconciliation, freshness proof, and executable withdrawal capacity.
- The official source pin directly fixes the non-proxy StakeWise controller;
  `PriceFeed.osTokenVaultController()` / `0xabed451d` is documentary
  corroboration and is not a runtime RPC call. The exact quote batch has IDs
  92–100: rETH twice, cbETH once, osETH controller twice, Mantle Staking
  `mETH()` and `oracle()` once each, and Mantle Staking `mETHToETH()` twice.
  Cold total is exactly 5 batches / 100 logical requests / 98 `eth_call` /
  IDs 1–100.

---

### Task 1: Five-Token v2 Domain and Partial Metrics

**Files:**

- Modify: `src/eigenlayer_lst_eth_quotes/types.ts`
- Modify: `src/eigenlayer_lst_eth_quotes/metrics.ts`
- Modify: `tests/eigenlayer_lst_eth_quotes/types.test.ts`
- Modify: `tests/eigenlayer_lst_eth_quotes/metrics.test.ts`

**Consumes:** The existing base strategy evidence has verified `label`,
`strategy`, `underlying_token`, 18 decimals,
`share_accounting_underlying`, and `token_custody` for all 12 fixed entries.

**Produces:** A v2 `EigenLayerLstEthQuotesSnapshot` whose five ordered
`EigenLayerCoveredLstQuote` entries accept direct aggregate osETH and mETH
quote results, records exact quote-kind/trust-basis identity, recomputes two
five-token partial sums, exposes coverage `5/12`, and fails closed otherwise.

- [ ] **Step 1: Write the failing domain tests**

  Add explicit five-entry fixtures in both domain suites. Assert the exact
  constants for the osETH strategy
  `0x57ba429517c3473B6d34CA9aCd56c0e735b94c02` / token
  `0xf1C9acDc66974dFB6dEcB12aA385b9cD01190E38` and mETH strategy
  `0x298aFB19A105D59E74658C4C334Ff360BadE6dd2` / token
  `0xd5F7838F5C461fefF7FE49ea5ebaF7728bB0ADfa`, with the exact fixed order.
  The success fixture must assert direct osETH and mETH quote values, v2
  methodology, 5-of-12 coverage, the seven unquoted labels, recalculated
  five-token sums, seven null broader metrics, and all permanent gaps.

  Add failure cases for a reordered/substituted/duplicate osETH or mETH,
  non-18 decimals, missing or fabricated direct result, zero/overflowed
  uint256 input or sum, and a public snapshot whose direct quote, sum, gap, or
  coverage is inconsistent. Assert osETH rejects cbETH rate material and mETH
  rejects cbETH/rETH rate or fabricated conversion material.

- [ ] **Step 2: Observe RED**

  Run:

  ```bash
  npm test -- tests/eigenlayer_lst_eth_quotes/types.test.ts tests/eigenlayer_lst_eth_quotes/metrics.test.ts
  ```

  Expected: the existing 3-token/v1 constants, schema, and builders fail the
  new 5-token/v2 order, coverage, direct-quote, and permanent-gap assertions.

- [ ] **Step 3: Implement the smallest v2 domain change**

  Extend `EIGENLAYER_COVERED_LST_STRATEGIES` in exact fixed-order subset order;
  remove osETH/mETH from unquoted labels; change the literal methodology and
  coverage schema to v2/5-of-12; and add the two direct quote kinds and trust
  bases:

  ```ts
  "stakewise_v3_direct_controller_quote"
  "stakewise_v3_keeper_reward_accounting"
  "mantle_staking_direct_oracle_quote"
  "mantle_oracle_reported_accounting"
  ```

  Extend `EigenLayerCoveredLstQuoteInput` only with independently supplied
  direct aggregate osETH/mETH result fields. Validate their uint256 range and
  preserve them as direct results; do not invent rate math. Recompute both
  partial sums across exactly five normalized quotes. Require the permanent
  gaps `oseth_virtual_rewards_freshness_not_verified`,
  `oseth_backing_not_reconciled`,
  `meth_oracle_record_freshness_not_verified`, and
  `meth_backing_not_reconciled`, alongside the existing permanent boundaries.

- [ ] **Step 4: Observe GREEN and commit Task 1**

  Run:

  ```bash
  npm test -- tests/eigenlayer_lst_eth_quotes/types.test.ts tests/eigenlayer_lst_eth_quotes/metrics.test.ts
  npm run typecheck
  npm test
  git diff --check
  git add src/eigenlayer_lst_eth_quotes/types.ts src/eigenlayer_lst_eth_quotes/metrics.ts tests/eigenlayer_lst_eth_quotes/types.test.ts tests/eigenlayer_lst_eth_quotes/metrics.test.ts
  git commit -m "feat: extend EigenLayer LST quote domain to osETH and mETH"
  ```

  Expected: focused and full offline suites, typecheck, and whitespace check
  pass. Request a read-only sol-high findings-first review of this task SHA;
  remediate only owned Task 1 files before Task 2.

### Task 2: Finalized Direct Quote Batch and v2 Cache

**Files:**

- Modify: `src/adapters/eigenlayer_lst_eth_quotes_rpc.ts`
- Modify: `tests/adapters/eigenlayer_lst_eth_quotes_rpc.test.ts`
- Modify only if required to preserve the existing shared fresh-only API:
  `src/adapters/eigenlayer_eth_restaking_rpc.ts`
- Modify only if the prior module's behavior is changed:
  `tests/adapters/eigenlayer_eth_restaking_rpc.test.ts`

**Consumes:** Task 1's strict five-token domain. The existing
`fetchFreshEigenLayerEthRestakingExposure({ rpcUrl }, ctx)` is the sole base
loader and returns only fresh verified base evidence.

**Produces:** `fetchEigenLayerLstEthQuotes` acquires all verified quote and
binding evidence in one post-base batch at the base's finalized numeric block,
normalizes it via Task 1, caches only verified v2 combined evidence, and maps
every transport/domain failure to atomic bounded unavailable output.

- [ ] **Step 1: Write RED finalized-batch tests**

  Add a mock-transport cold test that asserts IDs 1–100 are contiguous, all 98
  contract calls share one numeric finalized block tag, and the five HTTP
  batches contain exactly 100 logical requests. Its request matcher must assert
  these exact runtime selectors and expected pointer addresses:

  ```text
  Controller 0x2A261e60FB14586B474C208b1B7AC6D0f5000306
    convertToAssets(uint256) = 0x07a2d13a, twice
  Staking 0xe3cBd06D7dadB3F4e6557bAb7EdD924CD1489E8f
    mETH() = 0x29e84867 -> 0xd5F7838F5C461fefF7FE49ea5ebaF7728bB0ADfa
    oracle() = 0x7dc0d1d0 -> 0x8735049F496727f824Cc0f2B174d826f5c408192
    mETHToETH(uint256) = 0x5890c11c, twice
  ```

  Assert the PriceFeed `0x8023518b2192FB5384DAdc596765B3dD1cdFe471` and its
  source-pinned `osTokenVaultController()` selector `0xabed451d` do **not**
  appear in the runtime batch: that direct non-proxy controller relationship is
  pinned by official v5.0.1 deployment/source, while the two mutable Mantle
  proxy dependencies are runtime-verified.

  Add RED cases for either pointer mismatch, malformed/duplicate/missing
  envelope or ID, short/257-bit scalar, provider error, stale or unavailable
  base, covered token/decimal mismatch, zero cbETH rate, direct quote
  inconsistency, failed cache load, concurrent coalescing, immutable clone,
  provider binding, and stale fallback only from a prior complete five-token
  v2 entry. Also prove it neither reads/writes the base public cache nor
  permits a base stale fallback.

- [ ] **Step 2: Observe RED**

  Run:

  ```bash
  npm test -- tests/adapters/eigenlayer_lst_eth_quotes_rpc.test.ts
  ```

  Expected: the existing three-call v1 quote batch does not issue or validate
  the osETH direct calls, Mantle proxy bindings/direct calls, v2 key,
  five-token result, or 100/98/1–100 cold request map.

- [ ] **Step 3: Implement the approved minimal quote batch**

  Change only the quote adapter unless an existing fresh-only helper needs a
  behavior-preserving visibility extraction. Keep one strict batch parser,
  exact one-word uint256 decoding, context-provider binding, and v2 cache key
  such as `eigenlayer-lst-eth-quotes:mainnet-v2`.

  Build calls from the verified base's osETH/mETH amounts. Use the official
  v5.0.1-pinned non-proxy StakeWise controller directly; do not issue the
  optional PriceFeed binding call. Verify both mutable Mantle Staking pointer
  results before accepting either mETH direct quote. Send each
  `convertToAssets` call to the StakeWise controller and each `mETHToETH` call
  to Mantle Staking separately for share-accounting and custody, then pass
  their direct return values to the Task 1 builder. Never issue a rate-derived
  substitute, call a public cached base adapter, or retain any partly acquired
  data.

- [ ] **Step 4: Observe GREEN and commit Task 2**

  Run:

  ```bash
  npm test -- tests/adapters/eigenlayer_eth_restaking_rpc.test.ts tests/adapters/eigenlayer_lst_eth_quotes_rpc.test.ts
  npm test -- tests/eigenlayer_lst_eth_quotes/types.test.ts tests/eigenlayer_lst_eth_quotes/metrics.test.ts
  npm run typecheck
  npm test
  git diff --check
  git add src/adapters/eigenlayer_lst_eth_quotes_rpc.ts tests/adapters/eigenlayer_lst_eth_quotes_rpc.test.ts src/adapters/eigenlayer_eth_restaking_rpc.ts tests/adapters/eigenlayer_eth_restaking_rpc.test.ts
  git commit -m "feat: verify osETH and mETH EigenLayer quotes"
  ```

  Stage only files actually changed; absent optional helper changes must not be
  staged. Expected: all offline checks pass and no live RPC is contacted.
  Request a read-only sol-high findings-first review of this task SHA; remediate
  only Task 2 owned files before Task 3.

### Task 3: Public Contract, Documentation, and Disabled-by-Default Live Gate

**Files:**

- Modify: `src/tools/get_eigenlayer_lst_eth_quotes.ts`
- Modify: `src/server.ts` only to revise the existing tool description; do not
  add another registration.
- Modify: `tests/tools/get_eigenlayer_lst_eth_quotes.test.ts`
- Modify: `tests/server.test.ts` only for the existing registration text/count
  contract if needed.
- Modify: `tests/live/eigenlayer_lst_eth_quotes.live.test.ts`
- Modify: `README.md`
- Modify: `CONTEXT.md` only if it presently documents this tool.
- Do not modify `package.json` unless the existing live script cannot execute
  the revised same-path test; the current tool is already registered and its
  script already exists.

**Consumes:** The atomic v2 adapter snapshot from Task 2.

**Produces:** A strict existing public tool whose EN/KO verified, stale, and
unavailable summaries are bounded, sanitized, and explicit about 5-of-12
direct protocol-accounting partial coverage; documentation and the opt-in live
test match the approved finalized request map without triggering a live call by
default.

- [ ] **Step 1: Write failing public, server, and disabled-live tests**

  Update the public fixtures to five quotes and v2 data. For EN and KO, test
  verified, stale, and unavailable states; each summary must remain <=500
  characters, contain `5 of 12` / `12개 중 5개`, name direct
  protocol-accounting partials, deny all seven broader measures plus backing,
  reward/oracle-record freshness, and executable withdrawal, and exclude a
  sentinel provider URL/error.

  Test the already registered tool's strict empty input and revised description
  without changing inventory count. Expand the live test's assertions for five
  exact quote kinds, both direct osETH/mETH values, 5-of-12 coverage, seven
  unquoted labels, permanent gaps, exact partial sums, and all null metrics.
  Keep `describe.skipIf` true unless both
  `RUN_LIVE_EIGENLAYER_LST_ETH_QUOTES=1` and nonblank `ETHEREUM_RPC_URL` are
  present; add a default test proving no transport call is made without them.

- [ ] **Step 2: Observe RED**

  Run:

  ```bash
  npm test -- tests/tools/get_eigenlayer_lst_eth_quotes.test.ts tests/server.test.ts tests/live/eigenlayer_lst_eth_quotes.live.test.ts
  ```

  Expected: v1 EN/KO wording, 3-of-12 fixtures, server description, README
  contract, and live assertions fail the expanded v2 expectations while the
  live body remains skipped.

- [ ] **Step 3: Implement only public-contract changes actually needed**

  Update summary strings to say “5 of 12 direct protocol-accounting partials”
  and their exact Korean equivalent for all states, preserving sanitization and
  the strict schema boundary. Revise the existing server description rather
  than registering another tool. Document source pins, selectors, pointer
  proofs, exact approved cold request map, v2 cache behavior, five-token
  partial sums, seven unquoted labels, permanent gaps, null boundaries, and
  the two live gates. Do not claim independent backing, freshness, liquidity,
  withdrawal, or live execution.

- [ ] **Step 4: Observe GREEN, build, and commit Task 3**

  Run:

  ```bash
  npm test -- tests/tools/get_eigenlayer_lst_eth_quotes.test.ts tests/server.test.ts tests/live/eigenlayer_lst_eth_quotes.live.test.ts
  npm run typecheck
  npm run build
  npm test
  git diff --check
  git add src/tools/get_eigenlayer_lst_eth_quotes.ts src/server.ts tests/tools/get_eigenlayer_lst_eth_quotes.test.ts tests/server.test.ts tests/live/eigenlayer_lst_eth_quotes.live.test.ts README.md CONTEXT.md package.json
  git commit -m "docs: describe bounded osETH and mETH EigenLayer quotes"
  ```

  Stage only files actually changed; do not add an unnecessary `package.json`,
  `CONTEXT.md`, or registration edit. Request a read-only sol-high
  findings-first review of this task SHA, then a fresh sol-high full-branch
  review against `38abf4c0328216d0719e69b8e79f5a79d68547a4`. Re-run focused
  offline tests, typecheck, build, full offline tests, and `git diff --check`
  after remediation. Do not push, create a PR, or run live tests without a
  separate authorization.

## Plan Self-Review

- **Coverage:** Task 1 owns fixed order, quote semantics, v2 methodology,
  partial sums, gaps, and nulls. Task 2 owns fresh-only base reuse, finalized
  RPC evidence, pointer proofs, cache, stale, and atomic availability. Task 3
  owns public language, registration contract, documentation, and opt-in live
  assertions.
- **Count safety:** Task 2 fixes the bounded runtime map at nine quote calls;
  PriceFeed corroboration remains source documentation, while the two mutable
  Mantle proxy bindings remain runtime evidence.
- **No placeholders:** every task names concrete files, selectors, assertions,
  RED command, GREEN command, and commit boundary.
- **Type consistency:** Task 1 produces the v2 five-entry snapshot consumed by
  Tasks 2 and 3; no new public transport interface is introduced.

Plan complete and saved to
`docs/superpowers/plans/2026-07-31-eigenlayer-oseth-meth-quotes.md`.
