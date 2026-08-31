# Codex F2 ETH history gateway validation report

Date: 2026-08-31 (Asia/Seoul)

## Decision

`ready_for_owner_review`

The implementation was rebuilt on current `origin/main`, validated with Node.js 24, and left unmerged. GitHub Actions were not used.

## Repository and revision identity

| Item | Value |
|---|---|
| Repository | `capitalparser/onchain-pulse-mcp` |
| Pull request | `#50` |
| Target branch | `feat/eth-history-gateway` |
| PR old base | `1c5658dbb124a06ad084f66915d29641b812de08` |
| PR old head | `145a294eeea71d50f88ceffb3f5950b4909bfa24` |
| Current `origin/main` | `78c1915f4e5f48f7d6fdf160abb6aadeefb6d091` |
| Refreshed implementation SHA | `318cb9e833ce4c85cb30f754fb3e5749500f28c6` |
| Node.js | `v24.15.0` |
| npm | `11.12.1` |

PR #53 is present through `4b9b96c331863bb22c9d32561e0e1314a4c2c7a7`; PR #54 is present at current main `78c1915f4e5f48f7d6fdf160abb6aadeefb6d091`.

## Branch refresh and conflict resolution

The existing managed checkout was clean before switching from `feat/robinhood-chain-pulse-followups` to the existing target branch. No repository clone or manually managed worktree was created.

The target branch was rebased onto current `origin/main`. The only conflict was the import section in `src/index.ts`. It was resolved by retaining both the history store import and current-main Robinhood CLI import. No bulk `ours` or `theirs` resolution was used.

The refreshed diff does not change `package.json`, `package-lock.json`, `src/server.ts`, `tests/server.test.ts`, or the Robinhood Chain implementation and tests. Current main therefore retains:

- Node 24 and Vitest 4 dependency state;
- `get_robinhood_chain_pulse` and the current MCP tool count;
- bounded `unknown_tool`, `invalid_arguments`, and `tool_execution_failed` errors;
- `robinhood-rpc` source-license policy;
- Robinhood Chain CLI, server, source, and security behavior.

During focused review, three fail-closed gaps in the old PR were repaired with red-green regression tests:

1. duplicate metric keys inside one `metrics=` parameter are rejected instead of silently deduplicated;
2. equally latest revisions are ambiguous when their public provenance differs, not only when value, unit, or methodology differs;
3. a composite run with no usable observations from either source family is `failed`, while one usable family remains `partial`.

## Exact validation commands and results

```text
node --version                                      PASS  v24.15.0
npm --version                                       PASS  11.12.1
npm ci                                              PASS
npm run typecheck                                   PASS
npm test                                            PASS  1058 passed / 11 skipped
npm run build                                       PASS
npm audit --omit=dev                                PASS  0 vulnerabilities
```

`npm ci` reported one existing low-severity development dependency advisory. The production-only audit reported zero vulnerabilities. No force install, legacy peer dependency override, or audit fix was used.

Focused regression command:

```text
npx vitest run \
  tests/frontend_contract/eth_history.test.ts \
  tests/dashboard/console_history_provider.test.ts \
  tests/dashboard/console_history_gateway.test.ts \
  tests/intelligence_core/eth_intelligence_collection.test.ts \
  tests/intelligence_core/eth_value_capture_adapter.test.ts \
  tests/intelligence_core/eth_ecosystem_capture_adapter.test.ts \
  tests/server.test.ts \
  tests/robinhood_chain_pulse \
  tests/cli/robinhood_chain_pulse.test.ts
```

Result: `13` files passed, `137` tests passed.

The three new regressions were first observed failing against the refreshed old implementation, then passed after the bounded fixes.

## Composite collection smoke

A temporary path outside the repository was used:

```text
OPM_INTELLIGENCE_HISTORY_PATH=<mktemp>/intelligence-history.jsonl npm run intelligence-collect
```

Live result:

- run status: `partial`;
- protocol value-capture snapshot: `partial`, two observations emitted;
- ecosystem snapshot: `partial`, no eligible observation emitted;
- Dune execution was not authorized because BYOK was unavailable;
- GrowThePie origin-day coverage was incomplete at the live cutoff;
- successful protocol observations were preserved rather than discarded;
- missing ecosystem metrics were not replaced with zero.

A second live invocation emitted no new rows and reported the same two IDs as duplicates. Controlled tests additionally cover complete, one-family failure, one-family unavailable, and both-family unavailable behavior without exposing provider exception text.

## HTTP history smoke

Port `8788` was already occupied by an unrelated local process and was not disturbed. The same gateway was started on loopback port `8798` with the temporary history path.

```text
GET /api/health                                                    200
GET /api/v1/eth/history?...total_burn...settlement_cost_share      200 unavailable
GET /api/v1/eth/history?...net_issuance...l2_rent_paid             200 partial, 2 points
GET /api/v1/eth/history?...duplicate metric key                    400 invalid_history_query
```

All responses inspected during the smoke test included:

```text
cache-control: no-store
x-content-type-options: nosniff
```

The user-specified metrics were genuinely unavailable in the live collection because their source evidence was incomplete. The gateway returned empty series with `metric_not_collected`; it did not manufacture zero or replace the response with a fixture. The two metrics that were actually collected returned their observed and ingested timestamps and numeric values.

## Point-in-time, revision, and missing-value controls

Automated tests verify:

- `observed_at <= cutoff` and `ingested_at <= cutoff`;
- exclusion of a revision ingested after the requested cutoff;
- latest known revision selection per metric and UTC day;
- exclusion of equally latest conflicts without averaging or arbitrary selection;
- real zero retention;
- no filling of missing days;
- strict metric allowlist, maximum eight metrics, bounded range/window/cutoff;
- rejection of unknown, repeated, duplicate, malformed, and future query input;
- one store read per request, maximum 20,000 candidate revisions, maximum eight series, and maximum 366 points per series;
- malformed persisted rows fail closed through a bounded gateway error.

## Browser leakage scan

The live response key scan and source diff review found no browser exposure of:

- observation IDs;
- raw provider payloads;
- API keys, authorization headers, private keys, or seed phrases;
- RPC URLs, BYOK state, or paid-source entitlement state;
- internal provider exception text.

The browser response contains only bounded metric metadata, selected points, source references, quality gaps, methodology, and source-license summaries.

## Remaining risks and sequencing

- The JSONL provider performs exactly one logical store read per request and bounds candidate revisions to 20,000, but the current file-backed store still loads the append-only file before filtering. A larger production history requires indexed storage or rotation.
- This PR is a forward-history gateway, not a backfill. Missing dates remain missing.
- PR #51 owns the revision-safe semantic observation-ID helper, `appendMany`, and ecosystem backfill semantics. PR #50 correctly selects multiple persisted revisions, but its pre-#51 collector adapters retain their existing ID construction until that dependent PR is restacked after this PR reaches main.
- Live source coverage was partial and Dune BYOK was absent. These were external evidence constraints, not substituted fixture success.
- The full dependency graph retains one development-only low advisory; production dependencies have zero reported advisories.

## Final decision

`ready_for_owner_review`

Validated implementation commit: `318cb9e833ce4c85cb30f754fb3e5749500f28c6`.

PR #50 must remain open and unmerged until owner review.
