# Aave V3 Ethereum ETH Collateral Capacity Implementation Plan

> Implement task-by-task in the isolated feature worktree with terra-high;
> review every task and the complete branch independently with sol-high.

**Goal:** Add a bounded finalized-RPC verifier for Aave V3 Ethereum Core
ETH-family supplied capacity while keeping actual collateral, net locked,
gross collateral, and rehypothecation metrics explicitly null.

**Architecture:** A pure bigint domain validates exact rational
ETH-equivalent amounts and cross-field identities. A strict JSON-RPC adapter
binds all contract reads to one finalized mainnet block. A purpose-built MCP
tool exposes the verified reserve evidence and permanent coverage gaps.

**Tech stack:** Node.js 20+, TypeScript ESM, native `fetch`, Zod 3, Vitest 2,
tsup 8, MCP SDK 1.x.

## Global Constraints

- Work only in `onchain-pulse-mcp-eth-collateral-aave`.
- Use strict RED, GREEN, REFACTOR and preserve literal RED output in reports.
- Use only the official contracts and ten fixed assets named in the design.
- Bind every `eth_call` to the same exact finalized block tag.
- Require `eth_chainId=0x1`; do not silently accept a fork or another chain.
- Use `bigint` for every token, price, fraction, and aggregate calculation.
- Missing or inconsistent evidence invalidates the complete aggregate.
- Never treat supplied aTokens as actual user collateral or unique ETH locked.
- Keep actual collateral, net locked, gross collateral, and rehypothecation
  metrics `null`.
- Never return, log, persist, or put `ETHEREUM_RPC_URL` into a cache key.
- No default test may perform a network call.
- Do not change fee, Beacon reward, Dune, or GrowThePie arithmetic.
- Final verification is `npm test`, `npm run typecheck`, and `npm run build`.

---

### Task 1: Exact collateral-capacity domain contracts and arithmetic

**Files:**

- Create: `src/eth_collateral_demand/types.ts`
- Create: `src/eth_collateral_demand/metrics.ts`
- Create: `tests/eth_collateral_demand/types.test.ts`
- Create: `tests/eth_collateral_demand/metrics.test.ts`

**Required behavior:**

- Add strict Zod schemas for exact rational ETH amounts, asset evidence,
  block identity, metrics, identities, coverage, source status, gaps, and the
  full snapshot.
- Define normalized ten-asset evidence without parsing RPC JSON here.
- Verify the exact asset set, unique addresses/symbols, 18 decimals, active
  reserves, non-zero prices, non-negative supplies, and one WETH reference.
- Compute per-asset and aggregate exact rational ETH-equivalent values with
  bigint GCD/LCM reduction and floor/remainder identities.
- Separate all supplied assets from the collateral-enabled subset.
- A verified snapshot requires all ten assets, both identities, complete Aave
  coverage, four explicit permanent coverage gaps, and four broader metrics
  null.
- An unavailable snapshot requires all observed metrics null, no asset rows,
  verified block, or identities, and at least one source failure gap.
- Return typed domain errors distinguishing schema drift from evidence
  mismatch.

**TDD evidence:**

1. Capture missing-module RED.
2. Add valid mixed-price and zero-supply fixtures.
3. Add non-divisible price ratios to prove remainder preservation.
4. Add separate RED/GREEN cases for every invariant and snapshot cross-field
   rule.
5. Run:

```bash
npx vitest run tests/eth_collateral_demand
npm run typecheck
```

**Commit:** `feat: add exact Aave collateral capacity domain`

---

### Task 2: Strict finalized Aave V3 JSON-RPC adapter

**Files:**

- Create: `src/adapters/eth_collateral_aave_v3.ts`
- Create: `tests/adapters/eth_collateral_aave_v3.test.ts`
- Modify only if required: `src/eth_collateral_demand/types.ts`

**Required behavior:**

- Accept only an internal optional `rpcUrl`.
- Return `rpc_not_configured` without calling fetch for absent/blank config.
- Bind one provider URL per adapter context without exposing it.
- Require a canonical mainnet chain id and a non-null finalized block with
  canonical number, hash, and timestamp.
- Resolve data-provider and oracle addresses from the fixed official
  PoolAddressesProvider at the exact finalized block.
- Use ABI-exact calldata and strict 32-byte return decoding for provider
  addresses, configurations, supplies, and prices.
- Require the fixed official ten-asset set, active reserves, 18 decimals,
  non-zero resolved addresses, and non-zero prices.
- Batch calls with unique request ids; reject missing, duplicate, unknown,
  errored, reordered-with-mismatch, malformed, or partial batch evidence.
- Cap the logical call count at 35 and use no retries.
- Cache only verified evidence for 30 minutes; coalesce identical concurrent
  calls; stale fallback may use only prior verified evidence.
- Map failures to bounded codes without raw response/provider details.

**TDD evidence:**

1. Capture no-config and valid-finalized-snapshot RED.
2. Implement transport, ABI encoding/decoding, and domain handoff.
3. Add RED/GREEN cases for mainnet, finality, exact block-tag binding, calldata,
   fixed bounds, schema/evidence failures, cache/coalescing/stale fallback, and
   secret redaction.
4. Run:

```bash
npx vitest run tests/adapters/eth_collateral_aave_v3.test.ts \
  tests/eth_collateral_demand
npm run typecheck
```

**Commit:** `feat: add finalized Aave V3 collateral adapter`

---

### Task 3: MCP integration, docs, and opt-in live gate

**Files:**

- Create: `src/tools/get_eth_collateral_demand.ts`
- Modify: `src/server.ts`
- Create: `tests/tools/get_eth_collateral_demand.test.ts`
- Modify: `tests/server.test.ts`
- Create: `tests/live/eth_collateral_demand.live.test.ts`
- Modify: `package.json`
- Modify: `README.md`

**Required behavior:**

- Register `get_eth_collateral_demand` with a strict empty input object.
- Use the existing internal `ETHEREUM_RPC_URL`; never advertise its value.
- Return localized verified/unavailable summary text around the schema-checked
  adapter result.
- Verified wording must say Aave supplied capacity, not actual user collateral
  or unique ETH locked.
- Add a default-skipped live suite gated by both
  `RUN_LIVE_ETH_COLLATERAL=1` and the configured RPC URL.
- The live suite reads one finalized snapshot, checks the public schema and
  exact identities, and asserts all four broader metrics remain null.
- Document ten-asset scope, 35-call bound, exact-block behavior, exact
  rational arithmetic, credential boundary, opt-in command, and coverage gaps.
- Do not wire the partial result into `get_eth_value_capture`.

**TDD evidence:**

1. Capture registration, schema, handler, localization, and unavailable RED.
2. Implement minimal server/tool wiring.
3. Add secret-redaction, strict-empty-input, verified-boundary, and default
   live-skip tests.
4. Run:

```bash
npx vitest run tests/server.test.ts \
  tests/tools/get_eth_collateral_demand.test.ts
npm test
npm run typecheck
npm run build
```

**Commit:** `feat: expose Aave collateral demand tool`

---

### Task 4: Independent final QA and remediation loop

**QA contract:**

- Review the exact branch SHA and full diff from
  `89afefdb9d89496f572406582014817a5ad83391`.
- Lead with Critical, Important, then Minor findings with file and line.
- Verify no credential leak, partial total, floating-point value arithmetic,
  non-finalized/mixed-block evidence, chain mismatch, unbounded call path,
  stale unavailable evidence, or actual-collateral overclaim.
- Inspect RED evidence and rerun scoped tests, full tests, typecheck, and build.
- Keep opt-in live evidence separate; do not run it without explicit gates.
- End with `APPROVED` or `CHANGES_REQUESTED`.

If QA requests changes, implementation performs a narrow TDD fix and QA
reviews the new exact SHA. Repeat until no Critical or Important finding
remains.

**Integration-ready condition:**

- clean worktree;
- three implementation commits on `feat/eth-collateral-aave-v3`;
- default suite, typecheck, and build pass fresh;
- independent sol-high QA says `APPROVED`;
- push/PR/CI state reported separately from local verification.
