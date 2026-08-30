# Robinhood Chain Pulse Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the reviewed Robinhood Chain Pulse patch, repair all six readiness blockers, and publish a verified non-merged pull request.

**Architecture:** Keep source acquisition in the three adapters, keep classification in `src/robinhood_chain_pulse/metrics.ts`, and expose one strict empty-input MCP tool through the existing server registration pattern. Failures at refresh boundaries throw typed errors so the shared cache can return marked stale data; normalized adapter results preserve partial valid fields while leaving missing values null.

**Tech Stack:** Node.js 24, TypeScript, Zod, Vitest, MCP SDK, GitHub CLI.

**Spec:** User-provided `CODEX_ROBINHOOD_CHAIN_PULSE_REPAIR_PROMPT_KO.md` requirements in this task, plus `docs/CODEX_ROBINHOOD_CHAIN_PULSE_VALIDATION_PROMPT.md` after applying the implementation patch.

## Global Constraints

- Preserve the existing ZIP at `/Users/kjun/Documents/robinhood-chain-pulse-implementation.zip` unchanged.
- Work only in the current Codex-managed linked worktree on `feat/robinhood-chain-pulse`.
- Keep the product read-only, diagnostic-only, and non-prescriptive.
- Keep ETH capture `protocol_link_present_unquantified` until L1 rent and ETH collateral use are measured.
- Never persist credentials or return raw provider payloads or internal exception text.
- Do not merge the PR or create/run GitHub Actions.

---

### Task 1: Apply the reviewed implementation baseline

**Files:**
- Modify/Create: the 20 files enumerated by the ZIP manifest

**Interfaces:**
- Consumes: `robinhood-chain-pulse.patch` with SHA-256 `0925e32670826f76227dd6b2810a7fe9fde104a00df57cef75bd48a91d9d2165`
- Produces: the reviewed CLI, adapters, domain types, tests, and validation prompt

- [x] Verify the clean base and ZIP/patch hashes.
- [x] Run the pre-patch full test suite and record the baseline.
- [x] Apply the patch and run `git diff --check`.
- [x] Run focused tests and confirm the known Morpho sort failure.

### Task 2: Repair deterministic symbol ordering

**Files:**
- Modify: `tests/robinhood_chain_pulse/morpho.test.ts`
- Modify: `src/adapters/robinhood_chain_morpho.ts`

**Interfaces:**
- Produces: case-folded deterministic symbol ordering with literal result `["USDe", "USDG"]`

- [x] Preserve the existing failing assertion as the red test.
- [x] Add a deterministic comparator using case-folded keys and an exact-value tie-breaker.
- [x] Run the focused Morpho test to green.

### Task 3: Restore stale-cache fallback for all adapters

**Files:**
- Modify: `tests/robinhood_chain_pulse/defillama.test.ts`
- Modify: `tests/robinhood_chain_pulse/morpho.test.ts`
- Modify: `tests/robinhood_chain_pulse/community.test.ts`
- Modify: `src/adapters/robinhood_chain_defillama.ts`
- Modify: `src/adapters/robinhood_chain_morpho.ts`
- Modify: `src/adapters/robinhood_chain_community.ts`

**Interfaces:**
- Produces: refresh failure throws inside each cache loader; cache hit returns `partial`, `stale: true`, bounded stale gap; no-cache failure returns bounded `unavailable`

- [x] Add one TTL-expiry stale fallback regression test per adapter and verify all three fail for the expected reason.
- [x] Separate throwing loaders from bounded public adapter fallbacks without weakening per-source partial results.
- [x] Run all three adapter test files to green.

### Task 4: Preserve missing Morpho collateral as unknown

**Files:**
- Modify: `tests/robinhood_chain_pulse/morpho.test.ts`
- Modify: `src/adapters/robinhood_chain_morpho.ts`

**Interfaces:**
- Produces: missing `collateralAssetsUsd` leaves `collateral_usd: null`, sets `status: partial`, and adds `morpho-api:collateral_value_gap`; valid supply, borrow, and liquidity remain aggregated

- [x] Add a missing-collateral regression test and verify red.
- [x] Track collateral completeness separately from the other aggregates.
- [x] Run the Morpho tests to green.

### Task 5: Require explorer verification for breadth

**Files:**
- Modify: `tests/robinhood_chain_pulse/community.test.ts`
- Modify: `tests/robinhood_chain_pulse/metrics.test.ts`
- Modify: `src/adapters/robinhood_chain_community.ts`

**Interfaces:**
- Produces: Blockscout unavailable or schema drift keeps holder count null, sets partial data, and makes the token ineligible; an eligible universe below three cannot classify as diffusion

- [x] Change/add the Blockscout failure regression test and verify red.
- [x] Require `metadata.status === "ok"` and exact symbol agreement in breadth eligibility.
- [x] Add a classification regression proving two eligible tokens cannot produce `leader_beta_diffusion`.
- [x] Run community and metrics tests to green.

### Task 6: Paginate and bound Morpho markets

**Files:**
- Modify: `tests/robinhood_chain_pulse/morpho.test.ts`
- Modify: `src/adapters/robinhood_chain_morpho.ts`

**Interfaces:**
- Produces: `first: 100`, `skip: 0, 100, 200...`; validates `pageInfo.countTotal`; rejects duplicate market IDs and inconsistent totals; caps total rows; emits `pagination_limit` on overflow

- [x] Add a 101-market/two-call aggregation test and verify red.
- [x] Add duplicate-ID, inconsistent-count, and limit-overflow regression tests and verify red.
- [x] Implement bounded page collection before normalization.
- [x] Run Morpho tests to green.

### Task 7: Register the strict MCP tool

**Files:**
- Modify: `tests/server.test.ts`
- Modify: `src/server.ts`
- Modify: `src/tools/get_robinhood_chain_pulse.ts` if needed for the public handler boundary

**Interfaces:**
- Produces: MCP tool `get_robinhood_chain_pulse` with JSON Schema `{ "type": "object", "properties": {}, "additionalProperties": false }`

- [x] Add registration, success-shape, and extra-input rejection tests and verify red.
- [x] Register the tool using the existing server/context pattern and strict Zod empty-object schema.
- [x] Verify errors remain bounded and no caller-controlled source/universe fields exist.
- [x] Run server tests to green.

### Task 8: Validate, document, and publish

**Files:**
- Create: `docs/CODEX_ROBINHOOD_CHAIN_PULSE_VALIDATION_REPORT.md`
- Modify: `docs/architecture/robinhood-chain-pulse.md` only where repaired behavior needs documentation

**Interfaces:**
- Produces: one `ready_for_owner_review` or `not_ready` report with exact evidence

- [x] Run Node 24 `npm ci`, `npm run typecheck`, full `npm test`, and `npm run build`.
- [x] Run focused pagination, collateral, stale fallback, explorer-gating, MCP strict-input, leakage, and CLI/live smoke checks.
- [x] Write the validation report with exact commands, results, unresolved risks, and final status.
- [x] Re-run complete verification after the report.
- [x] Commit the source, tests, docs, and report; push `feat/robinhood-chain-pulse`; create a PR to `main`; do not merge or run Actions.
