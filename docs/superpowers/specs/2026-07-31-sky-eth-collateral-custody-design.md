# Sky ETH Collateral Adapter Custody Design

## Goal

Add a bounded, read-only Ethereum Execution RPC verifier for the legacy
Maker/Sky ETH-family collateral tokens physically held by six Chainlog-listed
GemJoin adapters at one finalized block:

- `ETH-A`, `ETH-B`, and `ETH-C`;
- `WSTETH-A` and `WSTETH-B`;
- `RETH-A`.

The measurement is adapter-held token custody. It is not the sum of active
Vault `ink`, actual user collateral usage, unique net ETH locked, a combined
Aave/Spark/Lido/Sky demand total, or a rehypothecation ratio.

## Official Sources and Authority

The runtime authority is the governance-managed Ethereum mainnet Chainlog:

- Chainlog: `0xdA0Ab1e0017DEbCd72Be8599041a2aa3bA7e740F`
- Network: Ethereum mainnet, chain id `1`

The implementation is based on these official source snapshots:

- Sky `dss-chain-log` commit
  `2eaea03e7ebd8db563eea003272094a5b5bc9ce5`;
- Sky `dss-gem-joins` commit
  `06df176390860ed48caf4a2a63c0905e2d5415c1`;
- Lido core commit
  `17005714f151e5502c559932319a3f2f74ac2436`;
- Rocket Pool commit
  `fef41a4f7cf99d7d66313c0ba04deb8ba2dabf88`.

The current Chainlog API snapshot is documentation evidence only. Every live
measurement resolves the following keys on-chain at the selected finalized
block:

- `MCD_VAT`, `ETH`, `WSTETH`, and `RETH`;
- `MCD_JOIN_ETH_A`, `MCD_JOIN_ETH_B`, `MCD_JOIN_ETH_C`;
- `MCD_JOIN_WSTETH_A`, `MCD_JOIN_WSTETH_B`, `MCD_JOIN_RETH_A`.

The three token addresses must remain the official WETH, wstETH, and rETH
addresses. Each join must independently report the resolved Vat, expected ilk,
expected token, 18 decimals, and a canonical `live` value of zero or one.

References:

- [Official Chainlog contract](https://github.com/sky-ecosystem/dss-chain-log/blob/2eaea03e7ebd8db563eea003272094a5b5bc9ce5/src/ChainLog.sol)
- [Official GemJoin implementations](https://github.com/sky-ecosystem/dss-gem-joins/tree/06df176390860ed48caf4a2a63c0905e2d5415c1/src)
- [Maker Vat accounting documentation](https://docs.makerdao.com/smart-contract-modules/core-module/vat-detailed-documentation)
- [Pinned Lido WstETH source](https://github.com/lidofinance/core/blob/17005714f151e5502c559932319a3f2f74ac2436/contracts/0.6.12/WstETH.sol)
- [Pinned Rocket Pool rETH source](https://github.com/rocket-pool/rocketpool/blob/fef41a4f7cf99d7d66313c0ba04deb8ba2dabf88/contracts/contract/token/RocketTokenRETH.sol)

## Finalized Read Plan

One uncached verification uses four JSON-RPC batch rounds:

1. `eth_chainId` and `eth_getBlockByNumber("finalized", false)`;
2. ten Chainlog `getAddress(bytes32)` calls at that exact block tag;
3. for each of six resolved joins, `vat()`, `ilk()`, `gem()`, `dec()`,
   `live()`, and the resolved token's `balanceOf(join)`, all at the same tag;
4. call wstETH `getStETHByWstETH(totalWstethCustody)` and rETH
   `getEthValue(totalRethCustody)` at that tag.

This is four batches and 50 logical requests. Direct aggregate-amount
conversion calls avoid multiplying by an already rounded one-token rate.

Every response must use a canonical JSON-RPC envelope and unique expected id.
Quantities must be canonical, hashes exact, scalar ABI results exactly one
32-byte word, address words left-zero-padded, and all block-bound calls must
use the same numeric finalized block tag. Any missing, extra, reverted,
malformed, mixed, or unreconciled response invalidates the whole Snapshot.

## Measurement and Identities

For each ilk, report the exact raw ERC-20 balance physically held by its
Chainlog-resolved join. Aggregate those balances into three token buckets.

```text
WETH quoted ETH wei = total WETH custody raw
wstETH quoted ETH wei = getStETHByWstETH(total wstETH custody raw)
rETH quoted ETH wei = getEthValue(total rETH custody raw)

Sky ETH-family quoted custody
= WETH quoted ETH wei
+ wstETH quoted ETH wei
+ rETH quoted ETH wei
```

All balances, quotes, and sums use `bigint` internally and canonical uint256
decimal strings publicly. The domain layer recomputes the raw per-asset sums
and final quoted-custody sum. It rejects overflow, impossible addresses,
duplicate/missing ilks, mismatched join metadata, or fabricated totals.

GemJoin transfers external tokens into the adapter while crediting the Vat.
However, an adapter token balance can include free internal collateral and
direct token transfers, while active Vault collateral lives in per-urn `ink`.
The Vat exposes aggregate normalized debt as `Ilk.Art`, not aggregate `ink`.
Therefore adapter custody must not be relabeled as active Vault collateral.

## Public Snapshot

Register a separate strict-empty tool:

```text
get_sky_eth_collateral_custody({})
```

Verified output contains:

- one finalized block;
- the resolved Vat, tokens, and six joins;
- six exact per-ilk raw custody balances and join live flags;
- three exact token custody buckets and their quoted ETH wei values;
- the exact summed Sky ETH-family quoted adapter custody.

These broader metrics always remain `null`:

- `active_vault_collateral_eth`;
- `actual_user_collateral_eth`;
- `unique_net_eth_locked`;
- `combined_aave_spark_lido_sky_demand`;
- `rehypothecation_ratio`.

Verified Snapshots contain exactly one permanent gap for each unknown.
Unavailable Snapshots contain no block, resolved contracts, joins, buckets,
identity claims, or observed metrics.

## Cache, Failure, and Credential Boundary

- Cache only fully verified normalized evidence for 30 minutes.
- Coalesce concurrent loads.
- A refresh failure may return only previously verified stale evidence with a
  controlled `source_stale` gap.
- Bind one adapter context to one RPC URL without putting the URL in cache
  keys.
- Return only bounded failure codes. Never return, log, persist, or cache-key
  `ETHEREUM_RPC_URL` or provider error text.
- Default tests never make a network call.
- Live verification requires both `RUN_LIVE_SKY_ETH_CUSTODY=1` and a nonblank
  `ETHEREUM_RPC_URL`.

## Non-Goals

- enumerating Vat urns or replaying Vault events;
- claiming adapter balances equal active Vault collateral;
- interpreting `Vat.ilks().Art` as collateral;
- including ETH-bearing LP tokens or non-direct ETH-family ilks;
- deduplicating wstETH or rETH backing against Lido, Rocket Pool, lending
  markets, bridges, or other protocols;
- historical indexing, pricing, recommendations, or valuation language;
- changing existing Aave, Spark, Lido, fee, Beacon, Dune, or GrowThePie
  behavior.
