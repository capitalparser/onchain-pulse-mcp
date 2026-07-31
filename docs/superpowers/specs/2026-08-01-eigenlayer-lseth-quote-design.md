# EigenLayer lsETH ETH Quote Design

**Date:** 2026-08-01
**Branch:** `feat/eigenlayer-lseth-quote`
**Base:** `88805ae4ff834cffb745496f904b4dbc2137faa1`

## Goal

Extend the read-only finalized `get_eigenlayer_lst_eth_quotes` snapshot from
five to six fixed legacy EigenLayer LST strategies by adding only lsETH. The
two resulting ETH-equivalent values remain distinct, bounded
protocol-accounting quotes for the verified strategy share-accounting amount
and strategy-held token custody amount. They are not a full LST or EigenLayer
total, backing reconciliation, or executable redemption capacity.

The fixed covered order is:

```text
stETH, rETH, cbETH, osETH, lsETH, mETH
```

The remaining unquoted strategies are:

```text
ETHx, ankrETH, oETH, swETH, wBETH, sfrxETH
```

## Official Authority and lsETH Semantics

The base fixed strategy universe remains EigenLayer release `v1.12.0`, commit
`d302f65042164c8d8d0a983c1540d85a8710030b`. Its lsETH strategy is
`0xAe60d8180437b5C34bB956822ac2710972584473`; the verified underlying token
is the Liquid Collective mainnet River/LsETH proxy
`0x8c1BEd5b9a0928467c9B1341Da1D7BD5e10b6549`.

Liquid Collective's official `liquid-collective-protocol` release `v1.3.0`,
commit `964f0e363fbaec8955af430888838a1666a1c6ba`, documents that mainnet
River address in `README.md`. Its `ISharesManagerV1` declares
`underlyingBalanceFromShares(uint256)` and `SharesManagerV1` implements it as
`_balanceFromShares`. The implementation returns zero when total shares are
zero; otherwise it returns the exact Solidity integer floor:

```text
shares * assetBalance / totalShares
```

Official source references:

- [v1.3.0 mainnet River deployment](https://github.com/liquid-collective/liquid-collective-protocol/blob/964f0e363fbaec8955af430888838a1666a1c6ba/README.md)
- [ISharesManagerV1 conversion interface](https://github.com/liquid-collective/liquid-collective-protocol/blob/964f0e363fbaec8955af430888838a1666a1c6ba/contracts/src/interfaces/components/ISharesManager.1.sol)
- [SharesManagerV1 floor conversion implementation](https://github.com/liquid-collective/liquid-collective-protocol/blob/964f0e363fbaec8955af430888838a1666a1c6ba/contracts/src/components/SharesManager.1.sol)
- [OracleManagerV1 completed-epoch implementation](https://github.com/liquid-collective/liquid-collective-protocol/blob/964f0e363fbaec8955af430888838a1666a1c6ba/contracts/src/components/OracleManager.1.sol)

The selector is `0xf79c3f02`. The adapter must call it independently for the
base verifier's share-accounting token amount and token-custody token amount,
at the same numeric finalized block. It accepts the direct results as the two
quotes; it must not synthesize a rounded rate or make a separate backing,
asset-balance, or total-share call.

`getLastCompletedEpochId()` is declared by `IOracleManagerV1` and implemented
by `OracleManagerV1` as the stored consensus-layer report epoch. The selector
is `0x89896aef`. The finalized value is published only as
`report_context.lseth_last_completed_epoch_id`; it is not a timestamp,
current-epoch comparison, freshness proof, or withdrawal entitlement.

The River target is a mainnet proxy. This bounded acquisition does not inspect
its current implementation slot or independently prove source-code
correspondence. It also does not reconcile the issuer's backing. Those
limitations stay explicit permanent gaps.

## Exact Finalized Acquisition

The existing fresh-only EigenLayer verifier produces 91 logical requests in
four batches. The sixth-token quote layer then sends exactly one twelve-call
batch at the same numeric finalized tag:

| IDs | Call |
| --- | --- |
| 92-93 | rETH `getEthValue(uint256)` for two independent amounts |
| 94 | cbETH `exchangeRate()` |
| 95-96 | osETH controller `convertToAssets(uint256)` for two amounts |
| 97-98 | Mantle Staking `mETH()` / `oracle()` binding checks |
| 99-100 | Mantle Staking `mETHToETH(uint256)` for two amounts |
| 101-102 | River `underlyingBalanceFromShares(uint256)` for lsETH share/custody amounts |
| 103 | River `getLastCompletedEpochId()` report context |

Thus a cold load is exactly five JSON-RPC batches, 103 logical requests, 101
`eth_call` requests, and contiguous IDs 1--103. All contract calls use the
same numeric finalized block tag. Missing, malformed, mismatched, or failed
base/direct/report-context evidence returns atomic unavailable output with no
partial block, quote, metric, coverage, or context.

## Public Contract and Boundaries

The methodology/cache revision is
`eigenlayer-covered-lst-eth-quotes-v3` / `eigenlayer-lst-eth-quotes:mainnet-v3`.
The sole cache stores only complete verified combined six-token evidence for
30 minutes; stale fallback is allowed only from that complete v3 evidence.
It never reads the public base cache or accepts a stale base snapshot.

lsETH uses quote kind `liquid_collective_river_direct_share_quote` and trust
basis `liquid_collective_oracle_reported_accounting`. Its report context does
not prove report freshness. In addition to the existing gaps, every verified
snapshot has exactly one of each:

- `lseth_oracle_report_freshness_not_verified`;
- `lseth_proxy_upgradeability_not_verified`; and
- `lseth_backing_not_reconciled`.

The two partial aggregate fields remain the only non-null aggregate metrics.
The seven broader totals remain `null`: full LST ETH equivalent, native
restaked ETH, ETH-family exposure, unique/net lockup, combined demand,
rehypothecation, and executable withdrawal capacity.

## Non-goals

- Quote another strategy or call an L2/market endpoint.
- Infer current report freshness from an epoch number alone.
- Verify proxy implementation, issuer backing, liquidity, or redemption.
- Sum partial quotes into a full LST/native/EigenLayer total.
- Add caller RPC input, persistence, advice, writes, or default live calls.
