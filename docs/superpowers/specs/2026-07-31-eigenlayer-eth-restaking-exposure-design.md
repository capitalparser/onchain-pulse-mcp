# EigenLayer ETH Restaking Exposure Design

**Date:** 2026-07-31  
**Base:** `90bd96353afee9af952c165c41fe66c2c4682c32`  
**Branch:** `feat/eigenlayer-eth-restaking-exposure`

## Goal

Add a read-only MCP snapshot that verifies:

1. token-native exposure in EigenLayer's twelve official legacy Ethereum
   ETH-family LST strategies; and
2. bounded native-restaking diagnostics from `EigenPodManager`.

The snapshot must not fabricate a native-restaked-ETH total, an ETH-equivalent
LST total, unique net ETH locked, a cross-protocol demand total, or a
rehypothecation ratio.

## Official source boundary

The implementation is pinned to EigenLayer's official
`Layr-Labs/eigenlayer-contracts` release `v1.12.0`, commit
`d302f65042164c8d8d0a983c1540d85a8710030b`.

Authoritative source locations:

- `README.md`: current Ethereum mainnet core and legacy strategy deployments.
- `script/configs/mainnet/mainnet-addresses.config.json`: the twelve named
  legacy strategy addresses.
- `src/contracts/interfaces/IStrategy.sol`: `underlyingToken`,
  `totalShares`, and `sharesToUnderlyingView`.
- `src/contracts/interfaces/IStrategyManager.sol`:
  `strategyIsWhitelistedForDeposit` and `delegation`.
- `src/contracts/interfaces/IEigenPodManager.sol`: `numPods`,
  `beaconChainETHStrategy`, and `burnableETHShares`.
- `src/contracts/pods/EigenPodManagerStorage.sol`: the virtual Beacon Chain
  ETH strategy and the absence of a global native-restaked-share total.

Fixed mainnet contracts:

- StrategyManager:
  `0x858646372CC42E1A627fcE94aa7A7033e7CF075A`
- EigenPodManager:
  `0x91E677b07F7AF907ec9a428aafA9fc14a0d3A338`
- DelegationManager:
  `0x39053D51B77DC0d36036Fc1fCc8Cb819df8Ef37A`
- virtual Beacon Chain ETH strategy:
  `0xbeaC0eeEeeeeEEeEeEEEEeeEEeEeeeEeeEEBEaC0`

Fixed legacy ETH-family strategy universe:

| Label | Strategy |
| --- | --- |
| stETH | `0x93c4b944D05dfe6df7645A86cd2206016c51564D` |
| rETH | `0x1BeE69b7dFFfA4E2d53C2a2Df135C388AD25dCD2` |
| cbETH | `0x54945180dB7943c0ed0FEE7EdaB2Bd24620256bc` |
| ETHx | `0x9d7eD45EE2E8FC5482fa2428f15C971e6369011d` |
| ankrETH | `0x13760F50a9d7377e4F20CB8CF9e4c26586c658ff` |
| oETH | `0xa4C637e0F704745D182e4D38cAb7E7485321d059` |
| osETH | `0x57ba429517c3473B6d34CA9aCd56c0e735b94c02` |
| swETH | `0x0Fe4F44beE93503346A3Ac9EE5A26b130a5796d6` |
| wBETH | `0x7CA911E83dabf90C90dD3De5411a10F1A6112184` |
| sfrxETH | `0x8CA7A5d6f3acd3A7A8bC468a8CD0FB14B6BD28b6` |
| lsETH | `0xAe60d8180437b5C34bB956822ac2710972584473` |
| mETH | `0x298aFB19A105D59E74658C4C334Ff360BadE6dd2` |

The addresses are fixed release evidence. Runtime contract state at one
finalized block remains the measurement authority.

## What the snapshot measures

For each fixed legacy strategy:

- current deposit-whitelist flag;
- immutable StrategyManager binding;
- runtime underlying-token address;
- underlying-token decimals;
- extant strategy shares;
- underlying-token balance held by the strategy; and
- `sharesToUnderlyingView(totalShares)`.

The last value is the strategy's token-native accounting conversion for all
extant shares. It is not guaranteed executable withdrawal capacity and is not
ETH-equivalent. Underlying-token custody is retained separately because direct
transfers, rebases, loss, and virtual-share accounting can make custody differ
from the share conversion. Each strategy includes a
`share_quote_exceeds_custody` diagnostic boolean; that condition is observable
evidence, not grounds to discard the snapshot.

For native restaking, the snapshot verifies only:

- the official virtual Beacon Chain ETH strategy identity;
- `EigenPodManager.numPods()`; and
- `EigenPodManager.burnableETHShares()`.

These are diagnostics, not a total native-restaked-ETH balance.

## Why broader totals remain null

`EigenPodManager` stores `podOwnerDepositShares` per owner and does not expose a
global sum. Reconstructing a native total requires durable `PodDeployed` /
share-event indexing plus owner-level state and withdrawal/slashing
reconciliation. A bounded finalized RPC snapshot cannot honestly synthesize
that total.

The twelve LST strategies hold heterogeneous tokens. Adding their native token
units is meaningless, and converting them to ETH requires twelve
protocol-specific exchange-rate contracts with separate provenance and
double-counting analysis.

Therefore these six fields are always `null` with one explicit permanent gap
each:

- `native_restaked_eth_wei`
- `lst_restaked_eth_equivalent_wei`
- `eigenlayer_eth_family_exposure_eth_wei`
- `unique_net_eth_locked`
- `combined_aave_spark_lido_sky_eigenlayer_demand`
- `rehypothecation_ratio`

## Finalized RPC call plan

Each uncached verification uses exactly four JSON-RPC batches and 91 logical
requests:

1. chain id and finalized block: 2 requests;
2. core coherence and native diagnostics: 5 `eth_call` requests;
3. twelve strategy identity/accounting groups:
   `whitelisted`, `strategyManager`, `underlyingToken`, `totalShares` =
   48 `eth_call` requests;
4. twelve strategy evidence groups:
   token `decimals`, token `balanceOf(strategy)`,
   `sharesToUnderlyingView(totalShares)` = 36 `eth_call` requests.

All 89 contract calls use the exact same numeric finalized block tag.
Responses require exact JSON-RPC envelopes, globally unique expected ids,
canonical quantities/hashes, one-word ABI values, zero-padded addresses, and
strict booleans.

## Domain invariants

- The ordered twelve-strategy universe is exact and duplicate-free.
- Core contracts point to the fixed DelegationManager and virtual Beacon
  strategy.
- Every strategy points to the fixed StrategyManager.
- Runtime underlying tokens are nonzero and pairwise distinct.
- Every underlying token returns a canonical ABI `uint8` decimals value. The
  value is preserved per strategy; the protocol interface does not guarantee
  18 decimals.
- All integers are bounded uint256 decimal strings.
- Finalized block number and timestamp are JavaScript-safe integers.
- Token custody and `sharesToUnderlyingView(totalShares)` are preserved as
  separate observations. No ordering or equality is asserted: direct
  transfers, rebases, virtual-share offsets, and strategy-specific accounting
  can make them differ.
- No token-native amounts are summed across heterogeneous LSTs.
- Verified cache insertion happens only after the complete public-domain
  builder accepts the evidence.

## Failure, cache, and credential behavior

- Missing RPC configuration returns `rpc_not_configured` without a request.
- Access, chain, finality, schema, and evidence failures return one bounded gap
  and no partial evidence.
- Cache keys never contain the RPC URL.
- One adapter context is bound to one provider string.
- Verified evidence has a 30-minute TTL, concurrent loads coalesce, and stale
  verified evidence may be returned only after refresh failure.
- The RPC URL and provider error text are never returned, logged, or persisted.

## Public tool

`get_eigenlayer_eth_restaking_exposure` accepts a strict empty object. English
and Korean summaries must call the measured values:

> fixed legacy EigenLayer ETH-family LST strategy token-unit exposure and
> native-restaking diagnostics

They must also state that no native total, ETH-equivalent LST total, unique/net
locked ETH, combined demand, or rehypothecation ratio is measured.

The live test is default-skipped and requires both:

- `RUN_LIVE_EIGENLAYER_ETH_RESTAKING=1`; and
- a nonblank `ETHEREUM_RPC_URL`.

No implementation or QA task runs that live test.
