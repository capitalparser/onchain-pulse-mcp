# Token Forensics Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a free-first `get_token_forensics` MCP tool that returns a token-level forensic snapshot with pool discovery, RPC cross-check gaps, and non-prescriptive flow reading.

**Architecture:** Keep v0.1 `ToolResponse` untouched and add a separate `ForensicsSnapshot` schema. Add small adapters for DexScreener pool discovery and RPC cross-check, then register one new MCP tool that composes them and exposes gaps instead of trading recommendations.

**Tech Stack:** TypeScript, zod, Vitest, MCP SDK, native fetch.

---

## File Structure

- `src/types.ts`: add `ForensicsSnapshot` and related zod schemas.
- `src/adapters/dex_pool.ts`: discover and normalize the best DexScreener pool for a token.
- `src/adapters/rpc_cross_check.ts`: provide bounded RPC cross-check scaffolding and explicit gaps.
- `src/tools/get_token_forensics.ts`: compose adapter results into a non-prescriptive snapshot.
- `src/server.ts`: register `get_token_forensics`.
- `tests/types.test.ts`: validate snapshot schema.
- `tests/adapters/dex_pool.test.ts`: cover pool selection and thin-liquidity gap.
- `tests/adapters/rpc_cross_check.test.ts`: cover free scaffold behavior.
- `tests/tools/get_token_forensics.test.ts`: cover snapshot composition.
- `tests/server.test.ts`: cover MCP tool registration and validation.

## Tasks

### Task 1: Snapshot schema

- [ ] Write failing schema tests for `ForensicsSnapshotSchema`.
- [ ] Add `FlowReadingSchema`, `GapSchema`, `WalletFlowSchema`, and `ForensicsSnapshotSchema`.
- [ ] Run `npm run test -- tests/types.test.ts`.

### Task 2: Dex pool adapter

- [ ] Write failing adapter tests using mocked DexScreener responses.
- [ ] Implement deterministic best-pool selection by highest liquidity, then volume.
- [ ] Emit `thin_liquidity` gap for low-liquidity pools.
- [ ] Run `npm run test -- tests/adapters/dex_pool.test.ts`.

### Task 3: RPC cross-check scaffold

- [ ] Write failing tests for bounded wallet input and explicit `rpc_gap`.
- [ ] Implement `rpcCrossCheck` with no network calls in Phase 1 unless wallet addresses are provided.
- [ ] Run `npm run test -- tests/adapters/rpc_cross_check.test.ts`.

### Task 4: Tool composition

- [ ] Write failing tests for `getTokenForensics`.
- [ ] Compose pool result, empty wallet-flow tables, gaps, capabilities, and `thin-data`/`unknown` flow reading.
- [ ] Run `npm run test -- tests/tools/get_token_forensics.test.ts`.

### Task 5: MCP registration

- [ ] Write failing server test for `get_token_forensics` in `listTools`.
- [ ] Register schema and handler in `src/server.ts`.
- [ ] Run `npm run test -- tests/server.test.ts`.

### Task 6: Full verification

- [ ] Run `npm run typecheck`.
- [ ] Run `npm run test`.
- [ ] Run `npm run build`.

