# Ethereum Consensus Rewards Cross-Check Implementation Plan

> Implement task-by-task in the isolated feature worktree with terra-high;
> review each task and the complete branch independently with sol-high.

**Goal:** Add a bounded exact verifier for the reward components exposed by
the official Beacon API while keeping incomplete consensus issuance and net
issuance explicitly null.

**Architecture:** A pure signed-bigint domain validates normalized reward
evidence and exact identities. A strict Beacon REST adapter proves finality,
enumerates canonical blocks for all 32 slots, and retrieves reward components.
A purpose-built MCP tool exposes verified evidence, unavailable source states,
and permanent issuance-coverage gaps.

**Tech stack:** Node.js 20+, TypeScript ESM, native `fetch`, Zod 3, Vitest 2,
tsup 8, MCP SDK 1.x.

## Global Constraints

- Work only in the `eth-consensus-rewards-cross-check` worktree.
- Use strict RED, GREEN, REFACTOR and record literal failing RED output.
- Verify exactly one epoch of 32 slots per request; never add an unbounded
  validator, epoch, or slot crawl.
- Use only the five official Beacon endpoints named in the design.
- Use `bigint` for every Gwei reward calculation.
- Missing or inconsistent evidence invalidates the full epoch; never emit a
  partial total or synthesize an unavailable component as zero.
- `observed_consensus_reward` is not complete issuance.
- `consensus_issuance` and `net_issuance` remain `null` in this slice.
- Never return, log, persist, or place `ETHEREUM_BEACON_API_URL` in a cache
  key.
- No default test may perform a network call.
- Do not change execution RPC fee arithmetic or Dune value-capture behavior.
- Final verification is `npm test`, `npm run typecheck`, and `npm run build`.

---

### Task 1: Exact consensus-reward domain contracts and arithmetic

**Files:**

- Create: `src/eth_consensus_rewards/types.ts`
- Create: `src/eth_consensus_rewards/metrics.ts`
- Create: `tests/eth_consensus_rewards/types.test.ts`
- Create: `tests/eth_consensus_rewards/metrics.test.ts`

**Required behavior:**

- Add strict Zod schemas for input, exact signed-Gwei amounts, block rows,
  gaps, source status, coverage, identities, and the full snapshot.
- Input accepts one non-negative safe-integer `epoch` and
  `include_blocks=false`; compute slots with safe-integer overflow checks.
- A verified snapshot requires all four observed reward metrics, the two exact
  identities, all three exposed reward coverage flags, two explicit coverage
  gaps, and null issuance metrics.
- An unavailable snapshot requires every observed metric null, no verified
  epoch, no identities or block rows, false exposed-reward coverage, and at
  least one transport/finality/evidence gap.
- Define normalized evidence interfaces for attestation total rewards,
  canonical header identity, block proposer reward components, and sync
  committee rewards. Parse no HTTP JSON inside this task.
- Sum signed attestation fields including optional phase0 `inclusion_delay`,
  signed sync rewards, and unsigned proposer components with `bigint`.
- Enforce unique attestation validator indices, proposer/header identity,
  unique canonical roots, slot ordering/range, block decomposition identity,
  proposed-plus-missed equals 32, and the epoch aggregate identity.
- Format exact signed Gwei and ETH strings without floating point, including
  negative values and negative sub-one-ETH values.
- Return typed domain error categories distinguishing schema-shaped evidence
  from cross-object evidence mismatch.
- Verified block rows are included only when requested and ordered by slot.

**TDD evidence:**

1. Add tests importing the missing modules and run them to capture RED.
2. Implement exact signed formatting and one valid epoch fixture.
3. Add literal positive and negative component totals.
4. Add separate RED/GREEN cases for every evidence invariant and snapshot
   cross-field rule.
5. Run:

```bash
npx vitest run tests/eth_consensus_rewards
npm run typecheck
```

**Commit:** `feat: add exact Beacon reward verification domain`

---

### Task 2: Strict finalized-epoch Beacon REST adapter

**Files:**

- Create: `src/adapters/eth_consensus_rewards_beacon.ts`
- Create: `tests/adapters/eth_consensus_rewards_beacon.test.ts`
- Modify only if required by the result contract:
  `src/eth_consensus_rewards/types.ts`

**Required behavior:**

- Accept explicit `epoch`, `includeBlocks`, and internal optional `beaconUrl`.
- Return `beacon_not_configured` without calling fetch when the URL is absent
  or whitespace.
- Bind one provider URL per adapter context without exposing it.
- Fetch head finality checkpoints first; reject unless
  `requested_epoch < finalized_epoch` and `execution_optimistic=false`.
- Fetch attestation rewards for the exact epoch with `POST` and no validator
  request body.
- Query all 32 exact slots with
  `GET /eth/v1/beacon/headers?slot={slot}` at concurrency at most eight.
- Treat a valid empty header array as a missed slot. Require exactly one
  canonical header otherwise; ignore non-canonical headers and reject multiple
  canonical headers or slot mismatches.
- Query block and sync-committee rewards by canonical block root at
  concurrency at most eight. `POST` sync requests omit the optional validator
  body.
- Require reward/header evidence to be non-optimistic and finalized where the
  official response supplies `finalized`.
- Strictly parse root hex data, safe decimal epoch/slot/index fields, signed
  Int64 reward strings, unsigned Uint64 reward strings, boolean metadata,
  required attestation arrays, block components, and sync arrays.
- Reject thrown fetch, non-2xx, invalid JSON, unsupported responses, missing
  fields, malformed values, mismatched proposer indices, and incomplete
  evidence through bounded gap codes with no raw provider detail.
- Never convert a 404 or other error into a missed slot.
- Pass normalized evidence to Task 1; do not duplicate reward arithmetic.
- Cache only verified finalized evidence for 30 minutes. Identical concurrent
  calls share work. A refresh failure may return verified cached evidence with
  one `source_stale` gap.

**TDD evidence:**

1. Capture RED for no-config and a valid finalized epoch with one proposed
   block plus 31 proven missed slots.
2. Implement finality, attestation, header enumeration, and reward retrieval.
3. Add RED/GREEN tests for concurrency bounds, URL/method/body contracts,
   finality boundary, optimistic evidence, missed slots, canonical selection,
   schema drift, evidence mismatch, cache reuse, concurrent deduplication,
   stale fallback, and secret redaction.
4. Use complete official response-shaped fixtures rather than partial mocks.
5. Run:

```bash
npx vitest run tests/adapters/eth_consensus_rewards_beacon.test.ts \
  tests/eth_consensus_rewards
npm run typecheck
```

**Commit:** `feat: add bounded Beacon reward adapter`

---

### Task 3: MCP integration, environment boundary, docs, and live gate

**Files:**

- Modify: `src/env.ts`
- Modify: `src/server.ts`
- Create: `src/tools/get_eth_consensus_rewards_cross_check.ts`
- Create: `tests/tools/get_eth_consensus_rewards_cross_check.test.ts`
- Modify: `tests/env.test.ts`
- Modify: `tests/server.test.ts`
- Create: `tests/live/eth_consensus_rewards_cross_check.live.test.ts`
- Modify: `package.json`
- Modify: `README.md`

**Required behavior:**

- Load optional `ETHEREUM_BEACON_API_URL` into a dedicated internal config
  field.
- Never advertise the URL; expose only `ethereum_beacon_api_active`.
- Register `get_eth_consensus_rewards_cross_check` with required `epoch` and
  optional `include_blocks=false`.
- Parse arguments with the strict Task 1 input schema.
- Return localized verified/unavailable summary text around the schema-checked
  adapter snapshot. A verified summary must say reward components were
  verified, not that issuance was verified.
- Keep invalid arguments as MCP input errors.
- Add a default-skipped live suite gated by both
  `RUN_LIVE_ETH_BEACON=1` and the configured URL.
- The live test resolves a safely finalized epoch from the adapter helper,
  verifies at most one epoch, checks the public schema and reward identity,
  and asserts both issuance metrics remain null.
- Document the tool, one-epoch/98-call bound, finalized-only and
  non-optimistic behavior, exact identities, credential boundary, opt-in live
  command, and the distinction between observed reward components and complete
  issuance/net issuance.
- Do not wire these partial components into `get_eth_value_capture`.

**TDD evidence:**

1. Add failing env, registration, JSON schema, and handler tests.
2. Implement minimal wiring and localization.
3. Add failing unavailable, verified, partial-coverage, secret-redaction, and
   input-bound tests.
4. Complete documentation and the double-gated live suite.
5. Run:

```bash
npx vitest run tests/env.test.ts tests/server.test.ts \
  tests/tools/get_eth_consensus_rewards_cross_check.test.ts
npm test
npm run typecheck
npm run build
```

**Commit:** `feat: expose Beacon reward cross-check tool`

---

### Task 4: Independent final QA and remediation loop

**QA contract:**

- Review the exact branch SHA and full diff from
  `b11a79808500326042b33fd8ebc506162d396e3c`.
- Lead with Critical, Important, then Minor findings with file and line.
- Verify no credential leak, silent partial total, floating-point reward
  arithmetic, optimistic/unfinalized evidence, false missed-slot inference,
  unbounded calls, or complete-issuance overclaim.
- Inspect RED evidence and rerun scoped tests, full tests, typecheck, and build.
- Keep opt-in live evidence separate; do not run it without its explicit gates.
- End with `APPROVED` or `CHANGES_REQUESTED`.

If QA requests changes, implementation performs a narrow TDD fix and QA
reviews the new exact SHA. Repeat until no Critical or Important finding
remains.

**Integration-ready condition:**

- clean worktree;
- all commits present on `feat/eth-consensus-rewards-cross-check`;
- default suite, typecheck, and build pass fresh;
- independent sol-high QA says `APPROVED`;
- push/PR/CI state reported separately from local verification.
