# Lido Pooled ETH Backing Implementation Plan

> Implement each task in the isolated worktree with terra-high, then review the
> exact task SHA and complete branch independently with sol-high.

**Goal:** Verify Lido v4 stETH pooled-ETH accounting at one finalized Ethereum
block without relabeling it as all native stake, unique locked ETH, DeFi
collateral, or a cross-protocol total.

**Architecture:** A Lido-specific finalized RPC adapter owns the fixed two-round
call plan and verified-only cache. A strict domain module owns the accounting
identities and null/gap semantics. A separate MCP tool owns localization.

**Tech stack:** Node.js 20+, TypeScript ESM, native `fetch`, Zod 3, Vitest 2,
tsup 8, MCP SDK 1.x.

## Global Constraints

- Work only in `onchain-pulse-mcp-lido-backing`.
- Use strict RED, GREEN, REFACTOR and preserve literal RED output in reports.
- Pin official Lido core v4.0.0 commit and mainnet proxy.
- Require mainnet and bind all seven contract reads to one exact finalized
  block.
- Use `bigint` internally and canonical bounded decimal strings publicly.
- Recompute all five accounting identities; no partial result is allowed.
- Keep all five broader demand/locked/collateral metrics `null`.
- Never return, log, persist, or cache-key the RPC URL or provider error.
- No default test may perform a network call.
- Do not change existing public tools or their arithmetic.
- Final verification is `npm test`, `npm run typecheck`, and `npm run build`.

---

### Task 1: Strict Lido accounting domain

**Files:**

- Create: `src/lido_pooled_eth_backing/types.ts`
- Create: `src/lido_pooled_eth_backing/metrics.ts`
- Create: `tests/lido_pooled_eth_backing/types.test.ts`
- Create: `tests/lido_pooled_eth_backing/metrics.test.ts`
- Create:
  `.superpowers/sdd/2026-07-31-lido-pooled-eth-backing/task-1-report.md`

**Required behavior:**

- Define strict verified/unavailable schemas and bounded decimal fields.
- Enforce exact block, accounting, identity, coverage, source, gap, and stale
  contracts.
- Recompute internal ether, internal shares, external ether floor, total pooled
  ether, and total supply identities with `bigint`.
- Require exactly five permanent gaps and literal null broader metrics.
- Reject malformed, negative/impossible, fabricated, partial, duplicate-gap,
  mismatched-provenance, or stale-unavailable data without throwing from
  `safeParse`.

**Commit:** `feat: add exact Lido pooled ETH domain`

---

### Task 2: Finalized Lido RPC adapter

**Files:**

- Create: `src/adapters/lido_pooled_eth_rpc.ts`
- Create: `tests/adapters/lido_pooled_eth_rpc.test.ts`
- Create:
  `.superpowers/sdd/2026-07-31-lido-pooled-eth-backing/task-2-report.md`

**Required behavior:**

- Use the official proxy and seven pinned selectors.
- Perform exactly two rounds and nine logical requests.
- Validate mainnet, finalized block, canonical quantities, exact ABI word
  lengths, unique batch ids, and one exact block tag.
- Translate complete evidence through the domain builder.
- Bind provider per context, cache only verified Snapshots, coalesce concurrent
  calls, and return controlled stale fallback after expiry.
- Map all failures to bounded gaps with no partial data or secret leakage.

**Commit:** `feat: verify finalized Lido pooled ETH backing`

---

### Task 3: MCP tool, docs, and live gate

**Files:**

- Create: `src/tools/get_lido_pooled_eth_backing.ts`
- Modify: `src/server.ts`
- Create: `tests/tools/get_lido_pooled_eth_backing.test.ts`
- Modify: `tests/server.test.ts`
- Create: `tests/live/lido_pooled_eth_backing.live.test.ts`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `CONTEXT.md`
- Create:
  `.superpowers/sdd/2026-07-31-lido-pooled-eth-backing/task-3-report.md`

**Required behavior:**

- Register `get_lido_pooled_eth_backing` with a strict empty object.
- Use only internal `ETHEREUM_RPC_URL`.
- Localize verified, stale, and unavailable summaries in Korean and English.
- Say pooled ETH backing, never all native stake, unique locked ETH, or DeFi
  collateral.
- Add a default-skipped live test requiring both
  `RUN_LIVE_LIDO_BACKING=1` and nonblank RPC configuration.
- Live assertions independently recompute all identities and preserve all five
  null boundaries.
- Update the 13-tool inventory, terminology, fixed call bound, official
  version/address, credential seam, and live command.

**Commit:** `feat: expose Lido pooled ETH backing tool`

---

### Task 4: Whole-branch QA and integration

- Fresh sol-high review of the full diff from
  `675db8f437f2e2d780b5d97996328ab0c1b79b28`.
- Findings-first review for identity fabrication, mixed blocks, schema throws,
  stale poisoning, secret leakage, overclaiming, and existing-tool regression.
- Terra-high fixes every Critical/Important finding with new RED evidence;
  sol-high re-reviews each new exact SHA.
- Run fresh full tests, typecheck, build, and diff check.
- Push, create PR, verify head SHA and both CI runs, merge only when clean.
- Verify merge commit CI and post-merge main locally.
- Remove the clean local feature worktree/branch and preserve the remote branch.
