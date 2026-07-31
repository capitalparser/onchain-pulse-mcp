# SparkLend Ethereum ETH Collateral Capacity Design

## Goal

Add a bounded, read-only finalized Execution RPC verifier for ETH-family assets
supplied to SparkLend on Ethereum. The verifier reports SparkLend reserve supply
and the subset eligible for collateral use. It does not report actual user
collateral, unique ETH locked, cross-protocol gross collateral, or a combined
Aave-plus-Spark total.

This slice also deepens the finalized Aave-V3-market RPC module. SparkLend and
Aave V3 Core share the same transport, provider-resolution, ABI-decoding,
finality, cache, and failure semantics. Those mechanics belong behind one
interface with two concrete adapters.

## Domain Boundary

SparkLend is based on Aave V3, but Spark aTokens are separate claims and the
same ETH/LST/LRT families also appear in Aave V3 Core. A simple sum can
overstate economic ETH when staking derivatives or recursively borrowed assets
are reused across protocols.

This slice therefore exposes:

- `spark_eth_family_supplied`: verified SparkLend reserve supply;
- `spark_collateral_eligible_supplied`: supplied capacity whose Spark reserve
  configuration permits collateral use;
- `combined_aave_spark_supplied`: `null`;
- `actual_user_collateral`: `null`;
- `net_eth_locked`: `null`;
- `gross_eth_collateral`: `null`;
- `rehypothecation_ratio`: `null`.

The existing Aave `get_eth_collateral_demand` interface remains unchanged.
SparkLend is surfaced through a separate protocol-specific tool until an
explicit overlap-reconciliation model exists.

## Official Source Contracts

The implementation is pinned to the official Spark Address Registry snapshot
[`b4ad0ef2edb16b5ef99a2ec3bd3bb31bcf7fc966`](https://github.com/sparkdotfi/spark-address-registry/commit/b4ad0ef2edb16b5ef99a2ec3bd3bb31bcf7fc966),
dated 2026-07-30. Spark identifies that registry as the primary source of truth
for canonical infrastructure addresses.

SparkLend Ethereum uses:

- PoolAddressesProvider:
  `0x02C3eA4e34C0cBd694D2adFa2c690EECbC1793eE`;
- provider-resolved PoolDataProvider via `getPoolDataProvider()`;
- provider-resolved AaveOracle via `getPriceOracle()`.

The compatible interface definitions are pinned to the official SparkLend core
snapshot
[`8120e495061dc3315f0a86f682f4ca645a418bf7`](https://github.com/sparkdotfi/sparklend-v1-core/commit/8120e495061dc3315f0a86f682f4ca645a418bf7):

- `IPoolDataProvider.getReserveConfigurationData(asset)`;
- `IPoolDataProvider.getATokenTotalSupply(asset)`;
- `IAaveOracle.getAssetPrice(asset)`.

References:

- [SparkLend canonical addresses](https://github.com/sparkdotfi/spark-address-registry/blob/b4ad0ef2edb16b5ef99a2ec3bd3bb31bcf7fc966/src/SparkLend.sol)
- [Ethereum token addresses](https://github.com/sparkdotfi/spark-address-registry/blob/b4ad0ef2edb16b5ef99a2ec3bd3bb31bcf7fc966/src/Ethereum.sol)
- [SparkLend IPoolDataProvider](https://github.com/sparkdotfi/sparklend-v1-core/blob/8120e495061dc3315f0a86f682f4ca645a418bf7/contracts/interfaces/IPoolDataProvider.sol)

## Fixed ETH-Family Coverage

| Symbol | Underlying |
|---|---|
| WETH | `0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2` |
| wstETH | `0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0` |
| rETH | `0xae78736Cd615f374D3085123A210448E74Fc6393` |
| weETH | `0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee` |
| rsETH | `0xA1290d69c65A6Fe4DF752f95823fae25cB99e5A7` |
| ezETH | `0xbf5495Efe5DB9ce00f80364C8B423567e58d2110` |

All six assets are expected to have 18 decimals. The finalized on-chain reserve
configuration remains authoritative. Any missing, inactive, wrong-decimal,
zero-price, malformed, or inconsistent asset invalidates the complete Spark
aggregate.

## Deep Finalized-Market RPC Module

Create one internal module with the interface:

```ts
interface FinalizedAaveV3MarketSpec {
  marketId: string;
  cacheName: string;
  poolAddressesProvider: string;
  assets: readonly { symbol: string; underlying: string }[];
}

type FinalizedAaveV3MarketResult =
  | { status: "verified"; evidence: FinalizedAaveV3MarketEvidence; stale: boolean }
  | { status: "unavailable"; code: AaveV3MarketRpcFailureCode };

fetchFinalizedAaveV3Market(spec, { rpcUrl }, context)
```

This interface hides:

- RPC configuration and provider binding per context and market;
- mainnet/finalized-head checks;
- the five ABI selectors and address encoding;
- exact tuple/word/bool decoding;
- complete unique batch-ID reconciliation;
- fixed four-round execution;
- verified-only cache, concurrent coalescing, and stale raw-evidence fallback;
- bounded failure classification and secret redaction.

The module caches normalized verified evidence rather than a public
protocol-specific Snapshot. Each adapter owns public terminology, permanent
gaps, and schema validation.

The deletion test justifies the module: deleting it would reproduce identical
transport, ABI, cache, and failure complexity in both Aave and Spark adapters.
The shared interface provides leverage while keeping public protocol contracts
local to their adapters.

## Finalized RPC Bounds

For a market with `N` fixed assets:

1. batch `eth_chainId` and `eth_getBlockByNumber("finalized", false)`;
2. resolve PoolDataProvider and AaveOracle at the exact block;
3. read `N` configurations and `N` aToken supplies;
4. read `N` asset prices plus one duplicate WETH reference price.

Logical request count:

```text
2 + 2 + 2N + (N + 1) = 5 + 3N
```

- Aave V3 Core remains 35 calls for 10 assets.
- SparkLend uses 23 calls for 6 assets.

Every `eth_call` uses the same canonical hexadecimal finalized block tag.
There are no retries. The provider URL remains environment-only and is absent
from output, errors, logs, and cache keys.

## Exact Arithmetic

Spark reuses the existing exact ETH-equivalent representation:

```ts
interface ExactEthEquivalent {
  wei_floor: string;
  eth_floor: string;
  remainder: string;
  denominator: string;
}
```

For each 18-decimal asset:

```text
supplied_raw * asset_price
= wei_floor * WETH_price + remainder
```

Aggregate fractions are canonically reduced. All value arithmetic uses
`bigint`; no token or price value crosses JavaScript floating point.

## Public MCP Contract

Register:

```ts
get_spark_eth_collateral_capacity({})
```

The input is a strict empty object. Successful output:

```ts
interface SparkCollateralCapacitySnapshot {
  status: "verified" | "unavailable";
  summary: string;
  methodology: "spark-eth-collateral-capacity-v1";
  verified_block: { number: number; hash: string; timestamp: number } | null;
  metrics: {
    spark_eth_family_supplied: ExactEthEquivalent | null;
    spark_collateral_eligible_supplied: ExactEthEquivalent | null;
    combined_aave_spark_supplied: null;
    actual_user_collateral: null;
    net_eth_locked: null;
    gross_eth_collateral: null;
    rehypothecation_ratio: null;
  };
  assets: SparkCollateralAssetEvidence[];
  identities: {
    supplied_equals_asset_sum: true;
    eligible_equals_enabled_asset_sum: true;
  } | null;
  coverage: {
    spark_lend_ethereum_complete: boolean;
    aave_spark_overlap_reconciled: false;
    user_collateral_usage_complete: false;
    net_eth_locked_complete: false;
    gross_collateral_complete: false;
    rehypothecation_complete: false;
  };
  sources: string[];
  source_status: SparkCollateralSourceStatus[];
  gaps: SparkCollateralGap[];
  capabilities: { ethereum_rpc_active: boolean };
}
```

Verified snapshots always contain these permanent gaps:

- `aave_spark_overlap_not_reconciled`;
- `actual_user_collateral_not_indexed`;
- `net_eth_locked_not_reconciled`;
- `gross_collateral_not_reconciled`;
- `rehypothecation_not_reconciled`.

Unavailable snapshots contain no partial block, asset, identity, or observed
aggregate evidence.

## Non-Goals

- changing the existing Aave public response;
- summing Aave and Spark supplied capacity;
- enumerating user positions or collateral toggles;
- integrating Spark Vaults, Liquidity Layer, Morpho, or Maker/Sky vaults;
- historical indexing or USD TVL;
- recommendations or valuation language;
- opted-in live RPC execution during default tests.
