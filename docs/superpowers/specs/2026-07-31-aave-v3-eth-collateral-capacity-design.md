# Aave V3 Ethereum ETH Collateral Capacity Design

## Goal

Add a bounded, read-only Ethereum Execution RPC verifier for ETH-family assets
supplied to the Aave V3 Ethereum Core market. The verifier reports:

- supplied aToken claims in native token units;
- their exact Aave-oracle ETH-equivalent value;
- the subset whose reserve configuration permits collateral use.

It does not relabel reserve-level supply as actual user collateral usage,
unique ETH locked, or gross collateral demand. Those broader metrics remain
`null` until user-level positions and cross-protocol provenance are indexed.

## Why Supply Is Not Actual Collateral

Aave suppliers receive aTokens, but each user position can enable or disable
an eligible reserve as collateral. Reserve-level aToken supply therefore proves
available supplied capacity, not how much is currently backing debt.

LST and LRT positions also derive from ETH already counted by their staking or
restaking protocol. Summing WETH and derivatives across protocols without
lineage reconciliation would double count the same economic ETH.

Consequently this slice exposes:

- `eth_family_supplied`: verified Aave reserve supply;
- `collateral_eligible_supplied`: the supplied subset for reserves whose
  configuration has collateral usage enabled;
- `actual_user_collateral`: `null`;
- `net_eth_locked`: `null`;
- `gross_eth_collateral`: `null`;
- `rehypothecation_ratio`: `null`.

## Official Source Contracts

The implementation is pinned to the official Aave Address Book snapshot
[`4ae19b95f84b077c28633ca1d0f9a6750a3ea1d4`](https://github.com/aave-dao/aave-address-book/commit/4ae19b95f84b077c28633ca1d0f9a6750a3ea1d4),
dated 2026-07-25. The Ethereum Core market uses:

- PoolAddressesProvider:
  `0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e`;
- the provider-resolved PoolDataProvider via `getPoolDataProvider()`;
- the provider-resolved AaveOracle via `getPriceOracle()`.

The verifier uses the official Aave V3 Origin interfaces:

- `IPoolDataProvider.getReserveConfigurationData(asset)`;
- `IPoolDataProvider.getATokenTotalSupply(asset)`;
- `IAaveOracle.getAssetPrice(asset)`.

References:

- [Aave V3 Ethereum address book](https://github.com/aave-dao/aave-address-book/blob/4ae19b95f84b077c28633ca1d0f9a6750a3ea1d4/src/ts/AaveV3Ethereum.ts)
- [IPoolAddressesProvider](https://github.com/aave-dao/aave-v3-origin/blob/main/src/contracts/interfaces/IPoolAddressesProvider.sol)
- [IPoolDataProvider](https://github.com/aave-dao/aave-v3-origin/blob/main/src/contracts/interfaces/IPoolDataProvider.sol)
- [IAaveOracle](https://github.com/aave-dao/aave-v3-origin/blob/main/src/contracts/interfaces/IAaveOracle.sol)
- [Aave supplying and collateral behavior](https://aave.com/help/supplying/supply-tokens)

## Bounded Asset Coverage

The fixed Ethereum Core ETH-family coverage set is:

| Symbol | Underlying |
|---|---|
| WETH | `0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2` |
| wstETH | `0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0` |
| cbETH | `0xBe9895146f7AF43049ca1c1AE358B0541Ea49704` |
| rETH | `0xae78736Cd615f374D3085123A210448E74Fc6393` |
| weETH | `0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee` |
| osETH | `0xf1C9acDc66974dFB6dEcB12aA385b9cD01190E38` |
| ETHx | `0xA35b1B31Ce002FBF2058D22F30f95D405200A15b` |
| rsETH | `0xA1290d69c65A6Fe4DF752f95823fae25cB99e5A7` |
| tETH | `0xD11c452fc99cF405034ee446803b6F6c1F6d5ED8` |
| ezETH | `0xbf5495Efe5DB9ce00f80364C8B423567e58d2110` |

Every listed asset has 18 decimals in the pinned Address Book. The adapter
still verifies the on-chain reserve decimals at the requested finalized block.
Any missing, inactive, zero-price, zero-address, wrong-decimal, malformed, or
inconsistent asset invalidates the complete aggregate. It never emits a
partial synthetic total.

## Finalized RPC Evidence

For each uncached request, the adapter:

1. calls `eth_chainId` and requires Ethereum mainnet (`0x1`);
2. calls `eth_getBlockByNumber("finalized", false)` and binds the snapshot to
   its exact number, hash, and timestamp;
3. calls the PoolAddressesProvider for the current data-provider and oracle
   addresses at that exact block;
4. batch-calls configuration, aToken total supply, and price for all ten
   assets, plus WETH price, at the same exact hexadecimal block tag.

The maximum is 35 logical JSON-RPC requests in four HTTP batch round trips:
chain id, finalized block, two provider resolutions, 10 configurations,
10 supplies, and 11 prices. There are no retries.

Provider URLs can contain credentials. They are environment-only and never
appear in public output, error detail, logs, or cache keys.

## Exact Arithmetic

All raw values and arithmetic use `bigint`. For an 18-decimal asset:

```text
ETH-equivalent wei numerator =
  supplied raw units * asset oracle price

ETH-equivalent wei denominator =
  WETH oracle price
```

The public exact amount preserves the rational result:

```ts
interface ExactEthEquivalent {
  wei_floor: string;
  eth_floor: string;
  remainder: string;
  denominator: string;
}
```

The identity is:

```text
supplied_raw * asset_price
= wei_floor * denominator + remainder
```

with `0 <= remainder < denominator`. Aggregate totals sum rational values
using exact bigint fraction arithmetic before producing one floor and
remainder. No value-carrying integer passes through JavaScript floating point.

## Public MCP Contract

Register:

```ts
get_eth_collateral_demand({})
```

The first version has no caller-controlled range or asset list. It returns one
finalized snapshot:

```ts
interface EthCollateralDemandSnapshot {
  status: "verified" | "unavailable";
  summary: string;
  methodology: "eth-collateral-demand-aave-v3-v1";
  verified_block: {
    number: number;
    hash: string;
    timestamp: number;
  } | null;
  metrics: {
    eth_family_supplied: ExactEthEquivalent | null;
    collateral_eligible_supplied: ExactEthEquivalent | null;
    actual_user_collateral: null;
    net_eth_locked: null;
    gross_eth_collateral: null;
    rehypothecation_ratio: null;
  };
  assets: EthCollateralAssetEvidence[];
  identities: {
    supplied_equals_asset_sum: true;
    eligible_equals_enabled_asset_sum: true;
  } | null;
  coverage: {
    aave_v3_ethereum_core_complete: boolean;
    user_collateral_usage_complete: false;
    net_eth_locked_complete: false;
    gross_collateral_complete: false;
    rehypothecation_complete: false;
  };
  sources: string[];
  source_status: EthCollateralSourceStatus[];
  gaps: EthCollateralGap[];
  capabilities: {
    ethereum_rpc_active: boolean;
  };
}
```

Successful snapshots always carry explicit coverage gaps for the four
unimplemented broader metrics. Unavailable snapshots contain no partial
asset rows, verified block, identities, or aggregate values.

## Failure and Cache Semantics

Bounded gap codes are:

- `rpc_not_configured`;
- `rpc_access_gap`;
- `rpc_chain_mismatch`;
- `rpc_finality_gap`;
- `rpc_schema_drift`;
- `rpc_evidence_mismatch`;
- `source_stale`;
- `actual_user_collateral_not_indexed`;
- `net_eth_locked_not_reconciled`;
- `gross_collateral_not_reconciled`;
- `rehypothecation_not_reconciled`.

Only verified finalized snapshots are cached for 30 minutes. Identical
concurrent calls share work. If a refresh fails, previously verified evidence
may be returned with `source_stale`; unavailable or partial evidence is never
cached as truth.

## Non-Goals

- user address enumeration;
- account-level collateral toggles or debt attribution;
- Aave Prime, EtherFi, Lido, Horizon, or other Aave markets;
- Spark, Maker/Sky, EigenLayer, Lido, bridge, LP, or Pendle aggregation;
- historical indexing;
- USD TVL;
- valuation, trading, or recommendation language;
- integration into `get_eth_value_capture` before cross-protocol overlap is
  reconciled.
