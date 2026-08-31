# Codex execution prompt — F2 ETH history gateway

Work directly from GitHub. Do not create a new repository and do not use GitHub Actions.

## Repositories

Primary implementation:

```text
https://github.com/capitalparser/onchain-pulse-mcp
branch: feat/eth-history-gateway
```

Consumer reference only:

```text
https://github.com/capitalparser/digital-asset-intelligence-console
PR: #1
```

Do not modify the console F1 branch unless a validated contract incompatibility is found. The primary task is to validate and repair the `onchain-pulse-mcp` history branch.

## Product boundary

The history API supports evidence-aware analysis of Ethereum ecosystem growth versus ETH value accrual. It is not a price forecast, trade signal, or execution API.

The browser must not receive:

- credentials or RPC URLs;
- BYOK or paid-source entitlement state;
- raw vendor payloads;
- arbitrary wallet/entity history;
- internal observation ids;
- provider exception text.

Missing observations must remain missing; never substitute zero.

## Required validation

Use Node.js 24 and run:

```bash
node --version
npm --version
npm ci
npm run typecheck
npm test
npm run build
```

Fix all failures on the same branch and rerun the full sequence.

## Focused tests

Confirm the following behavior:

1. `npm run intelligence-collect` uses the composite ETH collection path.
2. A successful run writes both protocol and ecosystem metrics.
3. If one source family fails, the other is persisted and the run reports `partial`.
4. Repeated identical collection is idempotent.
5. `GET /api/v1/eth/history` rejects unsupported metrics, excessive metric count, duplicate parameters, unknown parameters, invalid timestamps, and future cutoffs.
6. `observed_at <= cutoff` and `ingested_at <= cutoff` are both enforced.
7. The latest revision known by the cutoff is selected.
8. Conflicting equally-latest revisions are omitted and reported as ambiguous.
9. One daily point at most is returned per metric.
10. Missing dates are not filled with zero; a valid zero is preserved.
11. Source-license restrictions and attribution requirements are reported.
12. Provider failures return bounded 503 responses without leaking exception text.
13. Invalid observations return bounded 502 responses.
14. `cache-control: no-store` and `x-content-type-options: nosniff` are present.

## Runtime smoke test

Use a temporary history path:

```bash
export OPM_INTELLIGENCE_HISTORY_PATH="$(mktemp -d)/intelligence-history.jsonl"
```

Where external sources are reachable:

```bash
npm run intelligence-collect
npm run console-gateway
curl -fsS http://127.0.0.1:8788/api/health
curl -fsS 'http://127.0.0.1:8788/api/v1/eth/history?range=30d&window=30d&metrics=eth.total_burn_eth,eth.l2_settlement_cost_share'
```

If external sources are blocked, distinguish environment failure from application failure and validate the bounded unavailable/partial behavior with tests or controlled fixtures.

## Code review

Check specifically for:

- future-information leakage through late ingestion;
- unbounded JSONL reads or response size;
- unsupported metric keys bypassing the allowlist;
- source or error-text leakage;
- same-day revision ambiguity;
- unit mismatches;
- timezone and UTC-day errors;
- incorrect treatment of zero;
- schema drift between the history builder and gateway;
- accidental change to existing Overview behavior.

## Required output

Commit to the same branch:

```text
docs/CODEX_F2_HISTORY_VALIDATION_REPORT.md
```

The report must include exact commands, Node/npm versions, test/build results, runtime smoke-test result, unresolved risks, and one final status:

```text
ready_for_owner_review
```

or

```text
not_ready
```

Leave the PR unmerged for owner review.
