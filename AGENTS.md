# onchain-pulse-mcp — Project System Context

This project is a read-only MCP server that exposes onchain market-state
signals as queryable Snapshots. It reports Pulse, Score, Reading, confidence,
sources, stale data, and BYOK capabilities without prescribing trades.

## Module Responsibilities

| Module | Responsibility | Location |
|---|---|---|
| MCP Tools | Public query interface and response schema | `src/` tool modules |
| Adapters | Concrete wrappers around external Sources | `src/` adapter modules |
| Pulse Domain | Score, Reading, confidence, stale data, and metric key rules | `src/` domain modules |
| ETH Value Capture Domain | Window arithmetic, definitions, ratios, and specialized output schema | `src/eth_value_capture/` |
| ETH Value Sources | Coin Metrics supply boundaries and controlled Dune fee/rent access | `src/adapters/eth_supply_coinmetrics.ts`, `src/adapters/eth_value_dune.ts` |
| Versioned Queries | Deterministic, partition-bounded external SQL | `src/queries/` |
| Config | Source TTLs, BYOK env handling, weights, thresholds | `src/` config modules |
| Tests/Fixtures | Golden Snapshots and adapter/domain regressions | `tests/` |
| ADRs | Durable decisions about terminology, history, and rescue findings | `docs/adr/` |

## Feature Addition Rules

- This is a query interface, not a recommender. Do not introduce buy/sell/hold
  language into tool responses.
- New Sources must be wrapped by Adapters and surfaced in `sources`.
- BYOK keys must be read from env and never persisted.
- Snapshot fields must expose stale or missing data rather than hiding it behind
  a single quality boolean.
- New value-capture metrics must declare overlap and derivation boundaries.
  Missing fee components and missing UTC boundaries remain `null`, never zero.
- Preserve flat metric key conventions unless an ADR changes them.

## Verification

- Run `npm test`.
- Run `npm run typecheck`.
- Run `npm run build` when changing package or MCP surfaces.
