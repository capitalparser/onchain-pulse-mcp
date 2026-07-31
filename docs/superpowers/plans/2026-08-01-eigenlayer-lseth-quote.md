# EigenLayer lsETH ETH Quote Implementation Plan

**Goal:** Extend the fixed finalized EigenLayer LST accounting-quote view from
5/12 to 6/12 by adding only direct lsETH River conversion evidence.

## Constraints

- Work only on `feat/eigenlayer-lseth-quote` from
  `88805ae4ff834cffb745496f904b4dbc2137faa1`.
- Use strict RED -> GREEN for each code task and keep default tests offline.
- Preserve strict empty tool input and internal `ETHEREUM_RPC_URL` ownership.
- Keep every broader aggregate null and every source/transport failure atomic.
- Use the official Liquid Collective v1.3.0 source pin documented in the
  accompanying design; no inferred rates or backing calculations.

## Task 1 — Six-token domain

1. Add RED tests for the exact `stETH,rETH,cbETH,osETH,lsETH,mETH` order,
   6/12 coverage, two direct lsETH quotes, report context, uint256/zero/floor
   preservation, three lsETH permanent gaps, and strict unavailable output.
2. Observe the focused domain suites fail under the existing five-token v2
   contract.
3. Update schema/domain builders to v3 and recompute only the six-token
   partial sums.
4. Run focused domain suites, typecheck, full tests, diff check; commit the
   owned domain/test files.

## Task 2 — Finalized direct River batch

1. Add RED adapter tests for IDs 101--103, exact calldata, one finalized tag,
   103 logical/101 contract calls, direct zero handling, malformed or missing
   report context, and v3 cache-only stale fallback.
2. Observe the focused adapter suite fail under the existing nine-call v2
   quote batch.
3. Add the two direct River conversion calls plus `getLastCompletedEpochId()`
   to the one post-base batch; bind all results to IDs and fail closed.
4. Run focused adapter/base suites, typecheck, full tests, diff check; commit
   the owned adapter/test files.

## Task 3 — Public boundary and documentation

1. Add RED tests for English/Korean 6-of-12 summaries, lsETH report/proxy/
   backing limitations, strict tool description, and opt-in live contract.
2. Implement the narrow localization/server/README/CONTEXT/live test changes.
3. Run focused public tests, full tests, typecheck, build, and diff check;
   commit public/docs files separately.

## Verification

Run `npm test`, `npm run typecheck`, `npm run build`, and `git diff --check`.
Do not execute a live RPC call, push, create a PR, or merge.
