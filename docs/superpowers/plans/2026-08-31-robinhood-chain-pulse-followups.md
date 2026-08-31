# Robinhood Chain Pulse Evidence Follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the merged internal-research foundation with bounded source redundancy, time-series freshness, measured Morpho credit deltas, an explicit MCP error compatibility contract, and a remediated dependency graph.

**Architecture:** Keep every external dependency behind its existing adapter. DefiLlama history remains independent from current stock, Morpho current and historical queries remain separate source rows, and Robinhood public JSON-RPC is an exact-address ERC-20 fallback only when Blockscout metadata is unavailable. Public snapshot fields preserve missing or stale evidence as `null` plus gaps; no follow-up creates trading recommendations or upgrades the ETH link beyond `protocol_link_present_unquantified`.

**Tech Stack:** Node.js 24, TypeScript, Zod, Vitest, MCP TypeScript SDK, DefiLlama REST, Morpho GraphQL, Robinhood Chain JSON-RPC.

**Spec:** `docs/architecture/robinhood-chain-pulse.md`

## Global Constraints

- Work from merged `origin/main` commit `4b9b96c331863bb22c9d32561e0e1314a4c2c7a7` on `feat/robinhood-chain-pulse-followups`.
- Keep the tool read-only with strict empty-object MCP input.
- Missing, stale, inconsistent, or unverified evidence remains `null`, `partial`, or `unavailable`; never manufacture zero.
- DexScreener ticker text never substitutes for independent contract verification.
- Use Node.js `v24.15.0`; run `npm ci`, typecheck, full tests, build, and live CLI before publication.
- Do not merge the follow-up PR or run GitHub Actions.

---

### Task 1: Stablecoin history quality controls

**Files:**
- Modify: `src/adapters/robinhood_chain_defillama.ts`
- Test: `tests/robinhood_chain_pulse/defillama.test.ts`
- Modify: `docs/architecture/robinhood-chain-pulse.md`

**Interfaces:**
- Consumes: DefiLlama rows `{ date, totalCirculatingUSD }` and current `stablecoinchains` stock.
- Produces: a 7-day percentage only when the current observation is at most 48 hours old, the selected baseline is at most 48 hours behind the seven-day cutoff, and no timestamp has conflicting values.

- [ ] **Step 1: Write failing freshness and conflict tests**

```ts
it("keeps the 7d change null when the current history observation is older than 48 hours", async () => {
  expect(result.metrics.stablecoin_change_7d_pct).toBeNull();
  expect(gapCodes(result)).toContain("defillama-stablecoins:history:current_stale");
});

it("rejects conflicting values at one history timestamp", async () => {
  expect(result.metrics.stablecoin_change_7d_pct).toBeNull();
  expect(gapCodes(result)).toContain("defillama-stablecoins:history:duplicate_timestamp_conflict");
});
```

- [ ] **Step 2: Run `npx vitest run tests/robinhood_chain_pulse/defillama.test.ts` and confirm the new assertions fail because the change is still calculated.**

- [ ] **Step 3: Implement deterministic normalization**

```ts
const MAX_HISTORY_DISTANCE_SECONDS = 48 * 60 * 60;
const byTimestamp = new Map<number, number>();
// Identical duplicates collapse. Conflicting duplicates return a bounded gap.
// Current and baseline distances beyond the bound return null, never zero.
```

- [ ] **Step 4: Add a non-blocking current-stock divergence warning using a documented 1% relative threshold; keep the directly fetched current stock and do not replace it with history.**

- [ ] **Step 5: Re-run the focused test and typecheck, then commit `feat: bound stablecoin history quality`.**

### Task 2: Morpho credit history

**Files:**
- Modify: `src/adapters/robinhood_chain_morpho.ts`
- Modify: `src/robinhood_chain_pulse/types.ts`
- Modify: `src/robinhood_chain_pulse/metrics.ts`
- Test: `tests/robinhood_chain_pulse/morpho.test.ts`
- Test: `tests/robinhood_chain_pulse/metrics.test.ts`
- Modify: `docs/architecture/robinhood-chain-pulse.md`

**Interfaces:**
- Consumes: listed market IDs plus per-market Morpho `historicalState.supplyAssetsUsd`, `borrowAssetsUsd`, and `utilization` with explicit `startTimestamp`, `endTimestamp`, and `DAY` interval.
- Produces: nullable `supply_change_7d_pct`, `borrow_change_7d_pct`, and `utilisation_change_7d` fields with history coverage counts. Unique-borrower change remains explicitly unavailable because the official `MarketHistory` schema has no borrower-count series.

- [ ] **Step 1: Write failing tests for summed four-market current/baseline history, missing baseline, inconsistent duplicate points, out-of-range historical utilisation, and bounded history coverage.**

```ts
expect(result.metrics.supply_change_7d_pct).toBeCloseTo(10);
expect(result.metrics.borrow_change_7d_pct).toBeCloseTo(20);
expect(result.metrics.utilisation_change_7d).toBeCloseTo(0.05);
expect(result.metrics.history_covered_market_count).toBe(4);
```

- [ ] **Step 2: Confirm the focused tests fail because the public credit schema has no history fields.**

- [ ] **Step 3: Add a bounded batched GraphQL history query for at most 25 market aliases per request and at most 100 listed markets total.**

```graphql
historicalState {
  supplyAssetsUsd(options: $options) { x y }
  borrowAssetsUsd(options: $options) { x y }
  utilization(options: $options) { x y }
}
```

- [ ] **Step 4: Aggregate only points at or before the two UTC cutoffs; require complete market coverage for a portfolio delta, otherwise keep the affected delta null and emit `morpho-api:history_coverage_gap`.**

- [ ] **Step 5: Expose current-level evidence and measured deltas separately; do not claim unique-borrower growth or token-purchase causality.**

- [ ] **Step 6: Run Morpho and metrics tests plus typecheck, then commit `feat: add bounded Morpho credit history`.**

### Task 3: Blockscout-independent contract verification

**Files:**
- Modify: `src/adapters/robinhood_chain_community.ts`
- Test: `tests/robinhood_chain_pulse/community.test.ts`
- Modify: `docs/architecture/robinhood-chain-pulse.md`

**Interfaces:**
- Consumes: Blockscout metadata first; on failure, fixed official RPC `https://rpc.mainnet.chain.robinhood.com`, `eth_chainId`, `eth_getCode`, and ERC-20 `symbol()`.
- Produces: exact-address verification from either Blockscout or onchain RPC. RPC fallback never fabricates `holder_count`; a symbol mismatch or empty bytecode remains ineligible.

- [ ] **Step 1: Write failing tests for Blockscout failure plus valid RPC symbol, wrong chain ID, empty code, malformed ABI string, and registry mismatch.**

```ts
expect(token.data_status).toBe("partial");
expect(token.holder_count).toBeNull();
expect(token.eligible_for_breadth).toBe(true);
expect(sourceStatus(result, "robinhood-rpc:token:")).toBe("ok");
```

- [ ] **Step 2: Confirm the valid-RPC case fails because current code excludes every Blockscout failure.**

- [ ] **Step 3: Implement bounded JSON-RPC parsing, EVM bytecode presence, dynamic-string/bytes32 symbol decoding, and chain ID `0x1237` verification.**

- [ ] **Step 4: Keep DexScreener as market data only and preserve a holder-count gap on RPC fallback.**

- [ ] **Step 5: Run community tests and typecheck, then commit `feat: add onchain token verification fallback`.**

### Task 4: Shared MCP error compatibility contract

**Files:**
- Modify: `src/server.ts`
- Test: `tests/server.test.ts`
- Create: `docs/adr/0010-mcp-error-code-compatibility.md`

**Interfaces:**
- Consumes: MCP `tools/call` requests and handler exceptions.
- Produces: the existing bounded result codes `unknown_tool`, `invalid_arguments`, and `tool_execution_failed` with no raw exception, caller field, URL, or credential leakage; documents their difference from pre-PR raw messages and the MCP protocol-error recommendation.

- [ ] **Step 1: Write transport-level characterization tests for all three codes and verify arbitrary thrown text is absent.**

- [ ] **Step 2: Confirm the execution-error case is not fully covered, then centralize the result construction in `boundedToolError(code)` without changing the wire payload.**

- [ ] **Step 3: Record the compatibility decision: preserve the merged bounded result contract for existing clients in this release, treat it as a breaking change from raw messages, and consider protocol-level unknown-tool errors only in a future versioned MCP surface.**

- [ ] **Step 4: Run `npx vitest run tests/server.test.ts` and typecheck, then commit `docs: define MCP error compatibility contract`.**

### Task 5: Dependency advisory remediation

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `docs/security/dependency-advisory-review-2026-08-31.md`

**Interfaces:**
- Consumes: `npm audit --json`, dependency paths, and upstream package release metadata.
- Produces: zero known advisories where compatible upgrades exist, plus an explicit residual-risk table if an upstream chain cannot yet be fixed.

- [ ] **Step 1: Capture the baseline 14 advisories and map runtime advisories through `@modelcontextprotocol/sdk` separately from Vitest/Vite development-only advisories.**

- [ ] **Step 2: Run a non-destructive dry run, update the MCP SDK within its supported line, and upgrade Vitest to the current Node-24-compatible release rather than using `npm audit fix --force`.**

- [ ] **Step 3: Run `npm ci`, full tests, typecheck, build, and `npm audit --json`; revert any upgrade that requires unsafe production behavior changes and document the residual.**

- [ ] **Step 4: Commit `chore: remediate dependency advisories`.**

### Task 6: Integrated validation and publication

**Files:**
- Create: `docs/CODEX_ROBINHOOD_CHAIN_PULSE_FOLLOWUP_REPORT.md`
- Modify: `docs/architecture/robinhood-chain-pulse.md`

**Interfaces:**
- Consumes: all five completed workstreams.
- Produces: an evidence report and one follow-up PR to `main`, without merge or GitHub Actions.

- [ ] **Step 1: Run Node/npm version checks, `npm ci`, typecheck, full tests, build, focused tests, live CLI, and `npm audit --json`.**

- [ ] **Step 2: Verify live Blockscout failure either falls back to exact-address RPC or remains safely ineligible; verify stablecoin and Morpho history ages and gaps.**

- [ ] **Step 3: Scan changed files for credentials and raw provider payload leakage, run `git diff --check`, and record exact implementation SHA.**

- [ ] **Step 4: Commit the report with `[skip ci]`, push `feat/robinhood-chain-pulse-followups`, open a PR to `main`, verify zero Actions runs, and do not merge.**
