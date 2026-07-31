# EigenLayer swETH quote v5 design

## Scope

Extend the fixed, legacy EigenLayer LST quote subset from seven to eight entries:
`stETH,rETH,cbETH,ETHx,osETH,swETH,lsETH,mETH`. This is a bounded finalized-block
accounting quote, not a full EigenLayer, backing, freshness, or demand measure.

## Authority and identity boundary

The strategy identity is constrained only by the existing fixed legacy EigenLayer
universe and finalized base-verifier binding. swETH is strategy
`0x0Fe4F44beE93503346A3Ac9EE5A26b130a5796d6`, token proxy
`0xf951E335afb289353dc249e82926178EaC7DEd78`, and base index `7`.

Official Swell [`v3-core-public` commit
`5827c4f1294b00f2939e582b1d3ac448f87fa218`](https://github.com/SwellNetwork/v3-core-public/tree/5827c4f1294b00f2939e582b1d3ac448f87fa218)
establishes the selector semantics. Official [`Pendle-Market-Deployment` commit
`2036c371dceff085b2eb30a8e06b13819d4a835b`](https://github.com/SwellNetwork/Pendle-Market-Deployment/tree/2036c371dceff085b2eb30a8e06b13819d4a835b)
corroborates the token address only. Neither that repository nor Etherscan is
authority for an EigenLayer pair.

## Finalized evidence

At the one numeric finalized block tag, append logical IDs 112 and 113 after
the existing 1--111 sequence:

| ID | Target | Selector | Meaning |
|---:|---|---|---|
| 112 | swETH token proxy | `swETHToETHRate()` / `0xd68b2cb6` | stored WAD rate, or `1e18` if storage is zero |
| 113 | swETH token proxy | `lastRepriceUNIX()` / `0xfbda759b` | reprice timestamp, report context only |

The cold contract is five batches `[2,5,48,36,22]`, 113 logical requests, 111
`eth_call`s, and contiguous IDs. Decode each as exactly one uint256 word. The
rate must be nonzero. Timestamp may not exceed finalized-block timestamp; if it
is zero, rate must be `1e18`. There is deliberately no freshness cutoff.

`sweth_to_eth_rate_wei` is retained only on the swETH quote. The timestamp is
retained only in `report_context.sweth_last_reprice_unix`.

## Quote arithmetic and output boundary

For both independent fixed amounts, compute
`floor(amount * rate / 10**18)`. The product may exceed uint256; reject only if
the final floor result or a final aggregate exceeds uint256. Direct quote fields
and cbETH rate material are invalid for swETH.

Exactly two partial aggregates remain non-null. All broader metrics remain
`null`. Unquoted labels become `ankrETH,oETH,wBETH,sfrxETH`.

## Permanent limitations

Add exactly these permanent gaps: `sweth_reprice_freshness_not_verified`,
`sweth_proxy_upgradeability_not_verified`, and `sweth_backing_not_reconciled`.
The v5 total is 22. Summaries must distinguish: cbETH rate freshness; ETHx
report freshness versus proxy correspondence; osETH virtual-reward-input
freshness; swETH reprice freshness versus proxy correspondence; lsETH report
freshness versus proxy correspondence; and mETH oracle-record freshness.
