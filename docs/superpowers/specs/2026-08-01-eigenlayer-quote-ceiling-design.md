# EigenLayer 9-of-12 Quote Ceiling Design

**Date:** 2026-08-01
**Branch:** `feat/eigenlayer-quote-ceiling`
**Base:** `4c56dbb8a055528d76ab69de245aa5f06d2f0fd1`

## Contract

The read-only `get_eigenlayer_lst_eth_quotes` snapshot remains mechanically
limited to exactly 9 of 12 fixed legacy EigenLayer strategies. The v7 public
methodology is `eigenlayer-covered-lst-eth-quotes-v7`, and the sole combined
cache key is `eigenlayer-lst-eth-quotes:mainnet-v7`; v6 snapshots and cache
entries are outside the current contract.

Verified coverage carries this immutable ordered blocker tuple. Each detail is
at most 240 characters and the corresponding permanent gap has the identical
code and detail:

1. `ankrETH` — `ankreth_official_immutable_source_and_freshness_not_verified`.
   Pinned mutable official docs do not verify an official immutable Ankr source
   or deployment artifact, same-finalized proxy-to-source binding, or ratio
   freshness getter.
2. `wBETH` — `wbeth_official_immutable_source_proxy_and_freshness_not_verified`.
   The official EigenLayer strategy and BNB Chain token address are known, and
   deployed-source semantics indicate WAD-floor conversion. Pinned evidence does
   not verify an issuer-owned immutable source/release, same-finalized official
   proxy-to-implementation source binding, or timestamp/epoch freshness getter.
   Privileged offchain rate, backing, redemption, and market price remain
   distinct: NO-GO.
3. `sfrxETH` — `sfrxeth_quote_terminates_in_frxeth_not_eth`.
   Official Frax ERC-4626 `convertToAssets` returns frxETH wei; without a direct
   official frxETH-to-ETH accounting view, the quote terminates in frxETH, not
   ETH: fail-closed NO-GO.

Every successful snapshot has exactly 29 permanent gaps: the preceding 26
boundaries plus these three ceiling codes. Unavailable output remains atomic
and has `coverage: null`.

## Source pins

- EigenLayer's immutable `v1.12.0` strategy table is pinned to
  [`d302f65042164c8d8d0a983c1540d85a8710030b`](https://github.com/Layr-Labs/eigenlayer-contracts/blob/d302f65042164c8d8d0a983c1540d85a8710030b/README.md#L52-L65);
  it is the fixed legacy-strategy authority for all three unquoted entries.
- [Ankr's redemption-price oracle documentation](https://www.ankr.com/docs/staking-for-developers/oracles/redemption-price-oracle/)
  is official but mutable documentation; the pinned evidence does not verify an
  immutable source/deployment release or the required finalized proxy/source and
  freshness evidence.
- [BNB Chain's wBETH announcement](https://www.bnbchain.org/en/blog/new-wrapped-beth-is-now-available-on-bnb-chain)
  is the official BNB Chain token-address reference; the pinned evidence does not
  verify an issuer-owned immutable source/release or same-finalized
  proxy-to-implementation binding.
- Frax's immutable [`sfrxETH.sol` source at `018eaf4daf0eb5ca94dfbb275d3fa59008ea829e`](https://github.com/FraxFinance/frxETH-public/blob/018eaf4daf0eb5ca94dfbb275d3fa59008ea829e/src/sfrxETH.sol)
  and Solmate's [`ERC4626.sol` at `9f16db2144cc9a7e2ffc5588d4bf0b66784283bd`](https://github.com/transmissions11/solmate/blob/9f16db2144cc9a7e2ffc5588d4bf0b66784283bd/src/mixins/ERC4626.sol)
  establish that `convertToAssets` returns the ERC-4626 asset unit: here,
  frxETH wei, not an ETH accounting quote.

## Acquisition Boundary

No RPC acquisition changes accompany v7. A cold load remains exactly five
JSON-RPC batches, 119 logical requests, 117 `eth_call` requests, and contiguous
IDs 1--119 at one finalized block tag. ID 119 remains the final OETH context
call; no RPC calls, batches, or call shapes are added for this ceiling.

## Non-goals

- Quote ankrETH, wBETH, or sfrxETH as ETH without the missing evidence.
- Treat WAD-floor semantics, privileged offchain rates, backing, redemption, or
  market price as interchangeable evidence.
- Add live, paid, caller-supplied, or write-capable access.
