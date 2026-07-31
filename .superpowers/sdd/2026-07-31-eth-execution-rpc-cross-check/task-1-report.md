# Task 1: Exact domain contracts and fee arithmetic

## Scope

Implemented only Task 1 from `docs/superpowers/plans/2026-07-31-eth-execution-rpc-cross-check.md`:

- `src/eth_fee_cross_check/types.ts`
- `src/eth_fee_cross_check/metrics.ts`
- `tests/eth_fee_cross_check/types.test.ts`
- `tests/eth_fee_cross_check/metrics.test.ts`

No adapter, server, environment, documentation, or live-network behavior was changed.

## RED evidence

Command:

```bash
npx vitest run tests/eth_fee_cross_check
```

Before the production modules existed, Vitest failed both suites at module load:

```text
Failed to load url ../../src/eth_fee_cross_check/metrics.js
Failed to load url ../../src/eth_fee_cross_check/types.js
Test Files  2 failed (2)
```

This demonstrated that the new tests exercised the missing Task 1 public modules.

## GREEN and verification

Commands run after implementation:

```bash
npx vitest run tests/eth_fee_cross_check
npm run typecheck
git diff --check
```

Results:

- Focused Vitest suite passed: 2 files, 36 tests.
- `tsc --noEmit` passed.
- `git diff --check` produced no whitespace errors.

The tests use hand-derived bigint totals for one normal block and one blob-fee block, plus independent invalid-evidence cases for the Task 1 calculator and public snapshot contracts covered at that point.

## QA fix round: RED evidence

After QA of commit `862c4bd615d9f0188f7a9d48d908989f298716c9`, regression tests were added before changing production code:

```bash
npx vitest run tests/eth_fee_cross_check
```

The pre-fix result was 24 failures out of 68 tests. Representative expected failures were:

```text
EthFeeCrossCheckSnapshotSchema > rejects an unordered requested range
expected true to be false

EthFeeCrossCheckSnapshotSchema > rejects true identity flags with non-identity aggregate amounts
expected true to be false

calculateEthFeeCrossCheck > rejects a non-bigint block base fee without leaking a native TypeError
received TypeError: Cannot mix BigInt and other types

calculateEthFeeCrossCheck > rejects a case-variant duplicate block hash
Expected calculation to reject malformed normalized evidence.
```

These failures proved the prior snapshot semantics, lowercase hash policy, and runtime bigint guards were incomplete.

## QA fix round: GREEN and verification

Commands run after the hardening changes:

```bash
npx vitest run tests/eth_fee_cross_check
npm run typecheck
git diff --check
```

Results:

- Focused Vitest suite passed: 2 files, 68 tests.
- `tsc --noEmit` passed.
- `git diff --check` produced no whitespace errors.

The regression coverage now verifies ordered/capped requested ranges, exact verified-range reconciliation, finalized-head and inclusive-count checks, semantic amount identities, block-row reconciliation, unavailable-result boundaries, lowercase canonical hashes, case-variant duplicate rejection, empty/cross-block evidence cases, and typed failures for non-bigint or negative fee scalars.

## QA fix round 2: RED evidence

After re-review of commit `cfa5cb9af436ed207e6b83a1a5bfdd1bc3113391`, the following regressions were added before production changes:

```bash
npx vitest run tests/eth_fee_cross_check
```

The pre-fix result was 3 failures out of 78 tests. The literal failures were:

```text
accepts an rpc access gap with provider provenance and no verified evidence
Unavailable snapshots require a gap and no source provenance.

returns safeParse=false without throwing for invalid aggregate wei text
SyntaxError: Cannot convert not-wei to a BigInt

returns safeParse=false without throwing for a null block metric
Error: Block metrics must be complete.
```

The malformed nested block ETH amount regression was already returned as `success: false`; it remains in the suite to lock down the complete nested-input boundary.

## QA fix round 2: GREEN and verification

Commands run after the total-validation changes:

```bash
npx vitest run tests/eth_fee_cross_check
npm run typecheck
git diff --check
```

Results:

- Focused Vitest suite passed: 2 files, 78 tests.
- `tsc --noEmit` passed.
- `git diff --check` produced no whitespace errors.

Coverage now additionally proves that snapshot `safeParse` does not throw for malformed aggregate wei, null block metrics, or malformed nested ETH amounts; unavailable results require gaps but permit legitimate source provenance; and the calculator rejects malformed transaction/receipt hashes and every requested negative blob-gas scalar as typed schema evidence.
