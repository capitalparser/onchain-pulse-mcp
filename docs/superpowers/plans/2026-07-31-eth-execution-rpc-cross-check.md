# Ethereum Execution RPC Fee Cross-Check Implementation Plan

> Implement task-by-task with isolated implementation and independent QA.

**Goal:** Add a bounded exact verifier for finalized Ethereum block fees and
burn without expanding the existing daily Dune aggregation into an unbounded
RPC indexer.

**Architecture:** Pure bigint domain logic validates normalized block evidence
and computes exact fee identities. A strict JSON-RPC adapter obtains finalized
blocks and block receipts in bounded batches. A purpose-built read-only MCP
tool exposes verified or unavailable snapshots with sanitized provenance.

**Tech stack:** Node.js 20+, TypeScript ESM, native `fetch`, Zod 3, Vitest 2,
tsup 8, MCP SDK 1.x.

## Global Constraints

- Work only in the `eth-execution-rpc-cross-check` worktree.
- Use strict RED, GREEN, REFACTOR and record the failing RED command.
- Accept at most 64 consecutive finalized blocks.
- Use `eth_getBlockByNumber` and `eth_getBlockReceipts`; do not add a
  per-transaction receipt fallback.
- Use bigint for every wei and gas calculation.
- Missing or inconsistent evidence invalidates the full range; never emit a
  partial total or synthesize zero.
- Never return, log, persist, or place `ETHEREUM_RPC_URL` in a cache key.
- No default test may perform a network call.
- Do not change unrelated token-forensics RPC code.
- Final verification is `npm test`, `npm run typecheck`, and `npm run build`.

---

### Task 1: Exact domain contracts and fee arithmetic

**Files:**

- Create: `src/eth_fee_cross_check/types.ts`
- Create: `src/eth_fee_cross_check/metrics.ts`
- Create: `tests/eth_fee_cross_check/types.test.ts`
- Create: `tests/eth_fee_cross_check/metrics.test.ts`

**Required behavior:**

- Add strict Zod schemas for input, exact amounts, block rows, gaps, source
  status, and the full snapshot.
- Input is an inclusive ordered range of at most 64 non-negative safe integers.
- Define normalized evidence interfaces that contain block identity, base fee,
  block gas, optional blob gas, transaction hashes, and normalized receipts.
- Parse no JSON-RPC inside this task; keep the calculator pure.
- Compute execution fee, base burn, priority fee, blob burn, gross fee, and
  total burn with bigint.
- Enforce transaction/receipt identity, contiguous transaction indices,
  receipt gas equality, blob-gas equality, effective-price floor, consecutive
  blocks, unique block hashes, and all fee identities.
- Format exact wei and ETH decimal strings without floating point.
- Return a typed domain error category distinguishing schema-shaped evidence
  from cross-object evidence mismatch.

**TDD evidence:**

1. Add tests importing the missing modules and run them to capture RED.
2. Implement the smallest exact formatter and valid one-block calculation.
3. Add multi-block and blob-fee GREEN cases with literal hand-derived totals.
4. Add separate RED/GREEN cases for every evidence invariant.
5. Run:

```bash
npx vitest run tests/eth_fee_cross_check
npm run typecheck
```

**Commit:** `feat: add exact Ethereum fee verification domain`

---

### Task 2: Strict bounded Execution JSON-RPC adapter

**Files:**

- Create: `src/adapters/eth_fee_rpc.ts`
- Create: `tests/adapters/eth_fee_rpc.test.ts`
- Modify only if required by the result contract:
  `src/eth_fee_cross_check/types.ts`

**Required behavior:**

- Accept explicit start/end blocks and `includeBlocks`.
- Return `rpc_not_configured` without calling fetch when the URL is absent.
- Request the finalized head first and reject newer requested ranges.
- Request paired blocks and block receipts in chunks of at most 20 blocks.
- Match JSON-RPC batch entries by unique exact id, not response order.
- Strictly parse canonical quantities, hashes, block fields, transaction hashes,
  and receipt fields.
- Reject JSON-RPC errors, missing/duplicate/unexpected ids, null blocks or
  receipts, non-2xx, invalid JSON, and thrown fetch.
- Send errors through bounded gap categories without raw provider text.
- Cache only verified finalized results for 30 minutes; identical concurrent
  calls share work. A refresh failure may return verified cached evidence with
  one `source_stale` gap.
- Pass normalized evidence to Task 1 domain logic; do not duplicate arithmetic.

**TDD evidence:**

1. Start with a failing no-config and valid shuffled-batch test.
2. Implement finalized-head and one-chunk transport.
3. Add RED/GREEN tests for chunking, method parameters, response-id matching,
   finality, schema drift, evidence mismatch, cache reuse, concurrency, stale
   fallback, and secret redaction.
4. Run:

```bash
npx vitest run tests/adapters/eth_fee_rpc.test.ts tests/eth_fee_cross_check
npm run typecheck
```

**Commit:** `feat: add bounded Ethereum fee RPC adapter`

---

### Task 3: MCP integration, environment boundary, docs, and live gate

**Files:**

- Modify: `src/env.ts`
- Modify: `src/server.ts`
- Create: `src/tools/get_eth_fee_cross_check.ts`
- Create: `tests/tools/get_eth_fee_cross_check.test.ts`
- Modify: `tests/env.test.ts`
- Modify: `tests/server.test.ts`
- Create: `tests/live/eth_fee_cross_check.live.test.ts`
- Modify: `package.json`
- Modify: `README.md`

**Required behavior:**

- Load optional `ETHEREUM_RPC_URL` into a dedicated internal config field.
- Never advertise the URL; expose only `ethereum_rpc_active`.
- Register `get_eth_fee_cross_check` with required start/end block JSON schema
  and optional `include_blocks=false`.
- Parse arguments with the strict Task 1 input schema.
- Return localized verified/unavailable summary text and the exact adapter
  snapshot.
- Keep invalid arguments as MCP input errors.
- Add a default-skipped live suite gated by both `RUN_LIVE_ETH_RPC=1` and the
  configured URL. It resolves a small finalized range and checks the public
  snapshot schema and exact identities.
- Document the tool, range cap, finalized-only behavior, metric identities,
  credential boundary, opt-in live command, and the fact that this does not
  replace daily Dune aggregation.

**TDD evidence:**

1. Add failing env, tool-registration, schema, and handler tests.
2. Implement the minimal wiring.
3. Add failing unavailable, verified, secret-redaction, and input-bound tests.
4. Complete docs and live gate.
5. Run:

```bash
npx vitest run tests/env.test.ts tests/server.test.ts \
  tests/tools/get_eth_fee_cross_check.test.ts
npm test
npm run typecheck
npm run build
```

**Commit:** `feat: expose Ethereum fee RPC cross-check tool`

---

### Task 4: Independent final QA and remediation loop

**QA contract:**

- Review exact branch SHA and diff from `cca04aef4da9b058001339f053eaab0828a6945a`.
- Lead with Critical, Important, then Minor findings with file and line.
- Verify no credential leak, silent partial total, float arithmetic,
  unfinalized evidence, unbounded calls, or receipt-association ambiguity.
- Inspect RED evidence and rerun scoped tests, full tests, typecheck, and build.
- Keep live network evidence separate; do not run it without explicit env gate.
- End with `APPROVED` or `CHANGES_REQUESTED`.

If QA requests changes, implementation performs a narrow TDD fix and QA
reviews the new exact SHA. Repeat until no Critical or Important finding
remains.

**Integration-ready condition:**

- clean worktree;
- all commits present on `feat/eth-execution-rpc-cross-check`;
- default suite, typecheck, and build pass fresh;
- independent QA says `APPROVED`;
- push/PR state reported separately from local verification.
