# EigenLayer ETHx bounded quote design

## Scope

Extend the finalized EigenLayer covered-LST quote view from 6/12 to 7/12 with
ETHx only. The fixed order is `stETH,rETH,cbETH,ETHx,osETH,lsETH,mETH`; the
five unquoted labels remain `ankrETH,oETH,swETH,wBETH,sfrxETH`.

## Evidence contract

At the one numeric finalized execution block, the adapter verifies the ETHx
strategy token `0xA35b1B31Ce002FBF2058D22F30f95D405200A15b`, StaderConfig
`0x4ABEF2263d5A5ED582FC9A9789a41D85b68d69DB`, StakePoolsManager
`0xcf5EA1b38380f6aF39068375516Daf40Ed70D299`, and StaderOracle
`0xF64bAe65f6f2a5277571143A24FaaFDFC0C2a737` through all five required
pointers. It then uses two manager `convertToAssets(uint256)` calls and one
Oracle `getExchangeRate()` tuple.

The 96-byte tuple is exactly `(reportingBlockNumber,totalETHBalance,
totalETHXSupply)`. The report block must not exceed the verified block. Both
direct conversions must exactly equal the full-precision floor
`amount*totalETHBalance/totalETHXSupply`, or identity `amount` if supply is
zero. No rounded rate is created or exposed.

`report_context` exposes only `ethx_oracle_reporting_block_number`, alongside
the existing lsETH epoch. It does not claim Stader backing, report freshness,
proxy implementation correspondence, redemption, or liquidity.

## Source authority

Conversion/oracle semantics are pinned to official
[`stader-labs/ethx` v1.1.0 commit
`1939e6c36087bf7cb437e4323f426219df6313b4`](https://github.com/stader-labs/ethx/tree/1939e6c36087bf7cb437e4323f426219df6313b4):
[`StakePoolsManager.convertToAssets`](https://github.com/stader-labs/ethx/blob/1939e6c36087bf7cb437e4323f426219df6313b4/contracts/StaderPoolManager.sol)
uses direct `Math.Rounding.Down` conversion and the
[`StaderOracle.getExchangeRate` struct](https://github.com/stader-labs/ethx/blob/1939e6c36087bf7cb437e4323f426219df6313b4/contracts/StaderOracle.sol)
supplies the reporting block, total ETH balance, and total ETHx supply. The deployed mainnet addresses
are separately pinned to its official current
[`README` commit `9d4a9211431d6c0cdf014bd64d3718cba4ce96ab`](https://github.com/stader-labs/ethx/blob/9d4a9211431d6c0cdf014bd64d3718cba4ce96ab/README.md);
the v1.1.0 README does not itself enumerate them.

## Appended RPC evidence

| ID | target | selector | exact expected result |
| --- | --- | --- | --- |
| 104 | ETHx token | `staderConfig()` `0x490ffa35` | StaderConfig |
| 105 | StakePoolsManager | `staderConfig()` `0x490ffa35` | StaderConfig |
| 106 | StaderConfig | `getETHxToken()` `0xcc45dabe` | ETHx token |
| 107 | StaderConfig | `getStakePoolManager()` `0x2ec5e018` | StakePoolsManager |
| 108 | StaderConfig | `getStaderOracle()` `0xdefd024d` | StaderOracle |
| 109 | StakePoolsManager | `convertToAssets(share)` `0x07a2d13a` | tuple-recomputed share quote |
| 110 | StakePoolsManager | `convertToAssets(custody)` `0x07a2d13a` | tuple-recomputed custody quote |
| 111 | StaderOracle | `getExchangeRate()` `0xe6aa216c` | exact 96-byte three-word tuple |

Every pointer is exact at the same finalized block. The bounded calls do not
prove runtime proxy-source correspondence; that remains a permanent gap.

## Boundaries

Methodology/cache become v4. A cold load remains five batches, now 111 logical
requests and 109 `eth_call`s, with IDs 1--111. Existing IDs 92--103 are
unchanged; ETHx appends IDs 104--111. Only the two covered seven-token partial
sums are non-null. All seven broad totals remain null and the permanent gap
set expands from 16 to 19 with ETHx report-freshness, proxy-upgradeability,
and backing-reconciliation gaps.
