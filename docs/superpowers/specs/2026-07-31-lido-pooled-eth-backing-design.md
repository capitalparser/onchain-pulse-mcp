# Lido Pooled ETH Backing Design

## Goal

Add a bounded, read-only Ethereum Execution RPC verifier for the Lido stETH
accounting state at one finalized block. The verifier reports protocol-level
pooled ETH backing, its internal/external split, the internal balance
components, and total/internal/external shares.

It does not report all Ethereum native stake, unique ETH locked, DeFi
collateral usage, a combined Aave/Spark/Lido total, or a rehypothecation ratio.

## Official Contract and Version

The implementation is pinned to the official Lido core `v4.0.0` source commit
[`17005714f151e5502c559932319a3f2f74ac2436`](https://github.com/lidofinance/core/tree/17005714f151e5502c559932319a3f2f74ac2436),
dated 2026-07-24, and its `deployed-mainnet.json`.

- Lido and stETH proxy:
  `0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84`
- Lido implementation at the pinned deployment:
  `0x028271E30a695c0527A0C50cA30603feD004cDb0`
- Network: Ethereum mainnet, chain id `1`

The proxy address is the read target. The implementation address is provenance,
not a second RPC target.

References:

- [Official mainnet deployments](https://docs.lido.fi/deployed-contracts/)
- [Official Lido contract documentation](https://docs.lido.fi/contracts/lido/)
- [Pinned Lido.sol](https://github.com/lidofinance/core/blob/17005714f151e5502c559932319a3f2f74ac2436/contracts/0.4.24/Lido.sol)
- [Pinned StETH.sol](https://github.com/lidofinance/core/blob/17005714f151e5502c559932319a3f2f74ac2436/contracts/0.4.24/StETH.sol)

## Finalized Read Plan

One uncached verification uses two JSON-RPC batch rounds and nine logical
requests:

1. `eth_chainId` and `eth_getBlockByNumber("finalized", false)`;
2. seven `eth_call` requests to the Lido/stETH proxy at that exact hexadecimal
   finalized block tag:
   - `totalSupply()` — `0x18160ddd`;
   - `getTotalPooledEther()` — `0x37cfdaca`;
   - `getTotalShares()` — `0xd5002f2e`;
   - `getExternalEther()` — `0xe16a9065`;
   - `getExternalShares()` — `0x63021d8b`;
   - `getBufferedEther()` — `0x47b714e0`;
   - `getBalanceStats()` — `0x38ac3c55`.

Every response must use a canonical JSON-RPC envelope and unique expected id.
Scalar calls must return exactly one 32-byte word. `getBalanceStats()` must
return exactly four words. Missing, extra, malformed, reverted, mixed-block, or
non-mainnet evidence invalidates the complete Snapshot.

## Accounting Identities

The pinned Lido source defines:

```text
internal ether
= buffered ether
+ CL validator balance at last report
+ CL pending balance at last report
+ deposited since last report

internal shares = total shares - external shares

external ether
= floor(external shares * internal ether / internal shares)

total pooled ether = internal ether + external ether
totalSupply() = total pooled ether
```

The verifier recomputes all identities with `bigint`. It also requires:

- positive total pooled ether and total shares;
- external shares strictly below total shares;
- external ether not greater than total pooled ether;
- buffered ether not greater than internal ether;
- `depositedForCurrentReport <= depositedSinceLastReport`.

No JavaScript floating-point value is used for balances or shares.

## Public Snapshot

Register a separate strict-empty tool:

```text
get_lido_pooled_eth_backing({})
```

Verified metrics are canonical decimal strings:

- `total_pooled_eth_wei`
- `internal_pooled_eth_wei`
- `external_pooled_eth_wei`
- `buffered_eth_wei`
- `cl_validators_balance_at_last_report_wei`
- `cl_pending_balance_at_last_report_wei`
- `deposited_since_last_report_wei`
- `deposited_for_current_report_wei`
- `steth_total_supply_wei`
- `total_shares`
- `internal_shares`
- `external_shares`

The following broader metrics are always `null`:

- `all_ethereum_native_staked_eth`
- `unique_net_eth_locked`
- `defi_eth_collateral`
- `combined_aave_spark_lido_demand`
- `rehypothecation_ratio`

Verified Snapshots always carry one gap for each broader unknown. Unavailable
Snapshots contain no block, accounting state, identities, or observed metrics.

## Cache, Failure, and Credential Boundary

- Cache only fully verified normalized evidence for 30 minutes.
- Coalesce concurrent loads.
- A refresh failure may return only previously verified stale evidence with a
  controlled `source_stale` gap.
- Bind one adapter context to one RPC URL without putting the URL in cache keys.
- Return only bounded failure codes. Never return, log, persist, or cache-key
  `ETHEREUM_RPC_URL` or provider error text.
- Default tests never make a network call.
- Live verification requires both `RUN_LIVE_LIDO_BACKING=1` and a nonblank
  `ETHEREUM_RPC_URL`.

## Non-Goals

- estimating total Ethereum staking;
- claiming all pooled ether is currently on the Consensus Layer;
- deduplicating Lido with Aave, Spark, bridges, or other protocols;
- enumerating stETH holders or downstream collateral positions;
- historical indexing, pricing, recommendations, or valuation language;
- changing existing Aave, Spark, fee, Beacon, Dune, or GrowThePie behavior.
