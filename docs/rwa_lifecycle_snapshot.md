# RWA Lifecycle Snapshot

## Frame

This is a read-only snapshot contract. It reports lifecycle depth signals and gaps. It never recommends a trade or assigns investment merit.

## Proposed Tool

`rwa_lifecycle_snapshot`

## Response Shape

```json
{
  "as_of": "2026-05-30T00:00:00Z",
  "reading": "shallow | developing | workflow_linked | unknown",
  "confidence": 0.0,
  "inputs": {
    "aum_usd": null,
    "holder_count": null,
    "transfer_count_30d": null,
    "active_wallets_30d": null,
    "chain_distribution": [],
    "redemption_evidence": "present | absent | unknown",
    "collateral_usage_evidence": "present | absent | unknown",
    "official_ledger_evidence": "present | absent | unknown"
  },
  "gaps": [
    "holder_concentration_gap",
    "transfer_activity_gap",
    "collateral_usage_gap",
    "official_ledger_gap"
  ],
  "sources": [],
  "stale_data": []
}
```

## Reading Rules

- `shallow`: AUM/token display exists, but rights and transfer activity are weak or unknown.
- `developing`: rights linkage or repeated transfer activity exists, but workflow evidence is incomplete.
- `workflow_linked`: collateral, settlement, reporting, or audit-support workflow evidence exists.
- `unknown`: source access or data quality is insufficient.

## Non-Goals

- No price target.
- No buy/sell/hold language.
- No legal ownership conclusion.
- No accounting conclusion.
