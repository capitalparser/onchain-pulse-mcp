# Ethereum ecosystem growth and ETH value accrual — v2 methodology

## Decision question

Ethereum ecosystem activity is not the same economic object as demand for ETH.

```text
Ethereum ecosystem growth
├─ L2 user activity
├─ stablecoin supply
├─ RWA and DeFi activity
└─ cross-chain settlement

ETH value accrual
├─ protocol fees and burn
├─ L2 rent paid to Ethereum
├─ security and staking demand
├─ actual collateral and credit creation
└─ reserve-asset demand
```

The first can expand while the second remains flat or weak. The model therefore reports the two states separately and no longer promotes fee, burn, and L2-rent improvements to `structural` without collateral or reserve-demand confirmation.

## V1 data source

The first implementation uses GrowThePie because one bounded source exposes:

- production-chain metadata;
- chain type and data-availability layer;
- fees paid by users;
- rent paid by L2s to Ethereum;
- stablecoin supply on Ethereum and L2s.

Endpoints:

```text
https://api.growthepie.com/v1/master.json
https://api.growthepie.com/v1/export/fees.json
https://api.growthepie.com/v1/export/rent_paid.json
https://api.growthepie.com/v1/export/stables_mcap.json
```

The adapter includes only chains satisfying all of the following at collection time:

```text
deployment == PROD
chain_type == rollup
da_layer contains Ethereum
supports fees, rent_paid, and stables_mcap
```

External-DA and non-rollup chains are excluded from Ethereum settlement attribution and retained in an explicit coverage list. A chain is not treated as missing before its declared launch date.

## Metrics

### Ethereum-settled L2 user fees

```text
l2_user_fees_usd
= sum of fees_paid_usd
  across included production Ethereum-DA rollups
```

This is an ecosystem-activity measure. It is not ETH revenue.

### Rent paid to Ethereum

```text
l2_rent_paid_usd
= sum of rent_paid_usd
  across the same included chains and period
```

This is the observed Ethereum settlement/data-availability cost paid by the included L2 scope.

### Settlement-cost share

```text
l2_settlement_cost_share
= l2_rent_paid_usd / l2_user_fees_usd
```

The numerator and denominator use the same chains and aligned UTC-day window. A missing origin-day observation remains missing; it is never replaced with zero.

A falling share can coexist with rising absolute rent. That combination means Ethereum is receiving more aggregate rent while the L2 economy grows faster than the amount paid to Ethereum.

### Ethereum ecosystem stablecoin supply

```text
ethereum_ecosystem_stablecoin_supply_usd
= Ethereum L1 stablecoin supply
+ stablecoin supply on included Ethereum-DA rollups
```

This is an ecosystem-liquidity measure. It does not imply that the stablecoins are backed by ETH or that their users hold ETH directly.

## Compass v2 classification

The Demand Compass reports:

```text
ecosystem_state
├─ expanding
├─ stable
├─ contracting
└─ unknown

eth_capture_state
├─ strengthening
├─ stable
├─ weakening
└─ unknown

classification
├─ growth_with_capture
├─ growth_without_capture
├─ capture_without_growth
├─ weak
└─ data_warning
```

The legacy compact judgment is retained for dashboard/backtest compatibility, but `structural` now requires `collateral_and_reserve` confirmation. Fee, settlement, and supply evidence without such confirmation is capped at `flow-driven`.

## Point-in-time and provenance controls

Every canonical metric observation preserves:

```text
source_at
observed_at
ingested_at
source_refs
methodology_version
window
cutoff_day
chain_scope
included and excluded coverage counts
```

The current source-license registry marks GrowThePie as:

```text
commercial_review_required
attribution_required = true
```

The metrics are available for internal research. Commercial redistribution or embedding in a paid external product remains blocked until a written rights review or contract override is recorded.

## Explicit limitations

This slice does **not** estimate:

- actual ETH collateral activated by users;
- ETH-family collateral share across all lending markets;
- stablecoin debt attributable to ETH collateral;
- institution or protocol reserve-asset demand for ETH;
- unique ETH locked after removing LST/LRT and rehypothecation duplication;
- RWA value attributable specifically to Ethereum or ETH financing;
- cross-L2 liquidity fragmentation or transfer latency.

The existing Aave reserve-supply and Lido backing observations remain point-in-time evidence only. They cannot support a collateral-demand trend or structural ETH conclusion by themselves.

## Next evidence gates

1. Index actual collateral activation and debt positions for Aave/Spark.
2. Separate single-collateral directly attributable debt from multi-collateral estimated debt.
3. Build asset-lineage reconciliation for native ETH, LSTs, LRTs, lending claims, and recursive collateral.
4. Add chain-bounded RWA data only after source definition and commercial-use rights are reviewed.
5. Backtest whether the new `growth_without_capture` classification contains incremental information beyond price and broad liquidity factors.
