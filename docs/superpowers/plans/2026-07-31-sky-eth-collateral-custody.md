# Sky ETH Collateral Adapter Custody Implementation Plan

> Implement each task in the isolated worktree with terra-high, then review the
> exact task SHA and complete branch independently with sol-high.

**Goal:** Verify Chainlog-listed legacy Maker/Sky ETH-family adapter custody at
one finalized Ethereum block without relabeling it as active Vault collateral,
unique locked ETH, actual user collateral, or a cross-protocol demand total.

**Architecture:** A Sky-specific finalized RPC adapter owns Chainlog
resolution, the fixed four-round call plan, and verified-only cache. A strict
domain module owns contract/ilk identities, exact custody arithmetic, and
null/gap semantics. A separate MCP tool owns localization.

**Tech stack:** Node.js 20+, TypeScript ESM, native `fetch`, Zod 3, Vitest 2,
tsup 8, MCP SDK 1.x.

## Global Constraints

- Work only in `onchain-pulse-mcp-sky-eth-custody`.
- Use strict RED, GREEN, REFACTOR and preserve literal RED output in reports.
- Resolve the fixed official Chainlog keys at one exact finalized mainnet
  block.
- Verify every join's Vat, ilk, token, decimals, live flag, and token custody.
- Use aggregate-amount wstETH/rETH conversion calls, not rounded unit-rate
  multiplication.
- Use `bigint` internally and canonical bounded decimal strings publicly.
- Keep all five broader demand/locked/collateral metrics `null`.
- Never return, log, persist, or cache-key the RPC URL or provider error.
- No default test may perform a network call.
- Do not change existing public tools or their arithmetic.
- Final verification is `npm test`, `npm run typecheck`, and `npm run build`.

---

### Task 1: Strict Sky adapter-custody domain

**Files:**

- Create: `src/sky_eth_collateral_custody/types.ts`
- Create: `src/sky_eth_collateral_custody/metrics.ts`
- Create: `tests/sky_eth_collateral_custody/types.test.ts`
- Create: `tests/sky_eth_collateral_custody/metrics.test.ts`
- Create:
  `.superpowers/sdd/2026-07-31-sky-eth-collateral-custody/task-1-report.md`

**Required behavior:**

- Define the exact six-ilk universe and expected asset/Vat/join metadata.
- Define strict verified/unavailable schemas and bounded uint256 decimals.
- Recompute per-asset raw custody and total quoted ETH custody with `bigint`.
- Require exact resolved contracts, per-ilk order/uniqueness, and identity
  flags.
- Require exactly five permanent gaps and literal null broader metrics.
- Reject malformed, overflowed, duplicate, fabricated, partial,
  mismatched-provenance, or stale-unavailable data without throwing from
  `safeParse`.

**Commit:** `feat: add exact Sky ETH custody domain`

---

### Task 2: Finalized Chainlog and custody RPC adapter

**Files:**

- Create: `src/adapters/sky_eth_collateral_rpc.ts`
- Create: `tests/adapters/sky_eth_collateral_rpc.test.ts`
- Create:
  `.superpowers/sdd/2026-07-31-sky-eth-collateral-custody/task-2-report.md`

**Required behavior:**

- Use the official fixed Chainlog and ten fixed keys.
- Perform exactly four rounds and 50 logical requests.
- Validate mainnet, finalized block, canonical quantities/hashes, exact ABI
  words/address padding, unique batch ids, and one exact block tag.
- Resolve and verify Vat/tokens/joins before reading custody.
- Convert aggregate wstETH and rETH balances by their official amount
  functions at the same block.
- Translate only complete evidence through the Task 1 domain builder.
- Bind provider per context, cache only verified evidence, coalesce concurrent
  calls, and return controlled stale fallback after expiry.
- Map every failure to bounded gaps with no partial data or secret leakage.

**Commit:** `feat: verify finalized Sky ETH adapter custody`

---

### Task 3: MCP tool, docs, and live gate

**Files:**

- Create: `src/tools/get_sky_eth_collateral_custody.ts`
- Modify: `src/server.ts`
- Create: `tests/tools/get_sky_eth_collateral_custody.test.ts`
- Modify: `tests/server.test.ts`
- Create: `tests/live/sky_eth_collateral_custody.live.test.ts`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `CONTEXT.md`
- Create:
  `.superpowers/sdd/2026-07-31-sky-eth-collateral-custody/task-3-report.md`

**Required behavior:**

- Register `get_sky_eth_collateral_custody` with a strict empty object.
- Use only internal `ETHEREUM_RPC_URL`.
- Localize verified, stale, and unavailable summaries in Korean and English.
- Say adapter-held custody, never active Vault collateral, unique locked ETH,
  actual user collateral, or combined demand.
- Add a default-skipped live test requiring both
  `RUN_LIVE_SKY_ETH_CUSTODY=1` and nonblank RPC configuration.
- Live assertions independently recompute raw bucket and quoted-custody sums
  and preserve all five null boundaries.
- Update the 14-tool inventory, terminology, fixed call bound, official
  sources, credential seam, and live command.

**Commit:** `feat: expose Sky ETH adapter custody tool`

---

### Task 4: Whole-branch QA and integration

- Fresh sol-high review of the full diff from
  `1188a23e95249e284df0c8a698eaa2871748bac3`.
- Findings-first review for false Vault claims, mixed blocks, schema throws,
  stale poisoning, secret leakage, overclaiming, and existing-tool regression.
- Terra-high fixes every Critical/Important finding with new RED evidence;
  sol-high re-reviews each new exact SHA.
- Run fresh full tests, typecheck, build, and diff check.
- Push, create PR, verify head SHA and both CI runs, merge only when clean.
- Verify merge commit CI and post-merge main locally.
- Remove the clean local feature worktree/branch and preserve the remote branch.
