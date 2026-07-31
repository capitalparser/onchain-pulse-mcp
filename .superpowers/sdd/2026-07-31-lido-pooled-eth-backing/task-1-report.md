# Task 1 — Strict Lido accounting domain report

## Scope

Created only the Task 1 domain files:

- `src/lido_pooled_eth_backing/types.ts`
- `src/lido_pooled_eth_backing/metrics.ts`
- `tests/lido_pooled_eth_backing/types.test.ts`
- `tests/lido_pooled_eth_backing/metrics.test.ts`

No adapter, MCP tool, server, documentation, live-test, network, or remote
operation was performed.

## RED

Tests were written before either production module existed. After dependencies
were installed from the lockfile, the focused command failed for the expected
missing-feature reason:

```text
$ npm test -- tests/lido_pooled_eth_backing/types.test.ts tests/lido_pooled_eth_backing/metrics.test.ts

FAIL  tests/lido_pooled_eth_backing/metrics.test.ts
Error: Failed to load url ../../src/lido_pooled_eth_backing/metrics.js
Does the file exist?

FAIL  tests/lido_pooled_eth_backing/types.test.ts
Error: Failed to load url ../../src/lido_pooled_eth_backing/types.js
Does the file exist?

Test Files  2 failed (2)
Tests  no tests
```

## GREEN

Implemented strict Zod contracts and bigint-only builders. The focused test
suite then passed:

```text
Test Files  2 passed (2)
Tests  23 passed (23)
```

Coverage includes canonical bounded decimals; complete exact accounting
identities; `deposited_for_current_report <= deposited_since_last_report`;
five literal broader `null` metrics and five permanent gaps; fresh/stale source
coherence; unavailable snapshots with exactly one bounded failure and no
partials; duplicate/missing gaps; malformed nested `safeParse`; and builder
rejection of impossible evidence.

## REFACTOR

Replaced a dynamically keyed bigint conversion with an explicitly typed
`AccountingBigints` conversion, preserving behavior while satisfying strict
TypeScript checks. Focused tests remained green after the refactor.

## Final verification

```text
$ npm test
Test Files  55 passed | 5 skipped (60)
Tests  655 passed | 7 skipped (662)

$ npm run typecheck
> tsc --noEmit

$ npm run build
ESM Build success
DTS Build success

$ git diff --check
(no output)
```

The skipped tests are pre-existing default-skipped live tests. No Lido live
request was made.

## QA remediation — external accounting, uint256, and provenance

After QA requested changes against `f9414f57ba392e258f0fee70ad97c5a21a49cb9d`,
new regressions were added before changing production code.

### RED

```text
$ npm test -- tests/lido_pooled_eth_backing/types.test.ts tests/lido_pooled_eth_backing/metrics.test.ts

7 failed | 24 passed (31)

expected undefined to be '7'
expected [Function] to throw an error
expected true to be false
```

The failures proved the prior domain omitted public raw `external_ether_wei`,
did not reject an `externalEther` value that differed from the computed floor,
accepted `2^256`, and accepted a configured unavailable snapshot with a
fabricated but internally matching source.

### GREEN

The domain now requires raw `externalEther`; publishes it as
`accounting.external_ether_wei`; recomputes the share-ratio floor and requires
equality before using the verified raw amount in the metrics and total identity.
All decimal public fields use a canonical `uint256` contract and the builder
rejects bigint inputs above `2^256 - 1`. Configured provenance is exactly one
`ethereum_rpc` source and one
`lido_v4_finalized_accounting_evidence` status; only `rpc_not_configured` may
have empty provenance.

```text
Test Files  2 passed (2)
Tests  31 passed (31)

$ npm run typecheck
> tsc --noEmit
```
