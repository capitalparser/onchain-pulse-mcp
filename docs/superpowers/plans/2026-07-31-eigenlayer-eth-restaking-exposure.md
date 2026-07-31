# EigenLayer ETH Restaking Exposure Implementation Plan

> Implement each task in the isolated worktree with terra-high, then review the
> exact task SHA and complete branch independently with sol-high.

**Goal:** Verify fixed legacy EigenLayer ETH-family LST strategy token-unit
exposure and bounded native-restaking diagnostics at one finalized Ethereum
block without fabricating ETH-equivalent, native-total, unique-net, combined,
or rehypothecation metrics.

**Architecture:** A strict domain module owns the fixed strategy universe,
token-unit arithmetic, null/gap semantics, and public schema. A finalized RPC
adapter owns the four-batch call plan, ABI verification, provider binding, and
verified-only cache. A thin MCP tool owns localization.

**Tech stack:** Node.js 20+, TypeScript ESM, native `fetch`, Zod 3, Vitest 2,
tsup 8, MCP SDK 1.x.

## Global constraints

- Work only in `onchain-pulse-mcp-eigenlayer-eth-restaking`.
- Use strict RED, GREEN, REFACTOR and preserve literal RED output in reports.
- Use only the official fixed core contracts and twelve legacy strategies.
- Use one exact finalized mainnet block for every contract read.
- Preserve token-native units; never sum heterogeneous LST units.
- Keep all six broader metrics `null` with explicit gaps.
- Never return, log, persist, or cache-key the RPC URL or provider error.
- No default test may perform a network call.
- Do not change existing public tools or their arithmetic.
- Final verification is `npm test`, `npm run typecheck`, and `npm run build`.

---

### Task 1: Strict EigenLayer exposure domain

**Files:**

- Create: `src/eigenlayer_eth_restaking/types.ts`
- Create: `src/eigenlayer_eth_restaking/metrics.ts`
- Create: `tests/eigenlayer_eth_restaking/types.test.ts`
- Create: `tests/eigenlayer_eth_restaking/metrics.test.ts`
- Create:
  `.superpowers/sdd/2026-07-31-eigenlayer-eth-restaking/task-1-report.md`

**Required behavior:**

- Define the exact ordered twelve-strategy universe and fixed core contracts.
- Define strict verified/unavailable schemas with bounded strings and details.
- Preserve strategy whitelist state, manager/token identities, token custody,
  shares, the token-native strategy accounting quote, and an explicit
  quote-above-custody diagnostic.
- Verify native diagnostic identities without calling them native exposure.
- Require exactly six permanent gaps and literal null broader metrics.
- Reject malformed, overflowed, duplicate, fabricated, partial, mismatched,
  or incoherent data without throwing from public `safeParse`.

**Commit:** `feat: add exact EigenLayer restaking exposure domain`

---

### Task 2: Finalized EigenLayer RPC adapter

**Files:**

- Create: `src/adapters/eigenlayer_eth_restaking_rpc.ts`
- Create: `tests/adapters/eigenlayer_eth_restaking_rpc.test.ts`
- Create:
  `.superpowers/sdd/2026-07-31-eigenlayer-eth-restaking/task-2-report.md`

**Required behavior:**

- Perform exactly four batches and 91 logical requests.
- Validate mainnet, finalized block, canonical quantities/hashes, exact ABI
  words/address padding, strict booleans, unique ids, and one block tag.
- Verify fixed core manager links and virtual Beacon strategy.
- Verify all twelve strategy manager links, runtime underlying tokens,
  decimals, whitelist flags, total shares, custody, and share quotes.
- Reject duplicate tokens and malformed share/custody/quote amounts while
  preserving custody and the strategy quote as separate observations.
- Assert the Task 1 domain before freezing or caching evidence.
- Bind provider per context, cache only verified evidence, coalesce concurrent
  calls, and return controlled stale fallback after expiry.
- Map every failure to bounded gaps with no partial data or secret leakage.

**Commit:** `feat: verify finalized EigenLayer restaking exposure`

---

### Task 3: MCP tool, docs, and live gate

**Files:**

- Create: `src/tools/get_eigenlayer_eth_restaking_exposure.ts`
- Modify: `src/server.ts`
- Create: `tests/tools/get_eigenlayer_eth_restaking_exposure.test.ts`
- Modify: `tests/server.test.ts`
- Create: `tests/live/eigenlayer_eth_restaking_exposure.live.test.ts`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `CONTEXT.md`
- Create:
  `.superpowers/sdd/2026-07-31-eigenlayer-eth-restaking/task-3-report.md`

**Required behavior:**

- Register `get_eigenlayer_eth_restaking_exposure` with a strict empty object.
- Use only internal `ETHEREUM_RPC_URL`.
- Localize verified, stale, and unavailable summaries in Korean and English.
- Say fixed legacy LST token-unit exposure and native diagnostics, never a
  native total, ETH-equivalent LST total, unique/net total, combined demand, or
  rehypothecation metric.
- Add a default-skipped live test requiring both
  `RUN_LIVE_EIGENLAYER_ETH_RESTAKING=1` and nonblank RPC configuration.
- Live assertions independently recheck the fixed universe, token identities,
  per-strategy bounds, and all six null boundaries.
- Update the 15-tool inventory, terminology, 91-request call bound, official
  release, credential seam, and live command.

**Commit:** `feat: expose EigenLayer restaking exposure tool`

---

### Task 4: Whole-branch QA and integration

- Fresh sol-high review of the full diff from
  `90bd96353afee9af952c165c41fe66c2c4682c32`.
- Findings-first review for mixed blocks, malformed ABI, strategy/token
  substitution, invalid cross-token sums, native-total overclaim, cache
  poisoning, secret leakage, and existing-tool regression.
- Terra-high fixes every Critical/Important finding with new RED evidence;
  sol-high re-reviews each new exact SHA.
- Run fresh full tests, typecheck, build, and diff check.
- Push, create PR, verify head SHA and both CI runs, merge only when clean.
- Verify merge commit CI and post-merge main locally.
- Remove the clean local feature worktree/branch and preserve the remote branch.
