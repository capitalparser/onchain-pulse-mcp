# EigenLayer osETH and mETH ETH Quotes Design

**Date:** 2026-07-31
**Base:** `38abf4c0328216d0719e69b8e79f5a79d68547a4`
**Branch:** `feat/eigenlayer-oseth-meth-quotes`

## Goal

Extend the existing read-only `get_eigenlayer_lst_eth_quotes` finalized
Ethereum-RPC snapshot from three to five directly quoted fixed EigenLayer LST
strategies. The quoted fixed-order subset is exactly:

```text
stETH, rETH, cbETH, osETH, mETH
```

The two non-null aggregates remain independent, explicitly partial
protocol-accounting ETH-equivalent views for those five strategies only:

- `covered_share_accounting_eth_equivalent_wei`; and
- `covered_token_custody_eth_equivalent_wei`.

This change does not create an EigenLayer total, unique/net ETH locked figure,
issuer-backing reconciliation, liquidity measure, or executable withdrawal
claim.

## Existing EigenLayer Authority and Fixed Coverage

The existing shared fresh-only EigenLayer verifier remains the only authority
for the finalized block, base strategy identities, 18-decimal checks, strategy
share-accounting token amounts, and strategy token-custody amounts. It is the
uncached verifier in `eigenlayer_eth_restaking_rpc.ts`; the v2 quote adapter
must never read the base public cache or accept its stale fallback.

The complete fixed legacy strategy order remains:

```text
stETH, rETH, cbETH, ETHx, ankrETH, oETH, osETH, swETH, wBETH, sfrxETH, lsETH, mETH
```

The public `covered_quotes` order is a fixed filtered subset, not a reordered
base universe:

```text
stETH, rETH, cbETH, osETH, mETH
```

The exact remaining unquoted labels are:

```text
ETHx, ankrETH, oETH, swETH, wBETH, sfrxETH, lsETH
```

Missing, duplicate, substituted, reordered, non-18-decimal, stale-base, or
otherwise incoherent covered evidence invalidates the full quote snapshot. No
other covered quote, amount, block, identity, or partial sum may leak from an
unavailable result.

## Commit-Pinned Quote Authorities

The following supplied, official source pins define the bounded quote
semantics. They are source authority for this design; this slice performs no
network or live RPC operation.

### osETH / StakeWise v3

- StakeWise `v3-core` release `v5.0.1`, commit
  `fc70cbe1b3d41bc5f78434830d837aa270ca33bc`.
- osETH token: `0xf1C9acDc66974dFB6dEcB12aA385b9cD01190E38`.
- osTokenVaultController:
  `0x2A261e60FB14586B474C208b1B7AC6D0f5000306`.
- PriceFeed: `0x8023518b2192FB5384DAdc596765B3dD1cdFe471`.
- PriceFeed `osTokenVaultController()` / `0xabed451d` is a source-pinned
  documentary corroboration of the controller relationship. It is not a
  runtime RPC call: the direct non-proxy controller address is pinned by the
  official v5.0.1 deployment/source and omitting this optional binding is what
  preserves the exact bounded request budget below.
- Direct amount calls to the verified controller:
  `convertToAssets(uint256)` / `0x07a2d13a`, one call for the aggregate
  share-accounting amount and one separately for the aggregate token-custody
  amount.

For each osETH amount, the direct controller result is the quote. It is a
StakeWise v3 protocol-accounting conversion, not a claim that the amount is
independently backed or currently executable for withdrawal. The controller's
accounting includes keeper-set virtual rewards. This bounded call does not
prove the freshness of those reward inputs, reconcile backing, or prove an exit
path.

### mETH / Mantle LSP

- Mantle `mantle-lsp/contracts` release `v1.4.1`, commit
  `bbc4e8bf7d3e3b4ca0c5be07aba409ac66611c76`.
- mETH token: `0xd5F7838F5C461fefF7FE49ea5ebaF7728bB0ADfa`.
- Staking proxy: `0xe3cBd06D7dadB3F4e6557bAb7EdD924CD1489E8f`.
- Oracle: `0x8735049F496727f824Cc0f2B174d826f5c408192`.
- Staking binding calls, each at the same finalized block:
  - `mETH()` / `0x29e84867`, which must return the pinned mETH token; and
  - `oracle()` / `0x7dc0d1d0`, which must return the pinned Oracle.
- Direct amount calls to the verified Staking proxy:
  `mETHToETH(uint256)` / `0x5890c11c`, separately for the aggregate
  share-accounting amount and the aggregate token-custody amount.

The mETH direct result must be treated as the exact floor calculation
`mulDiv(amount, totalControlled, totalSupply)` for that one input. Do not
derive either aggregate from a rounded one-token rate, and do not introduce a
separate total-controlled or total-supply call. The Staking proxy is
upgradeable; the Oracle report record has no independently established
freshness in this bounded acquisition. The result is Mantle
protocol-accounting, not independently reconciled backing, executable
liquidity, or withdrawal capacity.

## Exact Finalized Acquisition

One uncached v2 acquisition has exactly five HTTP JSON-RPC batches:

1. the existing shared fresh-only EigenLayer verifier's four batches: 91
   logical requests, including 89 `eth_call` requests; then
2. one nine-call quote batch at the exact numeric finalized block from the
   verified base snapshot:
   - IDs 92–93: rETH `getEthValue(uint256)` for the share-accounting and
     custody amounts;
   - ID 94: cbETH `exchangeRate()`;
   - IDs 95–96: pinned StakeWise controller `convertToAssets(uint256)` for
     the share-accounting and custody amounts;
   - ID 97: Mantle Staking `mETH()` binding;
   - ID 98: Mantle Staking `oracle()` binding; and
   - IDs 99–100: verified Mantle Staking `mETHToETH(uint256)` for the
     share-accounting and custody amounts.

Thus the cold path is exactly five batches, 100 logical requests, 98
`eth_call` requests, and IDs 1–100. The 98 contract calls all use the same
numeric finalized block tag. The PriceFeed selector remains documented source
authority but is intentionally absent from this runtime request map.

## Intended v2 Public Contract

All contract calls must use the same numeric finalized block tag, every batch
must use exact canonical JSON-RPC envelopes, and all request IDs must be unique
and contiguous. The domain must use `bigint` and canonical uint256 decimal
strings only. It must preserve:

- independent share-accounting and custody token amounts and ETH quotes;
- the exact five covered identities and 18-decimal verification;
- direct aggregate rETH, osETH, and mETH quote results rather than rounded
  one-token rates;
- exact cbETH floor arithmetic from one nonzero exchange rate;
- recomputed five-token partial sums; and
- `methodology: "eigenlayer-covered-lst-eth-quotes-v2"` and a v2-only cache
  key.

The five quote kinds and trust bases must make issuer/protocol authority
explicit:

| Label | Quote kind | Trust basis |
| --- | --- | --- |
| stETH | `steth_token_wei_identity_quote` | `lido_pooled_eth_accounting` |
| rETH | `rocket_pool_direct_aggregate_quote` | `rocket_pool_network_accounting` |
| cbETH | `coinbase_oracle_accounting_quote` | `coinbase_oracle_controlled_rate` |
| osETH | `stakewise_v3_direct_controller_quote` | `stakewise_v3_keeper_reward_accounting` |
| mETH | `mantle_staking_direct_oracle_quote` | `mantle_oracle_reported_accounting` |

## Cache, Availability, and Public Boundary

The quote adapter owns one sole verified-only, combined 30-minute v2 cache.
It coalesces concurrent cold loads and binds a context to one internal RPC URL
without exposing that URL or using it in a cache key. It may return controlled
stale data only when a refresh fails after a complete, previously verified
five-token combined snapshot exists. It must never accept a stale base
snapshot, stale partial evidence, public base-cache evidence, malformed
responses, or any failed/partial new acquisition. A returned stale snapshot
adds exactly one `source_stale` gap.

The public MCP tool stays strict-empty-input and uses only the server's
internal `ETHEREUM_RPC_URL`. It must reject caller-provided transport material
and must never publish provider URLs, provider error text, raw response bodies,
or credentials. EN and KO verified, stale, and unavailable summaries must be
at most 500 characters and explicitly say that this is 5-of-12 direct
protocol-accounting partial coverage plus the denials below.

Default tests make no network request. The live test remains opt-in only when
both `RUN_LIVE_EIGENLAYER_LST_ETH_QUOTES=1` and a nonblank
`ETHEREUM_RPC_URL` are present; this design neither performs nor authorizes a
live execution.

## Permanent Gaps and Null Boundaries

Verified v2 snapshots require exactly one of each permanent gap:

- `lst_quote_coverage_partial` — five of twelve fixed strategies are quoted;
- `cbeth_exchange_rate_freshness_not_verified` — no bounded timestamp proof
  for the Coinbase rate;
- `oseth_virtual_rewards_freshness_not_verified` — no independent freshness
  proof for keeper-set virtual-reward inputs;
- `oseth_backing_not_reconciled` — controller accounting is not an independent
  backing reconciliation;
- `meth_oracle_record_freshness_not_verified` — no independent freshness proof
  for the Mantle Oracle report record;
- `meth_backing_not_reconciled` — Oracle accounting is not an independent
  backing reconciliation;
- the existing absent-native, absent-full-LST, absent-ETH-family,
  unique/net-not-reconciled, combined-demand-not-reconciled, and
  rehypothecation-not-measured gaps; and
- `executable_withdrawal_capacity_not_measured` — no quote establishes an
  executable redemption, exit, or withdrawal capacity.

The seven broader metrics remain `null`:

```text
lst_restaked_eth_equivalent_wei
native_restaked_eth_wei
eigenlayer_eth_family_exposure_eth_wei
unique_net_eth_locked
combined_aave_spark_lido_sky_eigenlayer_demand
rehypothecation_ratio
executable_withdrawal_capacity_eth_wei
```

## Non-Goals

- Quote the seven unquoted strategies or represent the five quotes as a
  twelve-strategy total.
- Derive native restaked ETH, full LST ETH-equivalent exposure, unique/net
  locked ETH, combined protocol demand, or rehypothecation.
- Reconcile issuer backing, validate report/reward freshness, prove liquidity,
  withdrawals, exits, or redemption execution.
- Add market pricing, historical indexing, advice, write actions, caller RPC
  configuration, credentials, or live execution.
